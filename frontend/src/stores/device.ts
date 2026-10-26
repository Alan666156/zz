import { defineStore } from 'pinia'
import { initDevice } from '@/api/devices'
import { getOrCreateDeviceId } from '@/utils/device'
import { isStorageAvailable } from '@/utils/storage'

export const useDeviceStore = defineStore('device', {
  state: () => ({
    deviceId: '',
    registered: false,
    initializing: false,
    lastError: null as string | null,
    storageAvailable: true,
  }),
  actions: {
    bootstrap(): void {
      if (!this.deviceId) {
        this.deviceId = getOrCreateDeviceId()
      }
      this.storageAvailable = isStorageAvailable()
    },

    /**
     * 幂等初始化。失败不抛出：离线时应用仍可使用本地数据，
     * 后续请求遇到 409 DEVICE_NOT_REGISTERED 会由 api client 自动 init 并重试一次。
     */
    async init(force = false): Promise<boolean> {
      this.bootstrap()
      if (this.initializing) return this.registered
      if (this.registered && !force) return true
      this.initializing = true
      try {
        const result = await initDevice()
        this.registered = true
        this.lastError = null
        if (!this.deviceId && result.deviceId) {
          this.deviceId = result.deviceId
        }
        return true
      } catch (error) {
        this.registered = false
        this.lastError = error instanceof Error ? error.message : '设备初始化失败'
        return false
      } finally {
        this.initializing = false
      }
    },

    async ensureInitialized(): Promise<boolean> {
      this.bootstrap()
      if (this.registered) return true
      return this.init()
    },

    async onDeviceNotRegistered(): Promise<boolean> {
      this.registered = false
      return this.init(true)
    },

    markRegistered(): void {
      this.registered = true
    },
  },
})
