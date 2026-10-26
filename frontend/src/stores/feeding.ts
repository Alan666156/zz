import { defineStore } from 'pinia'
import { isRetryableApiError } from '@/api/client'
import { createFeedingRecordRequest, listFeedingRecords } from '@/api/feeding'
import {
  getFeedingRecordsByBabyDate,
  putFeedingRecordCache,
  putFeedingRecordsCache,
} from '@/db'
import { countOutbox, enqueueOutbox, outboxKey, removeOutbox } from '@/db/outbox'
import type {
  DailySummary,
  FeedingRecord,
  FeedingRecordInput,
} from '@/types/models'
import {
  buildLocalFeedingRecord,
  summarizeFeedingRecords,
  toFeedingSyncData,
  validateFeedingInput,
} from '@/utils/feeding'

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

export const useFeedingStore = defineStore('feeding', {
  state: () => ({
    records: [] as FeedingRecord[],
    currentBabyId: null as string | null,
    currentDate: '',
    loading: false,
    pendingCount: 0,
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
        this.pendingCount = await countOutbox('FEEDING_RECORD')
      } catch {
        this.pendingCount = 0
      }
    },

    /** 缓存优先：先渲染 IndexedDB，再拉服务端；失败保留缓存 */
    async loadDay(babyId: string, recordDate: string): Promise<void> {
      if (!babyId) return
      this.currentBabyId = babyId
      this.currentDate = recordDate
      this.loading = true

      let cached: FeedingRecord[] = []
      try {
        cached = await getFeedingRecordsByBabyDate(babyId, recordDate)
      } catch {
        cached = []
      }
      this.mergeRecords(cached)

      try {
        const page = await listFeedingRecords({ babyId, date: recordDate, page: 1, size: 100 })
        const serverItems = page.items.filter((record) => !record.deletedAt)
        // 本地尚未同步成功的记录不能因服务端返回而丢失
        const pendingLocal = cached.filter(
          (record) => record.revision === 0 && !serverItems.some((server) => server.id === record.id),
        )
        this.mergeRecords([...serverItems, ...pendingLocal])
        try {
          await putFeedingRecordsCache(this.records)
        } catch {
          // 缓存写入失败不影响当前展示
        }
        this.lastError = null
      } catch (error) {
        this.mergeRecords(cached)
        this.lastError = errorMessage(error, '记录加载失败，当前显示本地缓存')
      } finally {
        this.loading = false
        await this.refreshPendingCount()
      }
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
