import { execFileSync } from 'node:child_process';

import { DB_HOST, DB_NAME, DB_PASSWORD, DB_PORT, DB_USER, E2E_DB_NAME } from './env';

/**
 * 仅连接 E2E 专用库 zz_e2e 的极简 MySQL 客户端（通过本机 mysql CLI）。
 * 供 DEV-06（禁用设备）、BABY-17、TZ-02/03、EXP-12（造数）等需要 DB 证据的用例使用。
 *
 * 安全约束：库名必须是 zz_e2e；禁止 UPDATE/DELETE 业务数据（DEV-06 的 status 恢复除外）。
 */

function assertDatabase(): void {
  if (DB_NAME !== E2E_DB_NAME) {
    throw new Error(`DB tests must target ${E2E_DB_NAME}, got DB_NAME=${DB_NAME}`);
  }
}

function mysql(args: string[]): string {
  assertDatabase();
  const cliArgs = [
    '--no-defaults',
    '--protocol=TCP',
    '-h',
    DB_HOST,
    '-P',
    DB_PORT,
    '-u',
    DB_USER,
    ...(DB_PASSWORD ? [`-p${DB_PASSWORD}`] : []),
    '-D',
    DB_NAME,
    ...args,
  ];
  return execFileSync('mysql', cliArgs, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

/** 执行 SELECT，返回制表符分隔的行数组（NULL 输出为字面量 NULL）。 */
export function queryRows(sql: string): string[][] {
  const output = mysql(['-N', '-B', '-e', sql]);
  if (!output) return [];
  return output.split(/\r?\n/).map((line) => line.split('\t'));
}

/** 执行 SELECT，返回第一行；无结果返回 null。 */
export function queryOne(sql: string): string[] | null {
  const rows = queryRows(sql);
  return rows[0] ?? null;
}

/** 执行写语句（UPDATE/INSERT/DELETE）。 */
export function execSql(sql: string): void {
  mysql(['-e', sql]);
}

/** SQL 字符串字面量转义（仅用于测试夹具，禁止拼接外部输入）。 */
export function sqlString(value: string): string {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "''")}'`;
}

/** 查询某设备摘要对应的 device 行数（DEV-02 幂等断言）。 */
export function countDevicesByHash(deviceHashHex: string): number {
  const row = queryOne(
    `SELECT COUNT(*) FROM device WHERE device_uid_hash = UNHEX('${deviceHashHex}')`,
  );
  return row ? Number(row[0]) : 0;
}
