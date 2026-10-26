import { defineStore } from 'pinia'
import { ApiError, isRetryableApiError } from '@/api/client'
import {
  createFeedingRecordRequest,
  deleteFeedingRecordRequest,
  listFeedingRecords,
  patchFeedingRecordRequest,
} from '@/api/feeding'
import {
  deleteFeedingRecordCache,
  getFeedingRecordsByBabyDate,
  putFeedingRecordCache,
  putFeedingRecordsCache,
} from '@/db'
import {
  countOutbox,
  enqueueOutbox,
  listOutbox,
  outboxKey,
  pendingOutboxOps,
  removeOutbox,
} from '@/db/outbox'
import type {
  DailySummary,
  FeedingRecord,
  FeedingRecordInput,
} from '@/types/models'
import { toLocalDateString, tzOffsetMinutes } from '@/utils/date'
import {
  buildLocalFeedingRecord,
  normalizeFeedingFields,
  summarizeFeedingRecords,
  toFeedingPatchData,
  toFeedingSyncData,
  validateFeedingInput,
} from '@/utils/feeding'
import { requestSync } from '@/utils/sync-events'

export type FeedingMutationStatus = 'synced' | 'pending' | 'conflict' | 'failed'

export interface FeedingMutationOutcome {
  status: FeedingMutationStatus
  record?: FeedingRecord
  message?: string
}

function byId(records: FeedingRecord[]): FeedingRecord[] {
  const map = new Map<string, FeedingRecord>()
  for (const record of records) {
    map.set(record.id, record)
  }
  return [...map.values()]
}

function sortDesc(records: FeedingRecord[]): FeedingRecord[] {
  return [...records].sort((a, b) => {
    const diff = Date.parse(b.startedAt) - Date.parse(a.startedAt)
    if (diff !== 0) return diff
    return b.id.localeCompare(a.id)
  })
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

/** 在线 GET/PATCH/POST 已软删除记录 → 404（契约 Q-05/Q-06） */
function isNotFoundError(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 404 || error.code === 'NOT_FOUND')
}

/** 409 CONFLICT 的 data.current 是服务端最新记录 */
function conflictCurrent(error: unknown): FeedingRecord | null {
  if (!(error instanceof ApiError) || error.code !== 'CONFLICT') return null
  const data = error.data as { current?: FeedingRecord | null } | null | undefined
  return data?.current ?? null
}

function buildUpdatedRecord(
  record: FeedingRecord,
  input: FeedingRecordInput,
  now: Date = new Date(),
): FeedingRecord {
  const fields = normalizeFeedingFields(input)
  const parsedStart = new Date(input.startedAt)
  const startDate = Number.isNaN(parsedStart.getTime()) ? new Date(record.startedAt) : parsedStart
  const safeStart = Number.isNaN(startDate.getTime()) ? new Date(now) : startDate
  return {
    ...record,
    ...fields,
    startedAt: Number.isNaN(parsedStart.getTime()) ? record.startedAt : input.startedAt,
    endedAt: input.endedAt ?? null,
    recordDate: toLocalDateString(safeStart),
    tzOffsetMinutes: tzOffsetMinutes(safeStart),
    note: input.note?.trim() ? input.note.trim() : null,
    tags: input.tags && input.tags.length > 0 ? [...new Set(input.tags)] : null,
    updatedAt: now.toISOString(),
  }
}

