import { useFeedingStore } from '@/stores/feeding'
import { useSyncStore } from '@/stores/sync'
import type { FeedingRecord, FeedingRecordInput } from '@/types/models'

export interface UseFeedingRecorder {
  save: (input: FeedingRecordInput, babyId: string) => Promise<FeedingRecord>
  syncRecord: (record: FeedingRecord) => Promise<boolean>
}

/**
 * 快速记录编排：
 * 1. 本地落库（IndexedDB + outbox + Pinia）后立即返回，保证 FAB 到成功 ≤3 秒；
 * 2. 在线时 fire-and-forget 触发 outbox 批量推送（契约 §5.4），不阻塞弹窗关闭。
 */
export function useFeedingRecorder(): UseFeedingRecorder {
  const store = useFeedingStore()
  const sync = useSyncStore()

  async function save(input: FeedingRecordInput, babyId: string): Promise<FeedingRecord> {
    const record = await store.createLocal(input, babyId)
    const offline = typeof navigator !== 'undefined' && navigator.onLine === false
    if (!offline) {
      void sync.syncNow()
    }
    return record
  }

  function syncRecord(record: FeedingRecord): Promise<boolean> {
    return store.syncRecord(record)
  }

  return { save, syncRecord }
}
