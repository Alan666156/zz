import { apiPost } from './client'

export interface FeedingExportRequest {
  babyId: string
  from: string
  to: string
}

export interface FeedingExportTicket {
  downloadUrl: string
  /** 服务端签发时间 + 300 秒（契约 Q-16） */
  expiresAt: string
  rowCount: number
}

/** POST /api/v1/exports/feeding-records（契约 §4.9） */
export function createFeedingExport(input: FeedingExportRequest): Promise<FeedingExportTicket> {
  return apiPost<FeedingExportTicket>('/exports/feeding-records', input)
}

const ABSOLUTE_URL_RE = /^https?:\/\//i

/**
 * downloadUrl 由服务端返回，可能带部署前缀。
 * - 绝对地址：原样使用
 * - VITE_API_BASE_URL 为绝对地址：按同源绝对地址补全
 * - 其余：相对当前页面 origin 补全（API 反代与前端同源）
 */
export function resolveExportDownloadUrl(downloadUrl: string): string {
  if (ABSOLUTE_URL_RE.test(downloadUrl)) return downloadUrl
  const base = import.meta.env.VITE_API_BASE_URL || '/api/v1'
  const origin = ABSOLUTE_URL_RE.test(base)
    ? new URL(base).origin
    : typeof window !== 'undefined'
      ? window.location.origin
      : ''
  return `${origin}${downloadUrl.startsWith('/') ? downloadUrl : `/${downloadUrl}`}`
}

/**
 * 签名下载链接是否已过期（Q-16，TTL 300 秒）。
 * expiresAt 缺失或无法解析时按已过期处理，避免把明显失效的链接交给浏览器。
 */
export function isExportLinkExpired(expiresAt: string, now = Date.now()): boolean {
  const expiry = Date.parse(expiresAt)
  if (Number.isNaN(expiry)) return true
  return now >= expiry
}

/**
 * 签名 URL 导航下载（微信/iOS WebView 对 blob 下载支持差）。
 * 使用新窗口/新标签打开，失败时页面保留导出链接供复制。
 */
export function triggerExportDownload(downloadUrl: string): void {
  if (typeof document === 'undefined') return
  const anchor = document.createElement('a')
  anchor.href = resolveExportDownloadUrl(downloadUrl)
  anchor.target = '_blank'
  anchor.rel = 'noopener noreferrer'
  anchor.style.display = 'none'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
}
