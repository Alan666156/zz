import { defineStore } from 'pinia'
import { initDevice } from '@/api/devices'
import { getOrCreateDeviceId } from '@/utils/device'
import { isStorageAvailable } from '@/utils/storage'

/**
 * 模块级 in-flight init：并发调用共享同一个请求。
 * 用 WeakMap 按 store 实例隔离，避免测试中多个 Pinia 实例互相复用旧 promise。
 */
const inFlightInits = new WeakMap<object, Promise<boolean>>()

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
    init(force = false): Promise<boolean> {
      this.bootstrap()
      // 并发调用（router 后台 init + 409 兜底 init）共享同一个请求，只发一次。
      // 刻意不用 async 包裹，否则每次调用都会生成新 promise，无法共享。
      const existing = inFlightInits.get(this)
      if (existing) return existing
      if (this.registered && !force) return Promise.resolve(true)

      const run = (async (): Promise<boolean> => {
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
          inFlightInits.delete(this)
        }
      })()

      inFlightInits.set(this, run)
      return run
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
