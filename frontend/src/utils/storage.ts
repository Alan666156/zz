const memory = new Map<string, string>()

/**
 * localStorage 在隐私模式/被禁用时会抛错。
 * 这里做无感知降级：同一会话内退化为内存存储。
 */
export function isStorageAvailable(): boolean {
  try {
    const probe = '__zz_storage_probe__'
    window.localStorage.setItem(probe, '1')
    window.localStorage.removeItem(probe)
    return true
  } catch {
    return false
  }
}

export function getStorageItem(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return memory.get(key) ?? null
  }
}

export function setStorageItem(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    memory.set(key, value)
  }
}

export function removeStorageItem(key: string): void {
  try {
    window.localStorage.removeItem(key)
  } catch {
    memory.delete(key)
  }
}
