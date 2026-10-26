import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import { useBabyStore } from '@/stores/baby'
import { useDeviceStore } from '@/stores/device'

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    component: () => import('@/components/layout/TabbarLayout.vue'),
    children: [
      {
        path: '',
        name: 'home',
        component: () => import('@/views/HomeView.vue'),
        meta: { title: '首页' },
      },
      {
        path: 'records',
        name: 'records',
        component: () => import('@/views/RecordsView.vue'),
        meta: { title: '记录' },
      },
      {
        path: 'stats',
        name: 'stats',
        component: () => import('@/views/StatsView.vue'),
        meta: { title: '统计' },
      },
      {
        path: 'growth',
        name: 'growth',
        component: () => import('@/views/GrowthView.vue'),
        meta: { title: '生长' },
      },
      {
        path: 'profile',
        name: 'profile',
        component: () => import('@/views/ProfileView.vue'),
        meta: { title: '我的' },
      },
    ],
  },
  {
    path: '/onboarding',
    name: 'onboarding',
    component: () => import('@/views/OnboardingView.vue'),
    meta: { title: '开始使用' },
  },
  {
    path: '/baby/new',
    name: 'baby-new',
    component: () => import('@/views/BabyEditView.vue'),
    meta: { title: '添加宝宝' },
  },
  {
    path: '/baby/:id/edit',
    name: 'baby-edit',
    component: () => import('@/views/BabyEditView.vue'),
    meta: { title: '编辑宝宝' },
  },
  {
    path: '/:pathMatch(.*)*',
    redirect: '/',
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior() {
    return { top: 0 }
  },
})

router.beforeEach(async (to) => {
  const device = useDeviceStore()
  const babyStore = useBabyStore()

  device.bootstrap()
  // 缓存优先，保证离线/无后端时首屏不被阻塞
  await babyStore.load()

  if (to.name !== 'onboarding' && babyStore.babies.length === 0) {
    return { name: 'onboarding' }
  }
  if (to.name === 'onboarding' && babyStore.babies.length > 0) {
    return { name: 'home' }
  }

  // 设备注册在后台进行，不阻塞导航
  void device.ensureInitialized()
  return true
})

export default router
