/**
 * 组件/Store 与同步引擎之间的解耦信号。
 * 单向同步失败后由写入方发出，useOfflineSync 收到后触发批量推送。
 */
export const SYNC_REQUEST_EVENT = 'zz:sync-request'

export function requestSync(): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new Event(SYNC_REQUEST_EVENT))
}
