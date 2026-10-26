import { useFeedingStore } from '@/stores/feeding'
import type { FeedingRecord, FeedingRecordInput } from '@/types/models'

export interface UseFeedingRecorder {
  save: (input: FeedingRecordInput, babyId: string) => Promise<FeedingRecord>
  syncRecord: (record: FeedingRecord) => Promise<boolean>
}

/**
 * 快速记录编排：
 * 1. 本地落库（IndexedDB + outbox + Pinia）后立即返回，保证 FAB 到成功 ≤3 秒；
 * 2. 在线时 fire-and-forget 单条同步，不阻塞弹窗关闭。
 */
export function useFeedingRecorder(): UseFeedingRecorder {
  const store = useFeedingStore()

  async function save(input: FeedingRecordInput, babyId: string): Promise<FeedingRecord> {
    const record = await store.createLocal(input, babyId)
    const offline = typeof navigator !== 'undefined' && navigator.onLine === false
    if (!offline) {
      void store.syncRecord(record)
    }
    return record
  }

  function syncRecord(record: FeedingRecord): Promise<boolean> {
    return store.syncRecord(record)
  }

  return { save, syncRecord }
}
