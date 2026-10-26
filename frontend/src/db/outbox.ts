import { deleteMeta, getDb, getMeta } from './index'
import { SYNC_BATCH_PLAN_META_KEY } from '@/constants/sync'
import type { OutboxItem, SyncEntityType, SyncOp } from '@/types/models'

export function outboxKey(entityType: SyncEntityType, entityId: string): string {
  return `${entityType}:${entityId}`
}

/** Vue reactive proxy 不能直接写入 IndexedDB */
function toPlain<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

interface EnqueueInput {
  entityType: SyncEntityType
  entityId: string
  op: SyncOp
  baseRevision: number
  data?: Record<string, unknown>
  /** 记录所属宝宝（仅本地），删除宝宝时用于清理 outbox */
  babyId?: string
  now?: Date
}

export type EnqueueResult = 'queued' | 'cancelled'

/**
 * 入队/折叠规则（契约 5.4）：
 * - 同一记录多次编辑折叠为一条 UPSERT，baseRevision 保持第一次入队的值；
 * - 新建（baseRevision=0）尚未同步就删除：直接撤销 outbox，不通知服务端；
 * - 已同步记录删除：保留一条 DELETE。
 */
export async function enqueueOutbox(input: EnqueueInput): Promise<EnqueueResult> {
  const db = await getDb()
  const key = outboxKey(input.entityType, input.entityId)
  const existing = await db.get('outbox', key)
  const nowIso = (input.now ?? new Date()).toISOString()

  if (input.op === 'DELETE') {
    if (existing && existing.baseRevision === 0) {
      await db.delete('outbox', key)
      return 'cancelled'
    }
    await db.put(
      'outbox',
      toPlain({
        key,
        entityType: input.entityType,
        entityId: input.entityId,
        op: 'DELETE',
        baseRevision: existing ? existing.baseRevision : input.baseRevision,
        babyId: existing?.babyId ?? input.babyId,
        createdAt: existing?.createdAt ?? nowIso,
        nextRetryAt: nowIso,
        attemptCount: 0,
        failed: false,
      }),
    )
    return 'queued'
  }

  if (existing) {
    const merged: OutboxItem = {
      ...existing,
      op: 'UPSERT',
      data: input.data,
      babyId: input.babyId ?? existing.babyId,
      nextRetryAt: nowIso,
      attemptCount: 0,
      failed: false,
      lastError: undefined,
      failedAt: undefined,
    }
    await db.put('outbox', toPlain(merged))
    return 'queued'
  }

  await db.put(
    'outbox',
    toPlain({
      key,
      entityType: input.entityType,
      entityId: input.entityId,
      op: 'UPSERT',
      baseRevision: input.baseRevision,
      data: input.data,
      babyId: input.babyId,
      createdAt: nowIso,
      nextRetryAt: nowIso,
      attemptCount: 0,
    }),
  )
  return 'queued'
}

export async function getOutboxItem(key: string): Promise<OutboxItem | undefined> {
  const db = await getDb()
  return db.get('outbox', key)
}

export async function removeOutbox(key: string): Promise<void> {
  const db = await getDb()
  await db.delete('outbox', key)
}

/**
 * 删除宝宝后清理其记录级 outbox 项（FEEDING_RECORD / GROWTH_RECORD）。
 * 否则恢复网络后服务端会把它们判 REJECTED，而本地缓存已删，用户无法处理。
 * 若已有批次计划引用了被删条目，一并清除计划，下一轮重新生成批次（FE-07）。
 */
export async function removeOutboxByBaby(babyId: string): Promise<string[]> {
  const db = await getDb()
  const items = await db.getAll('outbox')
  const keys = items
    .filter(
      (item) =>
        item.entityType !== 'BABY' &&
        (item.babyId === babyId || item.data?.babyId === babyId),
    )
    .map((item) => item.key)
  for (const key of keys) await db.delete('outbox', key)

  if (keys.length > 0) {
    const plan = await getMeta<{ keys?: string[] }>(SYNC_BATCH_PLAN_META_KEY)
    if (plan?.keys?.some((key) => keys.includes(key))) {
      await deleteMeta(SYNC_BATCH_PLAN_META_KEY)
    }
  }
  return keys
}

const ENTITY_PRIORITY: Record<SyncEntityType, number> = {
  BABY: 0,
  FEEDING_RECORD: 1,
  GROWTH_RECORD: 2,
}

/** 同步顺序：BABY 优先，其次 createdAt 升序 */
export async function listOutbox(): Promise<OutboxItem[]> {
  const db = await getDb()
  const items = await db.getAll('outbox')
  return items.sort((a, b) => {
    const priority = ENTITY_PRIORITY[a.entityType] - ENTITY_PRIORITY[b.entityType]
    if (priority !== 0) return priority
    return a.createdAt.localeCompare(b.createdAt)
  })
}

/**
 * 某实体在 outbox 中未完成项的 id -> op。
 * 合并服务端列表时以它为准：pending UPSERT 用本地值，pending DELETE 不得复活。
 */
export async function pendingOutboxOps(
  entityType: SyncEntityType,
): Promise<Map<string, SyncOp>> {
  const items = await listOutbox()
  const ops = new Map<string, SyncOp>()
  for (const item of items) {
    if (item.entityType === entityType) ops.set(item.entityId, item.op)
  }
  return ops
}

export async function countOutbox(entityType?: SyncEntityType): Promise<number> {
  const db = await getDb()
  const items = await db.getAll('outbox')
  if (!entityType) return items.length
  return items.filter((item) => item.entityType === entityType).length
}

/**
 * 自动重试候选：未标记失败且已到重试时间。
 * REJECTED / 4xx 的条目保留在 outbox 但不再自动重试（契约 Q-08、§5.4）。
 */
export async function listSyncableOutbox(now: Date = new Date()): Promise<OutboxItem[]> {
  const items = await listOutbox()
  const nowIso = now.toISOString()
  return items.filter((item) => !item.failed && item.nextRetryAt <= nowIso)
}

/** 网络/5xx/429：保留 outbox，递增尝试次数并写入下一次重试时间 */
export async function deferOutbox(
  key: string,
  nextRetryAt: string,
  lastError: string,
): Promise<void> {
  const db = await getDb()
  const item = await db.get('outbox', key)
  if (!item) return
  await db.put(
    'outbox',
    toPlain({
      ...item,
      attemptCount: item.attemptCount + 1,
      nextRetryAt,
      lastError,
    }),
  )
}

/** REJECTED / 不可重试 4xx：保留本地数据，停止自动重试 */
export async function markOutboxFailed(key: string, lastError: string): Promise<void> {
  const db = await getDb()
  const item = await db.get('outbox', key)
  if (!item) return
  const nowIso = new Date().toISOString()
  await db.put(
    'outbox',
    toPlain({
      ...item,
      failed: true,
      failedAt: nowIso,
      lastError,
      attemptCount: item.attemptCount + 1,
    }),
  )
}

/** 重置失败标记（用户修改后重新入队时调用；enqueueOutbox 已内置） */
export async function clearOutboxFailure(key: string): Promise<void> {
  const db = await getDb()
  const item = await db.get('outbox', key)
  if (!item || !item.failed) return
  await db.put(
    'outbox',
    toPlain({
      ...item,
      failed: false,
      failedAt: undefined,
      lastError: undefined,
      attemptCount: 0,
      nextRetryAt: new Date().toISOString(),
    }),
  )
}