export const useFeedingStore = defineStore('feeding', {
  state: () => ({
    records: [] as FeedingRecord[],
    currentBabyId: null as string | null,
    currentDate: '',
    loading: false,
    loadingMore: false,
    pendingCount: 0,
    pendingIds: [] as string[],
    page: 1,
    pageSize: 20,
    total: 0,
    hasNext: false,
    loadSeq: 0,
    lastError: null as string | null,
    /** 本机缓存写入失败：记录仅保留在 Pinia，刷新后可能丢失（FE-08） */
    cacheDegraded: false,
  }),

  getters: {
    sortedRecords(state): FeedingRecord[] {
      return sortDesc(state.records).filter((record) => !record.deletedAt)
    },
    todaySummary(state): DailySummary {
      return summarizeFeedingRecords(state.records)
    },
  },

  actions: {
    mergeRecords(list: FeedingRecord[]): void {
      this.records = sortDesc(byId(list))
    },

    async refreshPendingCount(): Promise<void> {
      try {
        const items = await listOutbox()
        const feedingItems = items.filter((item) => item.entityType === 'FEEDING_RECORD')
        this.pendingCount = feedingItems.length
        this.pendingIds = feedingItems.map((item) => item.entityId)
      } catch {
        this.pendingCount = await countOutbox('FEEDING_RECORD').catch(() => 0)
        this.pendingIds = []
      }
    },

    /** 缓存写失败可降级为仅内存，但必须显式标记，不能静默吞掉（FE-08） */
    async persistRecordCache(record: FeedingRecord): Promise<void> {
      try {
        await putFeedingRecordCache(record)
        this.cacheDegraded = false
      } catch {
        this.cacheDegraded = true
        this.lastError = '本机缓存不可用，记录仅在当前页面保留'
      }
    },

    async dropRecordCache(id: string): Promise<void> {
      try {
        await deleteFeedingRecordCache(id)
        this.cacheDegraded = false
      } catch {
        this.cacheDegraded = true
      }
    },

    /** 缓存优先：先渲染 IndexedDB，再拉服务端；失败保留缓存 */
    async loadDay(babyId: string, recordDate: string): Promise<void> {
      await this.loadDayPage(babyId, recordDate, 1, 100, false)
    },

    /**
     * 记录页分页加载（契约 page 1 起、size 默认 20、最大 100）。
     * 缓存先展示；服务端失败时保留缓存并给出错误提示。
     */
    async loadDayPage(
      babyId: string,
      recordDate: string,
      page = 1,
      size = 20,
      append = false,
    ): Promise<void> {
      if (!babyId) return
      const safePage = Math.max(1, page)
      const safeSize = Math.min(100, Math.max(1, size))
      const seq = this.loadSeq + 1
      this.loadSeq = seq
      this.currentBabyId = babyId
      this.currentDate = recordDate
      this.page = safePage
      this.pageSize = safeSize
      if (append) {
        this.loadingMore = true
      } else {
        this.loading = true
        this.records = []
        this.hasNext = false
        this.total = 0
      }

      let cached: FeedingRecord[] = []
      try {
        cached = await getFeedingRecordsByBabyDate(babyId, recordDate)
      } catch {
        cached = []
      }
      if (seq !== this.loadSeq) return

      if (!append) {
        this.mergeRecords(cached)
      }

      try {
        const result = await listFeedingRecords({
          babyId,
          date: recordDate,
          page: safePage,
          size: safeSize,
        })
        if (seq !== this.loadSeq) return
        // 以 outbox 未完成项为准：pending 编辑用本地值，pending DELETE 不得被服务端复活
        const pendingOps = await pendingOutboxOps('FEEDING_RECORD').catch(
          () => new Map<string, 'UPSERT' | 'DELETE'>(),
        )
        if (seq !== this.loadSeq) return
        const localById = new Map(cached.map((record) => [record.id, record]))
        const serverItems = result.items
          .filter((record) => !record.deletedAt && pendingOps.get(record.id) !== 'DELETE')
          .map((record) =>
            pendingOps.has(record.id) ? localById.get(record.id) ?? record : record,
          )
        const knownIds = new Set(
          [...(append ? this.records : []), ...serverItems].map((record) => record.id),
        )
        const pendingLocal = cached.filter(
          (record) =>
            !knownIds.has(record.id) &&
            ((pendingOps.has(record.id) && pendingOps.get(record.id) !== 'DELETE') ||
              record.revision === 0),
        )
        this.mergeRecords(
          append ? [...this.records, ...serverItems, ...pendingLocal] : [...serverItems, ...pendingLocal],
        )
        this.page = result.page
        this.pageSize = result.size
        this.total = result.total
        this.hasNext = result.hasNext
        try {
          await putFeedingRecordsCache([...serverItems, ...pendingLocal])
          this.cacheDegraded = false
        } catch {
          // 展示不受影响，但缓存已降级，必须显式标记（FE-08）
          this.cacheDegraded = true
        }
        this.lastError = null
      } catch (error) {
        if (seq !== this.loadSeq) return
        this.mergeRecords([...this.records, ...cached])
        this.hasNext = false
        this.total = this.records.filter((record) => !record.deletedAt).length
        this.lastError = errorMessage(error, '记录加载失败，当前显示本地缓存')
      } finally {
        if (seq === this.loadSeq) {
          this.loading = false
          this.loadingMore = false
          await this.refreshPendingCount()
        }
      }
    },

    async loadMore(): Promise<void> {
      if (!this.hasNext || this.loadingMore || !this.currentBabyId) return
      await this.loadDayPage(
        this.currentBabyId,
        this.currentDate,
        this.page + 1,
        this.pageSize,
        true,
      )
    },

    /**
     * 本地先写：IndexedDB + outbox + Pinia，立即返回。
     * 网络同步由 useFeedingRecorder 异步触发，不阻塞 UI。
     */
    async createLocal(input: FeedingRecordInput, babyId: string): Promise<FeedingRecord> {
      const validationError = validateFeedingInput(input)
      if (validationError) throw new Error(validationError)

      const record = buildLocalFeedingRecord(input, babyId)
      await this.persistRecordCache(record)
      try {
        await enqueueOutbox({
          entityType: 'FEEDING_RECORD',
          entityId: record.id,
          op: 'UPSERT',
          baseRevision: 0,
          data: toFeedingSyncData(record),
          babyId: record.babyId,
        })
      } catch {
        // 队列写不进去 = 无法保证刷新后仍在，必须回滚并让调用方提示保存失败（FE-08）
        await deleteFeedingRecordCache(record.id).catch(() => undefined)
        this.cacheDegraded = true
        throw new Error('保存失败，请检查浏览器存储空间后重试')
      }

      if (record.babyId === this.currentBabyId && record.recordDate === this.currentDate) {
        this.mergeRecords([record, ...this.records])
      }
      await this.refreshPendingCount()
      return record
    },

    /**
     * 编辑记录：本地立即生效并折叠进 outbox；在线时同步服务端。
     * 409 冲突按契约使用服务端 data.current 覆盖本地。
     */
    async updateRecord(
      record: FeedingRecord,
      input: FeedingRecordInput,
    ): Promise<FeedingMutationOutcome> {
      const validationError = validateFeedingInput(input)
      if (validationError) throw new Error(validationError)

      const updated = buildUpdatedRecord(record, input)
      await this.persistRecordCache(updated)
      try {
        await enqueueOutbox({
          entityType: 'FEEDING_RECORD',
          entityId: updated.id,
          op: 'UPSERT',
          baseRevision: record.revision,
          data: toFeedingSyncData(updated),
          babyId: updated.babyId,
        })
      } catch {
        // 回滚缓存与 Pinia，不能让用户以为修改已保存（FE-08）
        await putFeedingRecordCache(record).catch(() => {
          this.cacheDegraded = true
        })
        throw new Error('保存失败，请检查浏览器存储空间后重试')
      }
      this.mergeRecords([...this.records, updated])
      await this.refreshPendingCount()

      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        requestSync()
        return { status: 'pending', record: updated, message: '离线，修改待同步' }
      }

      if (record.revision === 0) {
        const ok = await this.syncRecord(updated)
        const merged = this.records.find((item) => item.id === updated.id) ?? updated
        if (ok) return { status: 'synced', record: merged }
        const status = this.pendingIds.includes(updated.id) ? 'pending' : 'failed'
        return {
          status,
          record: merged,
          message: status === 'pending' ? '网络不可用，修改待同步' : this.lastError ?? '保存失败',
        }
      }

      try {
        const server = await patchFeedingRecordRequest(record.id, {
          baseRevision: record.revision,
          ...toFeedingPatchData(updated),
        })
        await this.applyServerRecord(server)
        this.lastError = null
        return { status: 'synced', record: server }
      } catch (error) {
        const current = conflictCurrent(error)
        if (current) {
          await this.applyServerRecord(current)
          return {
            status: 'conflict',
            record: current,
            message: '该记录已在其他端更新',
          }
        }
        if (isNotFoundError(error)) {
          await removeOutbox(outboxKey('FEEDING_RECORD', record.id)).catch(() => undefined)
          await this.applySyncedDeletion(record.id)
          this.lastError = '记录已不存在，已从本机移除'
          return { status: 'conflict', message: this.lastError }
        }
        if (isRetryableApiError(error)) {
          this.lastError = errorMessage(error, '网络不可用，修改待同步')
          requestSync()
          return { status: 'pending', record: updated, message: this.lastError }
        }
        await removeOutbox(outboxKey('FEEDING_RECORD', record.id))
        await this.refreshPendingCount()
        this.lastError = errorMessage(error, '保存失败')
        return { status: 'failed', record: updated, message: this.lastError }
      }
    },

    /** 删除记录：本地立即隐藏；已同步记录带 baseRevision 通知服务端 */
    async deleteRecord(record: FeedingRecord): Promise<FeedingMutationOutcome> {
      await this.dropRecordCache(record.id)
      this.records = this.records.filter((item) => item.id !== record.id)
      try {
        await enqueueOutbox({
          entityType: 'FEEDING_RECORD',
          entityId: record.id,
          op: 'DELETE',
          baseRevision: record.revision,
          babyId: record.babyId,
        })
      } catch {
        // 回滚缓存与 Pinia，删除没有进入队列就不能假装成功（FE-08）
        await putFeedingRecordCache(record).catch(() => {
          this.cacheDegraded = true
        })
        this.mergeRecords([...this.records, record])
        await this.refreshPendingCount()
        throw new Error('删除失败，请检查浏览器存储空间后重试')
      }
      await this.refreshPendingCount()

      if (record.revision === 0) {
        // 新建未同步记录删除后 outbox 已撤销，通知同步层重算横幅「待同步 N 条」（TE04-11）
        requestSync()
        return { status: 'synced' }
      }
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        requestSync()
        return { status: 'pending', message: '离线，删除待同步' }
      }

      try {
        await deleteFeedingRecordRequest(record.id, record.revision)
        await removeOutbox(outboxKey('FEEDING_RECORD', record.id))
        await this.refreshPendingCount()
        this.lastError = null
        return { status: 'synced' }
      } catch (error) {
        const current = conflictCurrent(error)
        if (current) {
          await this.applyServerRecord(current)
          return { status: 'conflict', record: current, message: '该记录已在其他端更新' }
        }
        if (isNotFoundError(error)) {
          // 在线接口对已删除资源返回 404；本地已经隐藏，视为删除成功
          await removeOutbox(outboxKey('FEEDING_RECORD', record.id))
          await this.refreshPendingCount()
          return { status: 'synced' }
        }
        if (isRetryableApiError(error)) {
          this.lastError = errorMessage(error, '网络不可用，删除待同步')
          requestSync()
          return { status: 'pending', message: this.lastError }
        }
        await removeOutbox(outboxKey('FEEDING_RECORD', record.id))
        await this.refreshPendingCount()
        this.lastError = errorMessage(error, '删除失败')
        return { status: 'failed', message: this.lastError }
      }
    },

    async applyServerRecord(record: FeedingRecord): Promise<void> {
      try {
        await putFeedingRecordCache(record)
      } catch {
        // 服务端已成功，缓存失败降级为仅内存，但必须显式标记（FE-08）
        this.cacheDegraded = true
      }
      if (record.babyId === this.currentBabyId && record.recordDate === this.currentDate) {
        // 服务端版本必须覆盖同名本地记录
        this.mergeRecords([...this.records, record])
      }
      try {
        await removeOutbox(outboxKey('FEEDING_RECORD', record.id))
      } catch {
        this.lastError = '本机同步状态更新失败，稍后会自动重试'
      }
      await this.refreshPendingCount()
    },

    /** 单条即时同步（FE-03 快速路径；FE-08 会替换为批量 outbox 推送） */
    async syncRecord(record: FeedingRecord): Promise<boolean> {
      try {
        const result = await createFeedingRecordRequest({
          id: record.id,
          babyId: record.babyId,
          feedType: record.feedType,
          breastSide: record.breastSide,
          amountValue: record.amountValue,
          amountUnit: record.amountUnit,
          durationSec: record.durationSec,
          startedAt: record.startedAt,
          endedAt: record.endedAt,
          note: record.note,
          tags: record.tags,
        })
        await this.applyServerRecord(result.record)
        this.lastError = null
        return true
      } catch (error) {
        if (isNotFoundError(error)) {
          // POST 已删除 id → 404，不复活（契约 Q-05）
          await removeOutbox(outboxKey('FEEDING_RECORD', record.id))
          await this.applySyncedDeletion(record.id)
          this.lastError = '记录已不存在，已从本机移除'
        } else if (!isRetryableApiError(error)) {
          // 4xx 不自动重试：移出队列，本地保留记录
          await removeOutbox(outboxKey('FEEDING_RECORD', record.id))
          this.lastError = errorMessage(error, '记录同步失败')
        } else {
          this.lastError = errorMessage(error, '网络不可用，记录待同步')
          requestSync()
        }
        await this.refreshPendingCount()
        return false
      }
    },

    /** 同步结果直接覆盖本地（APPLIED / DUPLICATE / CONFLICT_SERVER_WINS） */
    async applySyncedRecord(record: FeedingRecord): Promise<void> {
      if (record.deletedAt) {
        await this.applySyncedDeletion(record.id)
        return
      }
      try {
        await putFeedingRecordCache(record)
        this.cacheDegraded = false
      } catch {
        // 缓存失败不影响 Pinia，但必须显式标记（FE-08）
        this.cacheDegraded = true
      }
      const known = this.records.some((item) => item.id === record.id)
      if (
        known ||
        (record.babyId === this.currentBabyId && record.recordDate === this.currentDate)
      ) {
        this.mergeRecords([...this.records, record])
      }
      await this.refreshPendingCount()
    },

    /** tombstone / 在线 404：从缓存与内存中移除，绝不复活 */
    async applySyncedDeletion(id: string): Promise<void> {
      try {
        await deleteFeedingRecordCache(id)
      } catch {
        // 删除失败会让记录在刷新后复活，必须显式标记（FE-08）
        this.cacheDegraded = true
      }
      this.records = this.records.filter((item) => item.id !== id)
      await this.refreshPendingCount()
    },

    removeBabyRecords(babyId: string): void {
      this.records = this.records.filter((item) => item.babyId !== babyId)
    },
  },
})
