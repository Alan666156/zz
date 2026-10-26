import { REDIS_KEY_PREFIX } from './env';

/**
 * 同步锁与批次幂等 key（addendum §5，commit 63b9b02）：
 *
 *   同步批次锁：  {prefix}lock:sync:{deviceHashHex}          SET NX PX 15000
 *   同步批次幂等：{prefix}sync:{deviceHashHex}:{batchId}      24h
 *
 * 设备作用域一律使用设备 HMAC 摘要 hex，不使用原始设备 UUID；
 * 默认 prefix 为 `zz:bf:v1:`，测试与后端必须使用同一 APP_REDIS_KEY_PREFIX。
 */

export const SYNC_LOCK_TTL_MS = 15_000;
export const SYNC_IDEMPOTENCY_TTL_SECONDS = 24 * 60 * 60;

export function syncLockKey(deviceHashHex: string): string {
  return `${REDIS_KEY_PREFIX}lock:sync:${deviceHashHex}`;
}

export function syncIdempotencyKey(deviceHashHex: string, batchId: string): string {
  return `${REDIS_KEY_PREFIX}sync:${deviceHashHex}:${batchId}`;
}
