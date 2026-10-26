import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios'
import { http } from '@/api/http'
import { type ApiEnvelope } from '@/api/client'
import { useBabyStore } from '@/stores/baby'
import { useDeviceStore } from '@/stores/device'

const originalAdapter = http.defaults.adapter

function ok<T>(config: InternalAxiosRequestConfig, data: T): AxiosResponse<ApiEnvelope<T>> {
  return {
    data: {
      code: 'OK',
      message: 'OK',
      data,
      requestId: 'req-test',
      serverTime: '2026-10-26T00:00:00.000Z',
    },
    status: 200,
    statusText: 'OK',
    headers: {},
    config,
  }
}

function fail(
  config: InternalAxiosRequestConfig,
  status: number,
  code: string,
): Promise<AxiosResponse<ApiEnvelope<unknown>>> {
  const response: AxiosResponse<ApiEnvelope<unknown>> = {
    data: {
      code,
      message: code,
      data: null,
      requestId: 'req-test',
      serverTime: '2026-10-26T00:00:00.000Z',
    },
    status,
    statusText: status === 409 ? 'Conflict' : 'Error',
    headers: {},
    config,
  }
  return Promise.reject(
    new AxiosError(`Request failed with status code ${status}`, 'ERR_BAD_REQUEST', config, {}, response),
  )
}

const DEVICE_RESULT = {
  deviceId: '22222222-2222-4222-8222-222222222222',
  created: true,
  firstSeenAt: '2026-10-26T00:00:00.000Z',
  serverTime: '2026-10-26T00:00:00.000Z',
}

describe('设备初始化去重（UI-01）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  afterEach(() => {
    http.defaults.adapter = originalAdapter
  })

  it('首次 GET /babies 409 只发 1 次 POST /devices/init，之后 ensureInitialized 不再请求', async () => {
    const requests: string[] = []
    let babyCalls = 0

    http.defaults.adapter = async (config) => {
      const method = (config.method ?? 'get').toUpperCase()
      const url = config.url ?? ''
      requests.push(`${method} ${url}`)

      if (url === '/babies') {
        babyCalls += 1
        if (babyCalls === 1) return fail(config, 409, 'DEVICE_NOT_REGISTERED')
        return ok(config, [])
      }
      if (url === '/devices/init') return ok(config, DEVICE_RESULT)
      throw new Error(`unexpected request: ${method} ${url}`)
    }

    const babyStore = useBabyStore()
    const deviceStore = useDeviceStore()

    await babyStore.load()

    expect(requests.filter((item) => item === 'POST /devices/init')).toHaveLength(1)
    expect(deviceStore.registered).toBe(true)

    // 409 兜底初始化已把 store 置为 registered，router 的 ensureInitialized 不应再发请求
    await deviceStore.ensureInitialized()
    expect(requests.filter((item) => item === 'POST /devices/init')).toHaveLength(1)
  })

  it('并发 init() 共享同一个进行中请求，只发一次 POST /devices/init', async () => {
    let initCalls = 0
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })

    http.defaults.adapter = async (config) => {
      const url = config.url ?? ''
      if (url !== '/devices/init') throw new Error(`unexpected request: ${url}`)
      initCalls += 1
      await gate
      return ok(config, DEVICE_RESULT)
    }

    const deviceStore = useDeviceStore()
    // Pinia 会包装 action 返回值，外部 promise 不是同一个对象；
    // 这里验证两者共享同一个底层请求（只发一次），并且都得到 true。
    const first = deviceStore.init()
    const second = deviceStore.init()
    const third = deviceStore.ensureInitialized()
    // 请求拦截器是异步的，adapter 在微任务里才会被调用
    await vi.waitFor(() => expect(initCalls).toBe(1))

    release()
    await expect(Promise.all([first, second, third])).resolves.toEqual([true, true, true])
    expect(initCalls).toBe(1)
    expect(deviceStore.registered).toBe(true)
  })
})
