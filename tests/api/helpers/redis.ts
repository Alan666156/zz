import { execFileSync } from 'node:child_process';

import {
  E2E_REDIS_DB,
  REDIS_DATABASE,
  REDIS_HOST,
  REDIS_PASSWORD,
  REDIS_PORT,
  REDIS_KEY_PREFIX,
} from './env';

/**
 * 仅操作 E2E 专用 Redis DB 14 的极简客户端（通过本机 redis-cli）。
 * 用于确定性触发同步锁（SYNC-16）、统计缓存（STATS-06）与限流计数（RL-*）。
 *
 * 安全约束：库号必须为 14；不触碰 DB 0/15，也不读取业务数据。
 */

function assertDatabase(): void {
  if (REDIS_DATABASE !== E2E_REDIS_DB) {
    throw new Error(
      `Redis tests must target DB ${E2E_REDIS_DB}, got REDIS_DATABASE=${REDIS_DATABASE}`,
    );
  }
}

function redisCli(...args: string[]): string {
  assertDatabase();
  const cliArgs = [
    '-h',
    REDIS_HOST,
    '-p',
    REDIS_PORT,
    '-n',
    String(REDIS_DATABASE),
    ...(REDIS_PASSWORD ? ['-a', REDIS_PASSWORD, '--no-auth-warning'] : []),
    ...args,
  ];
  return execFileSync('redis-cli', cliArgs, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

/** 清空 DB14（限流计数、统计缓存、同步锁/幂等键）。每个 API 用例前调用。 */
export function flushRedisDb(): void {
  redisCli('FLUSHDB');
}

/** SET key value NX PX ttlMs；返回是否成功抢到。 */
export function redisSetNxPx(key: string, value: string, ttlMs: number): boolean {
  const result = redisCli('SET', key, value, 'NX', 'PX', String(ttlMs));
  return result === 'OK';
}

/** 不带条件写入（用于测试预占锁后恢复现场等场景）。 */
export function redisSet(key: string, value: string, ttlMs?: number): void {
  const args = ttlMs === undefined
    ? ['SET', key, value]
    : ['SET', key, value, 'PX', String(ttlMs)];
  redisCli(...args);
}

export function redisGet(key: string): string | null {
  const result = redisCli('GET', key);
  return result === '' ? null : result;
}

export function redisExists(key: string): boolean {
  return redisCli('EXISTS', key) === '1';
}

export function redisTtl(key: string): number {
  return Number(redisCli('TTL', key));
}

export function redisDel(key: string): void {
  redisCli('DEL', key);
}

/**
 * Lua compare-and-delete：只删除值仍等于 value 的锁，避免误删他人持有的锁。
 * 返回删除条数（0/1）。
 */
export function redisCompareAndDelete(key: string, value: string): number {
  const script =
    "if redis.call('GET', KEYS[1]) == ARGV[1] then " +
    "return redis.call('DEL', KEYS[1]) else return 0 end";
  return Number(redisCli('EVAL', script, '1', key, value));
}

/** 同步锁 key（addendum §5 / commit 63b9b02）。 */
export function syncLockKeyOf(deviceHashHex: string): string {
  return `${REDIS_KEY_PREFIX}lock:sync:${deviceHashHex}`;
}

/** 同步批次幂等 key（addendum §5 / commit 63b9b02）。 */
export function syncBatchKeyOf(deviceHashHex: string, batchId: string): string {
  return `${REDIS_KEY_PREFIX}sync:${deviceHashHex}:${batchId}`;
}
