import { isUuidV4, uuidV4 } from './uuid'
import { getStorageItem, removeStorageItem, setStorageItem } from './storage'

/** Q-15 固定 key */
export const DEVICE_ID_KEY = 'zz.bf.deviceId'
const LEGACY_DEVICE_ID_KEY = 'zz.deviceId'

let memoryDeviceId: string | null = null

/** 迁移旧版 key，避免升级后丢失设备身份 */
function readStoredDeviceId(): string | null {
  const current = getStorageItem(DEVICE_ID_KEY)
  if (current && isUuidV4(current)) {
    removeStorageItem(LEGACY_DEVICE_ID_KEY)
    return current
  }
  const legacy = getStorageItem(LEGACY_DEVICE_ID_KEY)
  if (legacy && isUuidV4(legacy)) {
    setStorageItem(DEVICE_ID_KEY, legacy)
    removeStorageItem(LEGACY_DEVICE_ID_KEY)
    return legacy
  }
  return null
}

/**
 * 设备 UUID 只生成一次并持久化到 localStorage；
 * 隐私模式下 localStorage 不可用时，在本会话内退化为内存 ID。
 */
export function getOrCreateDeviceId(): string {
  const stored = readStoredDeviceId()
  if (stored) {
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
  return readStoredDeviceId()
}
