import { defineStore } from 'pinia'
import { ApiError, isRetryableApiError } from '@/api/client'
import { pushSyncBatch, type SyncChange, type SyncPushResult } from '@/api/sync'
import { SYNC_CONFLICT_COPY } from '@/constants/copy'
import {
  deleteMeta,
  getFeedingRecordCache,
  getGrowthRecordCache,
  getMeta,
  setMeta,
} from '@/db'
import {
  deferOutbox,
  listOutbox,
  listSyncableOutbox,
  markOutboxFailed,
  removeOutbox,
} from '@/db/outbox'
import { useBabyStore } from '@/stores/baby'
import { useFeedingStore } from '@/stores/feeding'
import { useGrowthStore } from '@/stores/growth'
import { useUiStore } from '@/stores/ui'
import type {
  AmountUnit,
  Baby,
  BreastSide,
  FeedingRecord,
  FeedingTag,
  FeedingType,
  GrowthRecord,
  OutboxItem,
  SyncEntityType,
} from '@/types/models'
import {
  toLocalDateString,
  toOffsetISOString,
  tzOffsetMinutes,
} from '@/utils/date'
import {
  getStorageItem,
  removeStorageItem,
  setStorageItem,
} from '@/utils/storage'
import { uuidV4 } from '@/utils/uuid'

export const SYNC_LOCK_KEY = 'zz.bf.syncLock'
const SYNC_LOCK_TTL_MS = 20_000
const SYNC_LOCK_NAME = 'zz.bf.syncLock'
const BATCH_SIZE = 50
const MAX_BATCH_ROUNDS = 10
/** 1s, 2s, 5s, 15s, 60s, 5min（±20% jitter，契约 §5.4） */
const RETRY_DELAYS_MS = [1000, 2000, 5000, 15000, 60000, 300000]
/**
 * 批次幂等（契约 §4.10 / §5.4）：每次新尝试生成新 batchId，
 * 同一批的网络重试必须复用原 batchId 才能命中服务端 24h 缓存。
 */
const SYNC_BATCH_PLAN_META_KEY = 'sync.batchPlan'

interface SyncBatchPlan {
  batchId: string
  /** 随批次固化：服务端对含 clientTime 的完整请求体做哈希，重试必须逐字节一致 */
  clientTime: string
  keys: string[]
  fingerprint: string
}

export type SyncRunStatus = 'ok' | 'offline' | 'busy' | 'error'

export interface SyncRunOutcome {
  status: SyncRunStatus
  applied: number
  duplicate: number
  conflict: number
  rejected: number
  pending: number
  message?: string
}

/** 每个 store 实例自己的单飞（测试/多 Pinia 实例互不影响） */
const inflightSyncs = new WeakMap<object, Promise<SyncRunOutcome>>()

function emptyOutcome(status: SyncRunStatus, pending = 0, message?: string): SyncRunOutcome {
  return { status, applied: 0, duplicate: 0, conflict: 0, rejected: 0, pending, message }
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

function retryAtIso(item: OutboxItem, minDelayMs = 0): string {
  const base = RETRY_DELAYS_MS[Math.min(item.attemptCount, RETRY_DELAYS_MS.length - 1)]
  const jitter = base * (0.8 + Math.random() * 0.4)
  return new Date(Date.now() + Math.max(jitter, minDelayMs)).toISOString()
}

function toChange(item: OutboxItem): SyncChange {
  const change: SyncChange = {
    entityType: item.entityType,
    op: item.op,
    id: item.entityId,
    baseRevision: item.baseRevision,
  }
  if (item.data) change.data = item.data
  return change
}

/** FNV-1a，仅用于比较批次请求体是否变化，不做安全用途 */
function hashString(input: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16)
}

function batchFingerprint(changes: SyncChange[]): string {
  return hashString(JSON.stringify(changes))
}

/**
 * 选择本批要推送的记录：
 * - 若上次请求因网络/5xx 失败且待推送内容完全未变，复用原 batchId（服务端返回缓存，避免重复处理）；
 * - 内容有任何变化（编辑、删除、新增）则视为新尝试，生成新 batchId。
 */
