import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter, type RouteRecordRaw, type Router } from 'vue-router'
import TabbarLayout from '@/components/layout/TabbarLayout.vue'

const StubView = { template: '<div />' }

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    component: { template: '<router-view />' },
    children: [
      { path: '', name: 'home', component: StubView },
      { path: 'records', name: 'records', component: StubView },
      { path: 'stats', name: 'stats', component: StubView },
      { path: 'growth', name: 'growth', component: StubView },
      { path: 'profile', name: 'profile', component: StubView },
    ],
  },
]

function buildRouter(): Router {
  return createRouter({ history: createMemoryHistory(), routes })
}

function activeTabIds(wrapper: VueWrapper): (string | undefined)[] {
  return wrapper
    .findAll('.van-tabbar-item--active')
    .map((item) => item.attributes('data-testid'))
}

describe('底部 Tabbar（FIX-FE-10）', () => {
  let wrapper: VueWrapper | null = null

  beforeEach(() => {
    setActivePinia(createPinia())
  })

  afterEach(() => {
    wrapper?.unmount()
    wrapper = null
  })

  it('从 /profile 点「首页」可回到 /，且仅首页 Tab 高亮', async () => {
    const router = buildRouter()
    await router.push('/profile')
    await router.isReady()
    wrapper = mount(TabbarLayout, { global: { plugins: [router] } })
    await flushPromises()

    expect(activeTabIds(wrapper)).toEqual(['tabbar-profile'])

    await wrapper.get('[data-testid="tabbar-home"]').trigger('click')
    await flushPromises()

    expect(router.currentRoute.value.name).toBe('home')
    expect(router.currentRoute.value.path).toBe('/')
    expect(activeTabIds(wrapper)).toEqual(['tabbar-home'])
  })

  it.each([
    ['tabbar-records', 'records', '/records'],
    ['tabbar-stats', 'stats', '/stats'],
    ['tabbar-growth', 'growth', '/growth'],
    ['tabbar-profile', 'profile', '/profile'],
  ])('点击 %s 后跳转且仅一个 Tab 高亮', async (testid, name, path) => {
    const router = buildRouter()
    await router.push('/')
    await router.isReady()
    wrapper = mount(TabbarLayout, { global: { plugins: [router] } })
    await flushPromises()

    await wrapper.get(`[data-testid="${testid}"]`).trigger('click')
    await flushPromises()

    expect(router.currentRoute.value.name).toBe(name)
    expect(router.currentRoute.value.path).toBe(path)
    expect(activeTabIds(wrapper)).toEqual([testid])
  })
})
