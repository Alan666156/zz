import { createHmac } from 'node:crypto';

import { APP_DEVICE_PEPPER } from './env';

/**
 * 设备摘要 = HMAC-SHA256(APP_DEVICE_PEPPER, deviceId) 的小写 hex。
 * 契约 §2.5/§3.2.2；用于按摘要直接操作 Redis 同步锁与查询 device 行。
 * 原始设备 UUID 不会写入 Redis 或 MySQL。
 */
export function deviceHashHex(deviceId: string): string {
  if (!APP_DEVICE_PEPPER) {
    throw new Error('APP_DEVICE_PEPPER is required to compute device_uid_hash');
  }
  return createHmac('sha256', APP_DEVICE_PEPPER)
    .update(deviceId, 'utf8')
    .digest('hex');
}
