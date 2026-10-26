import type { RouteLocationRaw, Router } from 'vue-router'
import { useUiStore } from '@/stores/ui'

/**
 * Q-24：路由懒加载 chunk 下载失败（常见于断网后访问从未打开过的 Tab）。
 * 浏览器/打包器文案不一致，这里按关键片段识别。
 */
const CHUNK_ERROR_MARKERS = [
  'Failed to fetch dynamically imported module',
  'Importing a module script failed',
  'ChunkLoadError',
  'error loading dynamically imported module',
]

function errorText(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`
  if (typeof error === 'string') return error
  try {
    return JSON.stringify(error)
  } catch {
    return String(error)
  }
}

export function isChunkLoadError(error: unknown): boolean {
  const text = errorText(error)
  return CHUNK_ERROR_MARKERS.some((marker) => text.includes(marker))
}

function isOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false
}

/**
 * chunk 加载失败时弹模态框（离线/其他两套固定文案）并返回 true；
 * 非 chunk 异常返回 false，由调用方继续走全局错误处理。
 */
export function reportRouteLoadError(error: unknown, target: string | null): boolean {
  if (!isChunkLoadError(error)) return false
  useUiStore().showRouteLoadError({ offline: isOffline(), target })
  return true
}

function resolveTarget(router: Router, to: RouteLocationRaw): string | null {
  try {
    return router.resolve(to).fullPath
  } catch {
    return typeof to === 'string' ? to : null
  }
}

/**
 * 统一导航入口：捕获 chunk 加载失败并交给全局模态框，不静默中止。
 * 非 chunk 异常原样抛出，保持原有错误处理。
 */
export async function navigateSafely(
  router: Router,
  to: RouteLocationRaw,
  options: { replace?: boolean } = {},
): Promise<void> {
  const target = resolveTarget(router, to)
  try {
    if (options.replace) {
      await router.replace(to)
    } else {
      await router.push(to)
    }
  } catch (error) {
    if (reportRouteLoadError(error, target)) return
    throw error
  }
}

/** 挂到 router.onError，覆盖 Vant Tabbar 等绕过 navigateSafely 的导航 */
export function installRouteErrorHandler(router: Router): void {
  router.onError((error, to) => {
    if (reportRouteLoadError(error, to?.fullPath ?? null)) return
    console.error('[router] navigation error', error)
  })
}