async function planBatch(
  available: OutboxItem[],
  nowIso: string,
): Promise<{ batchId: string; clientTime: string; items: OutboxItem[] } | null> {
  const plan = await getMeta<SyncBatchPlan>(SYNC_BATCH_PLAN_META_KEY)
  if (plan) {
    const byKey = new Map(available.map((item) => [item.key, item]))
    const items = plan.keys
      .map((key) => byKey.get(key))
      .filter((item): item is OutboxItem => Boolean(item))
    const intact =
      items.length === plan.keys.length &&
      items.length > 0 &&
      items.length <= BATCH_SIZE &&
      batchFingerprint(items.map(toChange)) === plan.fingerprint
    if (intact) return { batchId: plan.batchId, clientTime: plan.clientTime, items }
    await deleteMeta(SYNC_BATCH_PLAN_META_KEY)
  }

  const items = available
    .filter((item) => item.nextRetryAt <= nowIso)
    .slice(0, BATCH_SIZE)
  if (items.length === 0) return null
  const batchId = uuidV4()
  const clientTime = toOffsetISOString()
  await setMeta(SYNC_BATCH_PLAN_META_KEY, {
    batchId,
    clientTime,
    keys: items.map((item) => item.key),
    fingerprint: batchFingerprint(items.map(toChange)),
  })
  return { batchId, clientTime, items }
}

interface NavigatorLocks {
  request<T>(
    name: string,
    options: { ifAvailable?: boolean },
    callback: (lock: unknown) => Promise<T>,
  ): Promise<T>
}

function acquireFallbackLock(): (() => void) | null {
  const now = Date.now()
  const raw = getStorageItem(SYNC_LOCK_KEY)
  if (raw) {
    const stored = Number(raw)
    if (Number.isFinite(stored) && now - stored < SYNC_LOCK_TTL_MS) return null
  }
  const token = String(now)
  setStorageItem(SYNC_LOCK_KEY, token)
  return () => {
    // 只释放自己持有的锁，避免误删其他标签页的锁
    if (getStorageItem(SYNC_LOCK_KEY) === token) removeStorageItem(SYNC_LOCK_KEY)
  }
}

/**
 * 客户端单飞（契约 §5.4）：
 * 优先 navigator.locks，缺失时退化为 localStorage 20 秒时间戳锁。
 * 返回 null 表示已有其他标签页在同步。
 */
async function runExclusive(
  task: () => Promise<SyncRunOutcome>,
): Promise<SyncRunOutcome | null> {
  if (typeof navigator !== 'undefined') {
    const locks = (navigator as Navigator & { locks?: NavigatorLocks }).locks
    if (locks && typeof locks.request === 'function') {
      return locks.request(SYNC_LOCK_NAME, { ifAvailable: true }, async (lock) => {
        if (!lock) return null
        return task()
      })
    }
  }
  const release = acquireFallbackLock()
  if (!release) return null
  try {
    return await task()
  } finally {
    release()
  }
}

function isTombstone(record: Record<string, unknown> | null | undefined): boolean {
  return Boolean(record && record.deletedAt)
}

function feedingFromOutbox(item: OutboxItem, revision: number): FeedingRecord | null {
  const data = item.data
  if (!data || !data.babyId || !data.feedType || !data.startedAt) return null
  const startedAt = String(data.startedAt)
  const started = new Date(startedAt)
  const validStart = !Number.isNaN(started.getTime())
  return {
    id: item.entityId,
    babyId: String(data.babyId),
    feedType: data.feedType as FeedingType,
    breastSide: (data.breastSide as BreastSide | null | undefined) ?? null,
    amountValue: typeof data.amountValue === 'number' ? data.amountValue : null,
    amountUnit: (data.amountUnit as AmountUnit | null | undefined) ?? null,
    durationSec: typeof data.durationSec === 'number' ? data.durationSec : null,
    startedAt,
    endedAt: (data.endedAt as string | null | undefined) ?? null,
    recordDate: validStart ? toLocalDateString(started) : '',
    tzOffsetMinutes: validStart ? tzOffsetMinutes(started) : 0,
    note: (data.note as string | null | undefined) ?? null,
    tags: (data.tags as FeedingTag[] | null | undefined) ?? null,
    revision,
    createdAt: item.createdAt,
    updatedAt: new Date().toISOString(),
    deletedAt: null,
  }
}

