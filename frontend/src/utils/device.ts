import { isUuidV4, uuidV4 } from './uuid'
import { getStorageItem, setStorageItem } from './storage'

export const DEVICE_ID_KEY = 'zz.deviceId'

let memoryDeviceId: string | null = null

/**
 * 设备 UUID 只生成一次并持久化到 localStorage；
 * 隐私模式下 localStorage 不可用时，在本会话内退化为内存 ID。
 */
export function getOrCreateDeviceId(): string {
  const stored = getStorageItem(DEVICE_ID_KEY)
  if (stored && isUuidV4(stored)) {
    memoryDeviceId = stored
    return stored
  }
  if (memoryDeviceId) {
    setStorageItem(DEVICE_ID_KEY, memoryDeviceId)
    return memoryDeviceId
  }
  const created = uuidV4()
  memoryDeviceId = created
  setStorageItem(DEVICE_ID_KEY, created)
  return created
}

export function readDeviceId(): string | null {
  const stored = getStorageItem(DEVICE_ID_KEY)
  return stored && isUuidV4(stored) ? stored : null
}
