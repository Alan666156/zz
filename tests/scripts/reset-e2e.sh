#!/usr/bin/env bash
#
# 重置 E2E 环境：仅 zz_e2e 业务表 + Redis DB 14。
# 安全约束：
#   - 库名必须是 zz_e2e；
#   - Redis DB 必须是 14；
#   - 不清理 flyway_schema_history；
#   - 密码只从环境变量读取，禁止写进脚本。
#
# 用法：
#   export DB_PASSWORD=... REDIS_PASSWORD=...
#   npm run reset:env
#
set -euo pipefail

DB_HOST="${DB_HOST:-127.0.0.1}"
DB_PORT="${DB_PORT:-3306}"
DB_USER="${DB_USER:-root}"
DB_NAME="${DB_NAME:-zz_e2e}"

REDIS_HOST="${REDIS_HOST:-127.0.0.1}"
REDIS_PORT="${REDIS_PORT:-6379}"
REDIS_DATABASE="${REDIS_DATABASE:-14}"

if [[ "${DB_NAME}" != "zz_e2e" ]]; then
  echo "拒绝执行：DB_NAME 必须是 zz_e2e，当前为 '${DB_NAME}'" >&2
  exit 1
fi

if [[ "${REDIS_DATABASE}" != "14" ]]; then
  echo "拒绝执行：REDIS_DATABASE 必须是 14，当前为 '${REDIS_DATABASE}'" >&2
  exit 1
fi

: "${DB_PASSWORD:?必须设置 DB_PASSWORD（本机测试密码，不要提交）}"
: "${REDIS_PASSWORD:?必须设置 REDIS_PASSWORD（本机测试密码，不要提交）}"

echo "重置 MySQL ${DB_NAME} ..."
MYSQL_PWD="${DB_PASSWORD}" mysql --no-defaults \
  -h "${DB_HOST}" -P "${DB_PORT}" -u "${DB_USER}" -D "${DB_NAME}" -e "
SET FOREIGN_KEY_CHECKS = 0;
TRUNCATE TABLE feeding_record;
TRUNCATE TABLE growth_record;
TRUNCATE TABLE baby;
TRUNCATE TABLE family_member;
TRUNCATE TABLE family;
TRUNCATE TABLE device;
TRUNCATE TABLE app_user;
SET FOREIGN_KEY_CHECKS = 1;
"

echo "清空 Redis DB ${REDIS_DATABASE} ..."
REDISCLI_AUTH="${REDIS_PASSWORD}" redis-cli \
  -h "${REDIS_HOST}" -p "${REDIS_PORT}" -n "${REDIS_DATABASE}" FLUSHDB >/dev/null

echo "完成：${DB_NAME} 业务表已清空，Redis DB ${REDIS_DATABASE} 已 FLUSH。"
