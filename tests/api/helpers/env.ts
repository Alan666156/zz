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
