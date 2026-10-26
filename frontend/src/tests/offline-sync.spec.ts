import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import OfflineBanner from '@/components/common/OfflineBanner.vue'
import { useFeedingRecorder } from '@/composables/useFeedingRecorder'
import { useOfflineSync } from '@/composables/useOfflineSync'
import { listOutbox } from '@/db/outbox'
import { useFeedingStore } from '@/stores/feeding'
import { useSyncStore } from '@/stores/sync'
import type { SyncRunOutcome } from '@/stores/sync'
import { toOffsetISOString, todayLocalDate } from '@/utils/date'
import type { FeedingRecordInput } from '@/types/models'

const Host = defineComponent({
  setup() {
    useOfflineSync()
    return () => h(OfflineBanner)
  },
})

function formulaInput(): FeedingRecordInput {
  return {
    feedType: 'FORMULA',
    amountValue: 120,
    amountUnit: 'ML',
    breastSide: null,
    durationSec: null,
    startedAt: toOffsetISOString(),
    note: null,
    tags: null,
  }
}

function setNavigatorOnline(value: boolean): void {
  Object.defineProperty(window.navigator, 'onLine', {
    configurable: true,
    get: () => value,
  })
}

const syncedOutcome: SyncRunOutcome = {
  status: 'ok',
  applied: 1,
  duplicate: 0,
  conflict: 0,
  rejected: 0,
  pending: 0,
}

describe('离线同步横幅（FIX-FE-01）', () => {
  let wrapper: VueWrapper | null = null

  beforeEach(() => {
    setActivePinia(createPinia())
    setNavigatorOnline(false)
  })

  afterEach(() => {
    wrapper?.unmount()
    wrapper = null
    setNavigatorOnline(true)
    vi.restoreAllMocks()
  })

  async function mountAndSaveOffline(): Promise<VueWrapper> {
    const feeding = useFeedingStore()
    feeding.currentBabyId = 'baby-1'
    feeding.currentDate = todayLocalDate()
    wrapper = mount(Host)
    await useFeedingRecorder().save(formulaInput(), 'baby-1')
    return wrapper
  }

  it('离线保存后 pendingCount 变为 1，横幅显示「待同步 1 条」，且不触发同步', async () => {
    const sync = useSyncStore()
    const syncNowSpy = vi.spyOn(sync, 'syncNow')
    const mounted = await mountAndSaveOffline()

    expect(await listOutbox()).toHaveLength(1)
    await vi.waitFor(() => {
      expect(sync.pendingCount).toBe(1)
      expect(mounted.get('[data-testid="offline-banner"]').text()).toContain('待同步 1 条')
    })
    // 离线只刷新计数，不发网络请求、不进入 syncNow
    expect(syncNowSpy).not.toHaveBeenCalled()
  })

  it('恢复在线后 runSync 正常触发 syncNow', async () => {
    const sync = useSyncStore()
    const syncNowSpy = vi.spyOn(sync, 'syncNow').mockResolvedValue(syncedOutcome)
    await mountAndSaveOffline()

    await vi.waitFor(() => expect(sync.pendingCount).toBe(1))

    setNavigatorOnline(true)
    window.dispatchEvent(new Event('online'))

    await vi.waitFor(() => expect(syncNowSpy).toHaveBeenCalledTimes(1))
  })
})
