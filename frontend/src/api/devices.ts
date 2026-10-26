import { request } from './client'
import { APP_VERSION } from './http'

export interface DeviceInitResult {
  deviceId: string
  created: boolean
  firstSeenAt: string
  serverTime: string
}

export function initDevice(): Promise<DeviceInitResult> {
  return request<DeviceInitResult>({
    method: 'POST',
    url: '/devices/init',
    data: { platform: 'H5', appVersion: APP_VERSION },
  })
}
