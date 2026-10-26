/**
 * 测试环境常量。禁止在这里写真实密码/密钥。
 * 对应文档：docs/tests/v1.0.md §2、§24。
 */

export const API_BASE_URL = process.env.API_BASE_URL ?? 'http://127.0.0.1:8080';
export const WEB_BASE_URL = process.env.WEB_BASE_URL ?? 'http://127.0.0.1:4173';
export const API_PREFIX = '/api/v1';
export const API_CLIENT_VERSION = '1.0.0-e2e';

/** E2E 专用库；reset 脚本会校验，拒绝其他库。 */
export const E2E_DB_NAME = 'zz_e2e';
/** E2E 专用 Redis DB；reset 脚本会校验，拒绝其他 DB。 */
export const E2E_REDIS_DB = 14;

export const DEFAULT_TZ_OFFSET = '+08:00';

function intEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer, got "${raw}"`);
  }
  return value;
}

/**
 * 限流阈值（Q-12）。测试上下文用低阈值加速；默认值与生产契约一致。
 * 后端必须以相同环境变量启动，否则响应头 X-RateLimit-Limit 会与这里不一致。
 */
export const RATE_LIMIT_API_PER_MINUTE = intEnv('APP_RATE_LIMIT_API_PER_MINUTE', 120);
export const RATE_LIMIT_INIT_PER_HOUR = intEnv('APP_RATE_LIMIT_INIT_PER_HOUR', 10);
export const RATE_LIMIT_EXPORT_PER_HOUR = intEnv('APP_RATE_LIMIT_EXPORT_PER_HOUR', 5);
export const RATE_LIMIT_SYNC_PER_MINUTE = intEnv('APP_RATE_LIMIT_SYNC_PER_MINUTE', 30);

/** 限流专项开关；只有独立一轮才置 1。 */
export const RUN_RATE_LIMIT = process.env.RUN_RATE_LIMIT === '1';

/** 导出 token TTL 固定 300 秒，生产不可配（Q-16）。 */
export const EXPORT_TOKEN_TTL_SECONDS = 300;
