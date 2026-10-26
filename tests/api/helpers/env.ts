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

/** Q-26 路径规范化专项开关；N-7 合入并重启后置 1。 */
export const RUN_PATH_NORMALIZATION = process.env.RUN_PATH_NORMALIZATION === '1';

/** Q-25 跨度超限 413 专项开关；后端将 >366 天改判 EXPORT_TOO_LARGE 后置 1。 */
export const RUN_Q25_SPAN = process.env.RUN_Q25_SPAN === '1';

/** 导出 token TTL 固定 300 秒，生产不可配（Q-16）。 */
export const EXPORT_TOKEN_TTL_SECONDS = 300;

/** Redis key 前缀；测试与后端必须一致（addendum §5）。 */
export const REDIS_KEY_PREFIX = process.env.APP_REDIS_KEY_PREFIX ?? 'zz:bf:v1:';

/**
 * Redis 连接（仅 DB14）。SYNC-16 / STATS-06 / 限流用例通过 redis-cli 直接操作；
 * 密码只从环境变量读取，不写入仓库。
 */
export const REDIS_HOST = process.env.REDIS_HOST ?? '127.0.0.1';
export const REDIS_PORT = process.env.REDIS_PORT ?? '6379';
export const REDIS_DATABASE = Number(process.env.REDIS_DATABASE ?? '14');
export const REDIS_PASSWORD = process.env.REDIS_PASSWORD;

/**
 * MySQL 连接（仅 zz_e2e）。DEV-06、BABY-17、TZ-02/03、EXP-12 等需要直接读写数据库。
 */
export const DB_HOST = process.env.DB_HOST ?? '127.0.0.1';
export const DB_PORT = process.env.DB_PORT ?? '3306';
export const DB_USER = process.env.DB_USER ?? 'root';
export const DB_PASSWORD = process.env.DB_PASSWORD;
export const DB_NAME = process.env.DB_NAME ?? 'zz_e2e';

/** 设备摘要密钥；DEV-06 / SYNC-16 / EXP-11 需要计算 device_uid_hash。 */
export const APP_DEVICE_PEPPER = process.env.APP_DEVICE_PEPPER;

/** UTC 今天的 YYYY-MM-DD。日期边界用例以服务端 UTC 日期为基准。 */
export function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

/** 在 YYYY-MM-DD 上加减天数（UTC 日历）。 */
export function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

/** 在 YYYY-MM-DD 上加减年（按实际日历，闰日自然处理）。 */
export function addYears(date: string, years: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCFullYear(value.getUTCFullYear() + years);
  return value.toISOString().slice(0, 10);
}

/** 两个 YYYY-MM-DD 的闭区间天数（含首尾）。 */
export function daySpan(from: string, to: string): number {
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  return Math.round((end - start) / 86_400_000) + 1;
}
