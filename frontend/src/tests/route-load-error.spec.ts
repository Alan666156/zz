import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import {
  createMemoryHistory,
  createRouter,
  type RouteRecordRaw,
  type Router,
} from 'vue-router'
import RouteLoadErrorDialog from '@/components/common/RouteLoadErrorDialog.vue'
import {
  installRouteErrorHandler,
  isChunkLoadError,
  navigateSafely,
} from '@/router/route-load-error'
import { useUiStore } from '@/stores/ui'

const CHUNK_ERROR = new Error(
  'Failed to fetch dynamically imported module: http://localhost/assets/RecordsView-abc.js',
)

function makeRouter(loadRecords: () => Promise<unknown>): Router {
  const routes = [
    { path: '/', name: 'home', component: { template: '<div>home</div>' } },
    {
      path: '/records',
      name: 'records',
      component: loadRecords as unknown as RouteRecordRaw['component'],
    },
  ] as RouteRecordRaw[]
  return createRouter({ history: createMemoryHistory(), routes })
}

describe('路由 chunk 加载失败兜底（FIX-FE-11 / Q-24）', () => {
  let wrapper: VueWrapper | null = null

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  afterEach(() => {
    wrapper?.unmount()
    wrapper = null
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  async function mountDialog(router: Router): Promise<{ ui: ReturnType<typeof useUiStore> }> {
    installRouteErrorHandler(router)
    await router.push('/')
    await router.isReady()
    const ui = useUiStore()
    wrapper = mount(RouteLoadErrorDialog, { global: { plugins: [router] } })
    return { ui }
  }

  it('识别常见的动态 import 失败文案', () => {
    expect(isChunkLoadError(CHUNK_ERROR)).toBe(true)
    expect(isChunkLoadError(new Error('Importing a module script failed.'))).toBe(true)
    expect(isChunkLoadError(Object.assign(new Error('x'), { name: 'ChunkLoadError' }))).toBe(true)
    expect(isChunkLoadError(new Error('普通错误'))).toBe(false)
  })

  it('离线导航失败：模态框显示离线文案，路由保持首页；恢复网络重试成功', async () => {
    vi.stubGlobal('navigator', { onLine: false })
    const loadRecords = vi.fn().mockRejectedValue(CHUNK_ERROR)
    const router = makeRouter(() => loadRecords())
    const { ui } = await mountDialog(router)

    await navigateSafely(router, { name: 'records' })
    await flushPromises()

    expect(ui.routeLoadErrorVisible).toBe(true)
    expect(router.currentRoute.value.name).toBe('home')
    const dialog = wrapper!.get('[data-testid="route-load-error"]')
    expect(dialog.text()).toContain('页面加载失败')
    expect(dialog.text()).toContain('当前网络不可用，页面尚未加载，请恢复网络后重试')
    expect(wrapper!.find('[data-testid="route-load-retry"]').exists()).toBe(true)

    loadRecords.mockReset()
    loadRecords.mockResolvedValue({ default: { template: '<div>records</div>' } })
    vi.stubGlobal('navigator', { onLine: true })

    await wrapper!.get('[data-testid="route-load-retry"]').trigger('click')
    await flushPromises()

    await vi.waitFor(() => {
      expect(router.currentRoute.value.name).toBe('records')
    })
    expect(ui.routeLoadErrorVisible).toBe(false)
  })

  it('在线导航失败：显示通用文案；取消后留在当前页', async () => {
    vi.stubGlobal('navigator', { onLine: true })
    const router = makeRouter(() => Promise.reject(CHUNK_ERROR))
    const { ui } = await mountDialog(router)

    await navigateSafely(router, { name: 'records' })
    await flushPromises()

    const dialog = wrapper!.get('[data-testid="route-load-error"]')
    expect(dialog.text()).toContain('页面加载失败，请检查网络后重试')

    await wrapper!.get('[data-testid="route-load-cancel"]').trigger('click')
    await flushPromises()

    expect(ui.routeLoadErrorVisible).toBe(false)
    expect(wrapper!.find('[data-testid="route-load-error"]').exists()).toBe(false)
    expect(router.currentRoute.value.name).toBe('home')
  })

  it('重复失败再次显示同一对话框', async () => {
    vi.stubGlobal('navigator', { onLine: false })
    const router = makeRouter(() => Promise.reject(CHUNK_ERROR))
    const { ui } = await mountDialog(router)

    await navigateSafely(router, { name: 'records' })
    await flushPromises()
    await wrapper!.get('[data-testid="route-load-cancel"]').trigger('click')
    await flushPromises()
    expect(ui.routeLoadErrorVisible).toBe(false)

    await navigateSafely(router, { name: 'records' })
    await flushPromises()

    expect(ui.routeLoadErrorVisible).toBe(true)
    expect(wrapper!.find('[data-testid="route-load-error"]').exists()).toBe(true)
  })

  it('非 chunk 异常不弹框，原样抛出', async () => {
    vi.stubGlobal('navigator', { onLine: true })
    const router = makeRouter(() => Promise.reject(new Error('boom')))
    const { ui } = await mountDialog(router)

    await expect(navigateSafely(router, { name: 'records' })).rejects.toThrow('boom')
    expect(ui.routeLoadErrorVisible).toBe(false)
  })
})
