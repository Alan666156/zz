import type {
  AxiosError,
  AxiosRequestConfig,
  InternalAxiosRequestConfig,
} from 'axios'
import { http } from './http'
import { initDevice } from './devices'

export interface ApiEnvelope<T> {
  code: string
  message: string
  data: T
  requestId: string
  serverTime: string
}

export class ApiError extends Error {
  readonly code: string
  readonly status: number
  readonly data: unknown
  readonly requestId?: string
  /** 429 / 409 SYNC_IN_PROGRESS 的 Retry-After（秒） */
  readonly retryAfter?: number

  constructor(
    code: string,
    status: number,
    message: string,
    data?: unknown,
    requestId?: string,
    retryAfter?: number,
  ) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.status = status
    this.data = data
    this.requestId = requestId
    this.retryAfter = retryAfter
  }
}

interface RetryableConfig extends InternalAxiosRequestConfig {
  _deviceRetried?: boolean
}

function parseRetryAfter(headers: unknown): number | undefined {
  if (!headers || typeof headers !== 'object') return undefined
  const raw = (headers as Record<string, unknown>)['retry-after']
  const seconds = Number(raw)
  return Number.isFinite(seconds) && seconds > 0 ? seconds : undefined
}

function toApiError(error: AxiosError<ApiEnvelope<unknown>>): ApiError {
  const response = error.response
  const body = response?.data
  if (body && typeof body === 'object' && typeof body.code === 'string') {
    return new ApiError(
      body.code,
      response?.status ?? 0,
      body.message || body.code,
      body.data,
      body.requestId,
      parseRetryAfter(response?.headers),
    )
  }
  if (error.code === 'ECONNABORTED') {
    return new ApiError('TIMEOUT', 0, '请求超时，请稍后重试')
  }
  return new ApiError('NETWORK_ERROR', 0, '网络不可用，已保存到本机')
}

/**
 * 409 兜底初始化：走 device store，保证 registered 状态同步，
 * 后续 ensureInitialized() 不会重复 init。
 * 用动态 import 避免 client ↔ store 的顶层循环依赖。
 */
async function registerDeviceViaStore(): Promise<void> {
  try {
    const { useDeviceStore } = await import('@/stores/device')
    const store = useDeviceStore()
    const ok = await store.onDeviceNotRegistered()
    if (!ok) {
      throw new ApiError(
        'DEVICE_NOT_REGISTERED',
        409,
        store.lastError ?? '设备初始化失败',
      )
    }
  } catch (error) {
    if (error instanceof ApiError) throw error
    // Pinia 未激活等极端场景：退回直接 init（不更新 store）
    await initDevice()
  }
}

/**
 * 统一响应包处理：
 * - HTTP 200 + code!=OK 也视为业务错误
 * - 409 DEVICE_NOT_REGISTERED：自动 init 后重试一次（仅一次）
 */
http.interceptors.response.use(
  (response) => {
    const body = response.data as ApiEnvelope<unknown> | undefined
    if (body && typeof body === 'object' && 'code' in body && body.code !== 'OK') {
      throw new ApiError(
        body.code,
        response.status,
        body.message || body.code,
        body.data,
        body.requestId,
        parseRetryAfter(response.headers),
      )
    }
    return response
  },
  async (error: AxiosError<ApiEnvelope<unknown>>) => {
    const config = error.config as RetryableConfig | undefined
    const body = error.response?.data
    if (
      error.response?.status === 409 &&
      body?.code === 'DEVICE_NOT_REGISTERED' &&
      config &&
      !config._deviceRetried
    ) {
      config._deviceRetried = true
      try {
        await registerDeviceViaStore()
        return await http.request(config)
      } catch (retryError) {
        if (retryError instanceof ApiError) throw retryError
        throw toApiError(retryError as AxiosError<ApiEnvelope<unknown>>)
      }
    }
    throw toApiError(error)
  },
)

export async function request<T>(config: AxiosRequestConfig): Promise<T> {
  const response = await http.request<ApiEnvelope<T>>(config)
  return response.data.data
}

export function apiGet<T>(url: string, params?: Record<string, unknown>): Promise<T> {
  return request<T>({ method: 'GET', url, params })
}

export function apiPost<T>(url: string, data?: unknown): Promise<T> {
  return request<T>({ method: 'POST', url, data })
}

export function apiPatch<T>(url: string, data?: unknown): Promise<T> {
  return request<T>({ method: 'PATCH', url, data })
}

export function apiDelete<T>(url: string, params?: Record<string, unknown>): Promise<T> {
  return request<T>({ method: 'DELETE', url, params })
}

/**
 * 网络/服务端/限流错误可以重试（留给 outbox 同步）；
 * 4xx 业务错误不自动重试。
 */
export function isRetryableApiError(error: unknown): boolean {
  if (!(error instanceof ApiError)) return true
  if (error.status === 0) return true
  if (error.status === 429) return true
  return error.status >= 500
}