function growthFromOutbox(item: OutboxItem, revision: number): GrowthRecord | null {
  const data = item.data
  if (!data || !data.babyId || !data.measuredOn) return null
  return {
    id: item.entityId,
    babyId: String(data.babyId),
    measuredOn: String(data.measuredOn),
    heightCm: typeof data.heightCm === 'number' ? data.heightCm : null,
    weightKg: typeof data.weightKg === 'number' ? data.weightKg : null,
    headCircumferenceCm:
      typeof data.headCircumferenceCm === 'number' ? data.headCircumferenceCm : null,
    note: (data.note as string | null | undefined) ?? null,
    revision,
    createdAt: item.createdAt,
    updatedAt: new Date().toISOString(),
    deletedAt: null,
  }
}

function babyFromOutbox(item: OutboxItem, revision: number): Baby | null {
  const data = item.data
  if (!data || !data.name || !data.birthDate) return null
  return {
    id: item.entityId,
    name: String(data.name),
    gender: (data.gender as Baby['gender'] | undefined) ?? 'UNKNOWN',
    birthDate: String(data.birthDate),
    isDefault: data.isDefault === true,
    revision,
    createdAt: item.createdAt,
    updatedAt: new Date().toISOString(),
    deletedAt: null,
  }
}

export const useSyncStore = defineStore('sync', {
  state: () => ({
    online: typeof navigator === 'undefined' ? true : navigator.onLine !== false,
    syncing: false,
    started: false,
    pendingCount: 0,
    pendingByType: {
      BABY: 0,
      FEEDING_RECORD: 0,
      GROWTH_RECORD: 0,
    } as Record<SyncEntityType, number>,
    failedCount: 0,
    lastError: null as string | null,
    lastSyncedAt: null as string | null,
    conflictCount: 0,
    rejectedCount: 0,
  }),

  actions: {
    start(): void {
      this.started = true
      this.online = typeof navigator === 'undefined' ? true : navigator.onLine !== false
    },

    setOnline(value: boolean): void {
      this.online = value
    },

    async refreshPending(): Promise<void> {
      try {
        const items = await listOutbox()
        const byType: Record<SyncEntityType, number> = {
          BABY: 0,
          FEEDING_RECORD: 0,
          GROWTH_RECORD: 0,
        }
        for (const item of items) byType[item.entityType] += 1
        this.pendingCount = items.length
        this.pendingByType = byType
        this.failedCount = items.filter((item) => item.failed).length
      } catch {
        this.pendingCount = 0
        this.pendingByType = { BABY: 0, FEEDING_RECORD: 0, GROWTH_RECORD: 0 }
        this.failedCount = 0
        return
      }
      // 记录页/生长页的“待同步”标记也来自 outbox
      const feeding = useFeedingStore()
      const growth = useGrowthStore()
      await Promise.all([
        feeding.refreshPendingCount().catch(() => undefined),
        growth.refreshPendingCount().catch(() => undefined),
      ])
    },

    /**
     * 批量推送 outbox。
     * 触发点：应用启动、online、visibilitychange、30 秒定时、写入失败后的 requestSync。
     */
    async syncNow(): Promise<SyncRunOutcome> {
      if (!this.online) {
        await this.refreshPending()
        return emptyOutcome('offline', this.pendingCount)
      }
      const existing = inflightSyncs.get(this)
      if (existing) return existing
      const run = this.runSync()
      inflightSyncs.set(this, run)
      try {
        return await run
      } finally {
        inflightSyncs.delete(this)
      }
    },

    async runSync(): Promise<SyncRunOutcome> {
      if (this.syncing) return emptyOutcome('busy', this.pendingCount)
      const outcome = await runExclusive(async () => {
        this.syncing = true
        try {
          return await this.drainOutbox()
        } finally {
          this.syncing = false
          await this.refreshPending()
        }
      })
      if (!outcome) return emptyOutcome('busy', this.pendingCount)

      if (outcome.conflict > 0) {
        // UI-17 固定文案，不拼接条数
        useUiStore().toast(SYNC_CONFLICT_COPY)
      } else if (outcome.rejected > 0) {
        useUiStore().toast(`${outcome.rejected} 条记录同步失败，请打开记录修改后重试`)
      }
      return outcome
    },

    async drainOutbox(): Promise<SyncRunOutcome> {
      let applied = 0
      let duplicate = 0
      let conflict = 0
      let rejected = 0
      const attempted = new Set<string>()

      for (let round = 0; round < MAX_BATCH_ROUNDS; round += 1) {
        const available = (await listSyncableOutbox()).filter(
          (item) => !attempted.has(item.key),
        )
        if (available.length === 0) break

        const planned = await planBatch(available, new Date().toISOString())
        if (!planned) break
        const { batchId, clientTime, items: batch } = planned
        for (const item of batch) attempted.add(item.key)

        let response
        try {
          response = await pushSyncBatch({
            batchId,
            // 同一批次的所有重试必须复用同一 clientTime，否则服务端哈希不同直接 409
            clientTime,
            changes: batch.map(toChange),
          })
        } catch (error) {
          const message = errorMessage(error, '同步失败，稍后自动重试')
          await this.handleBatchError(batch, error, message)
          this.lastError = message
          return {
            status: 'error',
            applied,
            duplicate,
            conflict,
            rejected,
            pending: this.pendingCount,
            message,
          }
        }

        // 服务端已返回结果，本批结束；下一批视为新的尝试
        await deleteMeta(SYNC_BATCH_PLAN_META_KEY)
        this.lastError = null
        const byKey = new Map<string, SyncPushResult>()
        for (const result of response.results) {
          byKey.set(`${result.entityType}:${result.id}`, result)
        }

        let roundConflict = 0
        let roundRejected = 0
        for (const item of batch) {
          const result = byKey.get(item.key)
          if (!result) {
            await markOutboxFailed(item.key, '同步结果缺失')
            roundRejected += 1
            continue
          }
          const appliedResult = await this.applyResult(item, result)
          if (appliedResult === 'applied') applied += 1
          else if (appliedResult === 'duplicate') duplicate += 1
          else if (appliedResult === 'conflict') {
            conflict += 1
            roundConflict += 1
          } else {
            rejected += 1
            roundRejected += 1
          }
        }

        this.conflictCount += roundConflict
        this.rejectedCount += roundRejected
        await this.refreshPending()

        if (batch.length < BATCH_SIZE) break
      }

      if (applied + duplicate + conflict > 0) {
        this.lastSyncedAt = new Date().toISOString()
      }
      return {
        status: 'ok',
        applied,
        duplicate,
        conflict,
        rejected,
        pending: this.pendingCount,
      }
    },

    async handleBatchError(
      batch: OutboxItem[],
      error: unknown,
      message: string,
    ): Promise<void> {
      const retryAfterMs =
        error instanceof ApiError && error.retryAfter ? error.retryAfter * 1000 : 0

      if (error instanceof ApiError && error.code === 'SYNC_IN_PROGRESS') {
        // 服务端锁被占用：短延迟重试，不标记失败
        await Promise.all(
          batch.map((item) => deferOutbox(item.key, retryAtIso(item, 1000), '同步进行中')),
        )
        return
      }
      if (isRetryableApiError(error)) {
        await Promise.all(
          batch.map((item) =>
            deferOutbox(item.key, retryAtIso(item, retryAfterMs), message),
          ),
        )
        return
      }
      // 4xx 业务错误：不自动重试，保留本地并等待用户修改；
      // 该批不会再自动重试，丢弃批次计划，用户修改后重新入队生成新 batchId
      await Promise.all(batch.map((item) => markOutboxFailed(item.key, message)))
      await deleteMeta(SYNC_BATCH_PLAN_META_KEY)
    },

    async applyResult(
      item: OutboxItem,
      result: SyncPushResult,
    ): Promise<'applied' | 'duplicate' | 'conflict' | 'rejected'> {
      if (result.status === 'REJECTED') {
        await markOutboxFailed(item.key, result.error?.message ?? '同步被拒绝')
        return 'rejected'
      }

      let applied = false
      if (item.entityType === 'BABY') {
        applied = await this.applyBabyResult(item, result)
      } else if (item.entityType === 'FEEDING_RECORD') {
        applied = await this.applyFeedingResult(item, result)
      } else {
        applied = await this.applyGrowthResult(item, result)
      }

      if (!applied) {
        await markOutboxFailed(item.key, '同步结果缺少记录')
        return 'rejected'
      }

      await removeOutbox(item.key)
      if (result.status === 'APPLIED') return 'applied'
      if (result.status === 'DUPLICATE') return 'duplicate'
      return 'conflict'
    },

    /** sync 是唯一允许返回 tombstone 的入口，任何分支遇到 deletedAt 都必须删除本地且绝不复活 */
    async applyFeedingResult(item: OutboxItem, result: SyncPushResult): Promise<boolean> {
      const store = useFeedingStore()
      const remote = (result.record ?? null) as unknown as FeedingRecord | null

      if (item.op === 'DELETE') {
        if (result.status === 'CONFLICT_SERVER_WINS' && remote && !remote.deletedAt) {
          await store.applySyncedRecord(remote)
        } else {
          await store.applySyncedDeletion(item.entityId)
        }
        return true
      }
      if (isTombstone(result.record)) {
        await store.applySyncedDeletion(item.entityId)
        return true
      }
      if (remote) {
        await store.applySyncedRecord(remote)
        return true
      }
      const cached =
        (await getFeedingRecordCache(item.entityId).catch(() => undefined)) ??
        store.records.find((record) => record.id === item.entityId)
      const fallback = cached
        ? { ...cached, revision: result.revision, updatedAt: new Date().toISOString() }
        : feedingFromOutbox(item, result.revision)
      if (!fallback) return false
      await store.applySyncedRecord(fallback)
      return true
    },

    async applyGrowthResult(item: OutboxItem, result: SyncPushResult): Promise<boolean> {
      const store = useGrowthStore()
      const remote = (result.record ?? null) as unknown as GrowthRecord | null

      if (item.op === 'DELETE') {
        if (result.status === 'CONFLICT_SERVER_WINS' && remote && !remote.deletedAt) {
          await store.applySyncedRecord(remote)
        } else {
          await store.applySyncedDeletion(item.entityId)
        }
        return true
      }
      if (isTombstone(result.record)) {
        await store.applySyncedDeletion(item.entityId)
        return true
      }
      if (remote) {
        await store.applySyncedRecord(remote)
        return true
      }
      const cached =
        (await getGrowthRecordCache(item.entityId).catch(() => undefined)) ??
        store.records.find((record) => record.id === item.entityId)
      const fallback = cached
        ? { ...cached, revision: result.revision, updatedAt: new Date().toISOString() }
        : growthFromOutbox(item, result.revision)
      if (!fallback) return false
      await store.applySyncedRecord(fallback)
      return true
    },

    async applyBabyResult(item: OutboxItem, result: SyncPushResult): Promise<boolean> {
      const store = useBabyStore()
      const remote = (result.record ?? null) as unknown as Baby | null

      if (item.op === 'DELETE') {
        if (result.status === 'CONFLICT_SERVER_WINS' && remote && !remote.deletedAt) {
          await store.applySyncedBaby(remote)
        } else {
          useFeedingStore().removeBabyRecords(item.entityId)
          useGrowthStore().removeBabyRecords(item.entityId)
          await store.applySyncedBabyDeletion(item.entityId)
        }
        return true
      }
      if (isTombstone(result.record)) {
        useFeedingStore().removeBabyRecords(item.entityId)
        useGrowthStore().removeBabyRecords(item.entityId)
        await store.applySyncedBabyDeletion(item.entityId)
        return true
      }
      if (remote) {
        await store.applySyncedBaby(remote)
        return true
      }
      const local =
        store.babies.find((baby) => baby.id === item.entityId) ??
        babyFromOutbox(item, result.revision)
      if (!local) return false
      await store.applySyncedBaby({
        ...local,
        revision: result.revision,
        updatedAt: new Date().toISOString(),
      })
      return true
    },
  },
})
