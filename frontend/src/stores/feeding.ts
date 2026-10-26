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
  toFeedingSyncData,
  validateFeedingInput,
} from '@/utils/feeding'

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
        const serverItems = result.items.filter((record) => !record.deletedAt)
        const knownIds = new Set(
          [...(append ? this.records : []), ...serverItems].map((record) => record.id),
        )
        const pendingLocal = cached.filter(
          (record) => record.revision === 0 && !knownIds.has(record.id),
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
        } catch {
          // 缓存写入失败不影响当前展示
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
      try {
        await putFeedingRecordCache(record)
      } catch {
        // IndexedDB 不可用时至少保证 Pinia 可用
      }
      try {
        await enqueueOutbox({
          entityType: 'FEEDING_RECORD',
          entityId: record.id,
          op: 'UPSERT',
          baseRevision: 0,
          data: toFeedingSyncData(record),
        })
      } catch {
        // 离线队列写入失败时仍展示记录，lastError 会在同步阶段提示
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
      try {
        await putFeedingRecordCache(updated)
      } catch {
        // 缓存失败不影响 Pinia 展示
      }
      try {
        await enqueueOutbox({
          entityType: 'FEEDING_RECORD',
          entityId: updated.id,
          op: 'UPSERT',
          baseRevision: record.revision,
          data: toFeedingSyncData(updated),
        })
      } catch {
        // 队列失败时至少保留本地修改
      }
      this.mergeRecords([...this.records, updated])
      await this.refreshPendingCount()

      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
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
          ...toFeedingSyncData(updated),
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
        if (isRetryableApiError(error)) {
          this.lastError = errorMessage(error, '网络不可用，修改待同步')
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
      try {
        await deleteFeedingRecordCache(record.id)
      } catch {
        // 缓存删除失败时仍从 Pinia 移除
      }
      this.records = this.records.filter((item) => item.id !== record.id)
      try {
        await enqueueOutbox({
          entityType: 'FEEDING_RECORD',
          entityId: record.id,
          op: 'DELETE',
          baseRevision: record.revision,
        })
      } catch {
        // 队列失败时本地仍视为已删除
      }
      await this.refreshPendingCount()

      if (record.revision === 0) {
        return { status: 'synced' }
      }
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
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
        if (isRetryableApiError(error)) {
          this.lastError = errorMessage(error, '网络不可用，删除待同步')
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
        // 忽略缓存写入失败
      }
      if (record.babyId === this.currentBabyId && record.recordDate === this.currentDate) {
        // 服务端版本必须覆盖同名本地记录
        this.mergeRecords([...this.records, record])
      }
      try {
        await removeOutbox(outboxKey('FEEDING_RECORD', record.id))
      } catch {
        // 忽略
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
        if (!isRetryableApiError(error)) {
          // 4xx 不自动重试：移出队列，本地保留记录
          await removeOutbox(outboxKey('FEEDING_RECORD', record.id))
          this.lastError = errorMessage(error, '记录同步失败')
        } else {
          this.lastError = errorMessage(error, '网络不可用，记录待同步')
        }
        await this.refreshPendingCount()
        return false
      }
    },
  },
})
