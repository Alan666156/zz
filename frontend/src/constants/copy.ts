/**
 * FE-07 固定的用户可见文案（Q-15 / Q-16）。
 * 修改时必须同步 `frontend/README.md` 的「固定文案」章节，E2E 依赖这些文本。
 */

export const DATA_LOSS_WARNING =
  '宝宝与记录绑定当前设备 ID。清除浏览器数据、更换浏览器/设备或丢失设备 ID，都会导致本机数据无法找回；离线期间尚未同步的记录也会一并丢失。请勿在无痕模式长期使用。'

export const STORAGE_UNAVAILABLE_WARNING =
  '当前浏览器无法持久保存设备 ID（可能是无痕模式）。关闭无痕模式后才能保留数据。'

export const OFFLINE_BANNER_OFFLINE = '当前离线，记录会先保存在本机，联网后自动同步'

export function offlinePendingText(count: number): string {
  return `待同步 ${count} 条，联网后自动同步`
}

export function offlineBannerOfflineText(count: number): string {
  return count > 0 ? `${OFFLINE_BANNER_OFFLINE}（待同步 ${count} 条）` : OFFLINE_BANNER_OFFLINE
}

export function syncingText(count: number): string {
  return `正在同步 ${count} 条记录…`
}

export function syncFailedText(count: number): string {
  return `有 ${count} 条同步失败，请打开记录修改后重试`
}

export const EXPORT_FALLBACK_COPY =
  '若未开始下载，请复制链接到浏览器打开（链接 5 分钟内有效）。'

export const EXPORT_FAILURE_COPY = '导出失败，请稍后重试。'

export const EXPORT_RATE_LIMIT_COPY = '导出过于频繁（每小时最多 5 次），请稍后再试。'

export const EXPORT_TOO_LARGE_COPY = '导出数据过多，请缩小日期范围后重试。'

export const EXPORT_CLIPBOARD_UNAVAILABLE_COPY = '当前环境无法自动复制，请长按链接手动复制。'

export const EXPORT_LINK_EXPIRED_COPY = '下载链接已过期，请重新导出。'

/** UI-17 / 契约 §4.7 固定文案，不得改写 */
export const SYNC_CONFLICT_COPY = '该记录已在其他端更新'

/** Q-24 路由 chunk 加载失败固定文案，E2E 依赖，逐字不得改写 */
export const ROUTE_LOAD_ERROR_TITLE = '页面加载失败'
export const ROUTE_LOAD_ERROR_OFFLINE = '当前网络不可用，页面尚未加载，请恢复网络后重试'
export const ROUTE_LOAD_ERROR_GENERIC = '页面加载失败，请检查网络后重试'
export const ROUTE_LOAD_ERROR_RETRY = '重试'
export const ROUTE_LOAD_ERROR_CANCEL = '取消'
