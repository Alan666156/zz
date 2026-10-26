/**
 * Q-24 P2：首屏稳定后 idle 预取其余 Tab 的路由 chunk。
 * 只下载模块，不挂载页面；不预取 ECharts（图表仍由页面挂载时按需 import）。
 */
export interface PrefetchNavigatorLike {
  onLine?: boolean
  connection?: {
    saveData?: boolean
    effectiveType?: string
  }
}

const SLOW_EFFECTIVE_TYPES = new Set(['slow-2g', '2g', '3g'])

/** 离线 / 省流 / 弱网直接跳过；无 connection API（Safari）按 idle 兜底 */
export function shouldPrefetchChunks(
  nav: PrefetchNavigatorLike | null = typeof navigator !== 'undefined'
    ? (navigator as PrefetchNavigatorLike)
    : null,
): boolean {
  if (!nav) return false
  if (nav.onLine === false) return false
  if (nav.connection?.saveData === true) return false
  const effectiveType = nav.connection?.effectiveType
  if (effectiveType && SLOW_EFFECTIVE_TYPES.has(effectiveType)) return false
  return true
}

const TAB_CHUNK_LOADERS: Array<() => Promise<unknown>> = [
  () => import('@/views/RecordsView.vue'),
  () => import('@/views/StatsView.vue'),
  () => import('@/views/GrowthView.vue'),
  () => import('@/views/ProfileView.vue'),
]

/** 串行预取，单个失败只记录 debug 日志，不影响后续与首屏 */
export async function prefetchTabChunks(): Promise<void> {
  for (const load of TAB_CHUNK_LOADERS) {
    try {
      await load()
    } catch {
      console.debug('[prefetch] tab chunk load failed')
    }
  }
}

interface IdleDeadlineLike {
  didTimeout: boolean
}

type RequestIdleCallbackLike = (
  callback: (deadline: IdleDeadlineLike) => void,
  options?: { timeout?: number },
) => number

export function scheduleTabPrefetch(): void {
  if (!shouldPrefetchChunks()) return
  const run = (): void => {
    void prefetchTabChunks()
  }
  const requestIdle = (globalThis as { requestIdleCallback?: RequestIdleCallbackLike })
    .requestIdleCallback
  if (typeof requestIdle === 'function') {
    requestIdle(run, { timeout: 3000 })
  } else {
    // Safari / iOS 14 没有 requestIdleCallback
    setTimeout(run, 2500)
  }
}
