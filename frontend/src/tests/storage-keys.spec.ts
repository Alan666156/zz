import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { ACTIVE_BABY_KEY, useBabyStore } from '@/stores/baby'
import { DEVICE_ID_KEY, getOrCreateDeviceId } from '@/utils/device'

const DEVICE_ID = '11111111-1111-4111-8111-111111111111'
const BABY_ID = '22222222-2222-4222-8222-222222222222'

describe('Q-15 localStorage keys', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('旧设备 key 自动迁移到 zz.bf.deviceId', () => {
    window.localStorage.setItem('zz.deviceId', DEVICE_ID)

    expect(getOrCreateDeviceId()).toBe(DEVICE_ID)
    expect(window.localStorage.getItem(DEVICE_ID_KEY)).toBe(DEVICE_ID)
    expect(window.localStorage.getItem('zz.deviceId')).toBeNull()
  })

  it('已有 zz.bf.deviceId 时保持不变并清理旧 key', () => {
    window.localStorage.setItem(DEVICE_ID_KEY, DEVICE_ID)
    window.localStorage.setItem('zz.deviceId', '33333333-3333-4333-8333-333333333333')

    expect(getOrCreateDeviceId()).toBe(DEVICE_ID)
    expect(window.localStorage.getItem('zz.deviceId')).toBeNull()
  })

  it('历史大写设备 UUID 归一为小写（Q-13）', () => {
    const upper = 'AAAAAAAA-BBBB-4CCC-8DDD-EEEEEEEEEEEE'
    window.localStorage.setItem(DEVICE_ID_KEY, upper)

    expect(getOrCreateDeviceId()).toBe('aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee')
    expect(window.localStorage.getItem(DEVICE_ID_KEY)).toBe(
      'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
    )
  })

  it('旧当前宝宝 key 自动迁移到 zz.bf.activeBabyId', () => {
    window.localStorage.setItem('zz.activeBabyId', BABY_ID)

    const store = useBabyStore()

    expect(store.activeBabyId).toBe(BABY_ID)
    expect(window.localStorage.getItem(ACTIVE_BABY_KEY)).toBe(BABY_ID)
    expect(window.localStorage.getItem('zz.activeBabyId')).toBeNull()
  })
})
