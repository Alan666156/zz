import { onBeforeUnmount, onMounted } from 'vue'
import { useSyncStore } from '@/stores/sync'
import { SYNC_REQUEST_EVENT } from '@/utils/sync-events'

/** 在线且有待同步时每 30 秒尝试一次（契约 §5.4） */
const SYNC_INTERVAL_MS = 30_000
const REQUEST_DEBOUNCE_MS = 300

/**
 * 应用级同步生命周期：启动、online/offline、visibilitychange、30 秒定时。
 * 只在 App.vue 调用一次。
 */
export function useOfflineSync(): void {
  const sync = useSyncStore()
  let interval: ReturnType<typeof setInterval> | null = null
  let requestTimer: ReturnType<typeof setTimeout> | null = null

  function scheduleSync(delay = REQUEST_DEBOUNCE_MS): void {
    if (requestTimer) clearTimeout(requestTimer)
    requestTimer = setTimeout(() => {
      requestTimer = null
      void runSync()
    }, delay)
  }

  async function runSync(): Promise<void> {
    if (!sync.online) return
    await sync.refreshPending()
    // 全部是 REJECTED/失败条目时不再自动重试
    if (sync.pendingCount > sync.failedCount) {
      await sync.syncNow()
    }
  }

  function handleOnline(): void {
    sync.setOnline(true)
    scheduleSync(0)
  }

  function handleOffline(): void {
    sync.setOnline(false)
  }

  function handleVisibility(): void {
    if (document.visibilityState === 'visible') {
      scheduleSync(0)
    }
  }

  function handleSyncRequest(): void {
    scheduleSync()
  }

  onMounted(() => {
    sync.start()
    void runSync()
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    window.addEventListener(SYNC_REQUEST_EVENT, handleSyncRequest)
    document.addEventListener('visibilitychange', handleVisibility)
    interval = setInterval(() => {
      if (sync.online && sync.pendingCount > sync.failedCount) {
        void sync.syncNow()
      }
    }, SYNC_INTERVAL_MS)
  })

  onBeforeUnmount(() => {
    window.removeEventListener('online', handleOnline)
    window.removeEventListener('offline', handleOffline)
    window.removeEventListener(SYNC_REQUEST_EVENT, handleSyncRequest)
    document.removeEventListener('visibilitychange', handleVisibility)
    if (interval) clearInterval(interval)
    if (requestTimer) clearTimeout(requestTimer)
    interval = null
    requestTimer = null
  })
}
