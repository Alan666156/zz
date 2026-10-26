import axios from 'axios'
import { getOrCreateDeviceId } from '@/utils/device'

export const APP_VERSION = '1.0.0'

export const http = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api/v1',
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
})

http.interceptors.request.use((config) => {
  config.headers.set('X-Device-Id', getOrCreateDeviceId())
  config.headers.set('X-Client-Version', APP_VERSION)
  return config
})
