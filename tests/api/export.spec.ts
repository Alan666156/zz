import { expect, test } from '@playwright/test';

import { expectError, expectOk, type ApiClient } from './helpers/api-client';
import {
  CSV_HEADER,
  UTF8_BOM,
  downloadCsv,
  parseCsv,
  stripBom,
} from './helpers/csv';
import { execSql, queryOne } from './helpers/db';
import { deviceHashHex } from './helpers/device-hash';
import { RATE_LIMIT_EXPORT_PER_HOUR } from './helpers/env';
import {
  decodeExportTokenPayload,
  requireExportTokenKey,
  signExpiredExportToken,
} from './helpers/export-token';
import { at, uuid } from './helpers/fixtures';
import {
  createBaby,
  createFeeding,
  resetApiState,
  seedStatsFixture,
  setupBaby,
} from './helpers/scenario';

interface ExportTicket {
  downloadUrl: string;
  expiresAt: string;
  rowCount: number;
}

async function requestExport(
  client: ApiClient,
  babyId: string,
  from = '2026-10-20',
  to = '2026-10-20',
) {
  return client.post('/exports/feeding-records', { babyId, from, to });
}

function tokenOf(downloadUrl: string): string {
  const start = '/exports/feeding-records/';
  const index = downloadUrl.indexOf(start);
  return downloadUrl.slice(index + start.length).replace(/\.csv$/, '');
}

/**
 * 契约：docs/architecture/v1.0-baby-feeding.md §4.9、addendum Q-01/Q-16
 * 用例：docs/tests/v1.0.md §12（EXP-01..EXP-12）
 * 状态：TE-02 可执行断言。
 */
test.describe('CSV 导出（EXP）', () => {
  test.beforeEach(async () => {
    await resetApiState();
  });

  test('EXP-01 申请导出返回签名下载信息', async ({ request }) => {
    const { client, baby } = await setupBaby(request);
    await seedStatsFixture(client, baby.id);

    const before = Date.now();
    const response = await requestExport(client, baby.id);
    const body = await expectOk<ExportTicket>(response);
    const after = Date.now();

    expect(body.data.rowCount).toBe(8);
    expect(body.data.downloadUrl).toMatch(
      /^\/api\/v1\/exports\/feeding-records\/.+\.csv$/,
    );
    expect(body.data.expiresAt).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
    );
    const expiresAt = Date.parse(body.data.expiresAt);
    expect(expiresAt).toBeGreaterThanOrEqual(before + 295_000);
    expect(expiresAt).toBeLessThanOrEqual(after + 305_000);
    expect(response.headers()['cache-control']).toBe('no-store');
  });

  test('EXP-02 下载 CSV 不需要设备头且响应头精确', async ({ request }) => {
    const { client, baby } = await setupBaby(request);
    await seedStatsFixture(client, baby.id);
    const ticket = await expectOk<ExportTicket>(await requestExport(client, baby.id));

    const download = await downloadCsv(request, ticket.data.downloadUrl);
    expect(download.status).toBe(200);
    // Q-21：按 MIME 语义判定，允许参数名/值大小写差异与分号前后可选空白。
    expect(download.headers['content-type']).toMatch(
      /^text\/csv\s*;\s*charset\s*=\s*utf-8$/i,
    );
    expect(download.headers['content-disposition']).toBe(
      'attachment; filename="feeding-records-2026-10-20-2026-10-20.csv"',
    );
    expect(download.headers['cache-control']).toBe('no-store');
    expect(download.headers['x-content-type-options']).toBe('nosniff');

    const withOtherDevice = await downloadCsv(request, ticket.data.downloadUrl, {
      'X-Device-Id': uuid(),
    });
    expect(withOtherDevice.status).toBe(200);
    expect(withOtherDevice.bytes.equals(download.bytes)).toBe(true);
  });

  test('EXP-03 BOM、CRLF 与表头', async ({ request }) => {
    const { client, baby } = await setupBaby(request);
    await seedStatsFixture(client, baby.id);
    const ticket = await expectOk<ExportTicket>(await requestExport(client, baby.id));
    const download = await downloadCsv(request, ticket.data.downloadUrl);

    expect(download.bytes.subarray(0, 3).equals(UTF8_BOM)).toBe(true);
    const text = stripBom(download.text);
    const lines = text.split('\r\n');
    expect(lines[0]).toBe(CSV_HEADER);
    expect(text.endsWith('\r\n')).toBe(true);
    expect(text).toContain('小满');
    expect(text).toContain('母乳');
  });

  test('EXP-04 数据行内容、中文标签与排序', async ({ request }) => {
    const { client, baby } = await setupBaby(request);
    const fixture = await seedStatsFixture(client, baby.id);

    const firstTicket = await expectOk<ExportTicket>(await requestExport(client, baby.id));
    const firstDownload = await downloadCsv(request, firstTicket.data.downloadUrl);
    const firstRows = parseCsv(stripBom(firstDownload.text));
    expect(firstRows).toHaveLength(9);
    expect(firstRows.some((row) => row[0] === fixture.ids.deletedFormula500)).toBe(false);

    expect(firstRows[1]).toEqual([
      fixture.ids.breastLeft,
      '小满',
      '母乳',
      '2026-10-20T08:00:00+08:00',
      '2026-10-20T08:15:00+08:00',
      '900',
      '左侧',
      '',
      '',
      '中途有点吐奶',
      '吐奶',
      '2026-10-20',
    ]);
    expect(firstRows[8][3]).toBe('2026-10-20T15:00:00+08:00');

    const formulaRow = firstRows.find((row) => row[0] === fixture.ids.formula120);
    expect(formulaRow?.[2]).toBe('配方奶');
    expect(formulaRow?.[7]).toBe('120.0');
    expect(formulaRow?.[8]).toBe('毫升');

    const mixedRow = firstRows.find((row) => row[0] === fixture.ids.mixed);
    expect(mixedRow?.[2]).toBe('混合');
    expect(mixedRow?.[6]).toBe('双侧');

    const solidRow = firstRows.find((row) => row[0] === fixture.ids.solid30);
    expect(solidRow?.[2]).toBe('辅食');
    expect(solidRow?.[8]).toBe('克');

    await createFeeding(client, baby.id, {
      feedType: 'FORMULA',
      amountValue: 120,
      amountUnit: 'ML',
      startedAt: at('2026-10-20', '17:00:00'),
      endedAt: null,
      durationSec: null,
      tags: ['SLEEPY', 'SPIT_UP'],
      note: null,
    });

    const secondTicket = await expectOk<ExportTicket>(await requestExport(client, baby.id));
    const secondDownload = await downloadCsv(request, secondTicket.data.downloadUrl);
    const secondRows = parseCsv(stripBom(secondDownload.text));
    expect(secondRows).toHaveLength(10);
    const multiTag = secondRows.find((row) => row[10] === '吐奶|困倦');
    expect(multiTag, 'multi-tag row with SPIT_UP|SLEEPY').toBeTruthy();
  });

  test('EXP-05 CSV 引号、逗号、换行转义', async ({ request }) => {
    const { client, baby } = await setupBaby(request);
    const note = 'a,b"c\r\nd';
    await createFeeding(client, baby.id, {
      startedAt: at('2026-10-20', '08:00:00'),
      note,
      tags: [],
      feedType: 'FORMULA',
      amountValue: 120,
      amountUnit: 'ML',
    });

    const ticket = await expectOk<ExportTicket>(await requestExport(client, baby.id));
    const download = await downloadCsv(request, ticket.data.downloadUrl);
    const text = stripBom(download.text);
    expect(text).toContain('"a,b""c\r\nd"');

    const rows = parseCsv(text);
    expect(rows[1][9]).toBe(note);

    await expectOk(
      await client.patch(`/babies/${baby.id}`, { baseRevision: 1, name: '小,满' }),
    );
    const renamedTicket = await expectOk<ExportTicket>(
      await requestExport(client, baby.id),
    );
    const renamed = await downloadCsv(request, renamedTicket.data.downloadUrl);
    const renamedRows = parseCsv(stripBom(renamed.text));
    expect(renamedRows[1][1]).toBe('小,满');
  });

  test('EXP-06 公式注入转义', async ({ request }) => {
    const { client, baby } = await setupBaby(request);
    const notes = ['=1+1', '+SUM(A1)', '-2+3', '@cmd', '\tTAB', '\rCR'];

    for (const [index, note] of notes.entries()) {
      await createFeeding(client, baby.id, {
        startedAt: at('2026-10-20', `${String(8 + index).padStart(2, '0')}:00:00`),
        note,
        tags: [],
        feedType: 'FORMULA',
        amountValue: 120,
        amountUnit: 'ML',
      });
    }

    const ticket = await expectOk<ExportTicket>(await requestExport(client, baby.id));
    const download = await downloadCsv(request, ticket.data.downloadUrl);
    const rows = parseCsv(stripBom(download.text));
    const noteCells = rows.slice(1).map((row) => row[9]);

    expect(noteCells).toHaveLength(6);
    for (const cell of noteCells) {
      expect(cell.startsWith("'"), `cell should be escaped: ${JSON.stringify(cell)}`).toBe(
        true,
      );
    }
    expect(noteCells.some((cell) => cell.startsWith('=1+1'))).toBe(false);
  });

  test('EXP-07 空结果仍返回表头', async ({ request }) => {
    const { client } = await setupBaby(request);
    const emptyBaby = await createBaby(client, { name: '空宝宝', isDefault: false });

    const ticket = await expectOk<ExportTicket>(
      await requestExport(client, emptyBaby.id),
    );
    expect(ticket.data.rowCount).toBe(0);

    const download = await downloadCsv(request, ticket.data.downloadUrl);
    expect(download.status).toBe(200);
    expect(stripBom(download.text)).toBe(`${CSV_HEADER}\r\n`);
  });

  test('EXP-08 导出只含指定宝宝未删除记录；已删除宝宝 404', async ({ request }) => {
    const { client, baby } = await setupBaby(request);
    await seedStatsFixture(client, baby.id);

    const otherBaby = await createBaby(client, { name: 'B2', isDefault: false });
    await createFeeding(client, otherBaby.id, { startedAt: at('2026-10-20', '18:00:00') });
    await createFeeding(client, otherBaby.id, { startedAt: at('2026-10-20', '19:00:00') });

    const ticket = await expectOk<ExportTicket>(await requestExport(client, baby.id));
    const download = await downloadCsv(request, ticket.data.downloadUrl);
    const rows = parseCsv(stripBom(download.text));
    expect(rows).toHaveLength(9);
    expect(rows.some((row) => row[0] === otherBaby.id)).toBe(false);
    expect(rows.filter((row) => row[1] === '小满')).toHaveLength(8);

    const token = tokenOf(ticket.data.downloadUrl);
    await expectOk(await client.delete(`/babies/${baby.id}?baseRevision=1`));
    const afterDelete = await downloadCsv(
      request,
      `/api/v1/exports/feeding-records/${token}.csv`,
    );
    expect(afterDelete.status).toBe(404);
    expect(JSON.parse(afterDelete.text).code).toBe('NOT_FOUND');
  });

  test('EXP-09 导出参数校验、失败不计数与设备归属', async ({ request }) => {
    const { client, baby } = await setupBaby(request);
    const otherDevice = await setupBaby(request);

    // Q-20：失败请求预占后回滚，不消耗导出口径；5 次非法请求后 remaining 仍为 5。
    // Q-27：跨度 367 天改为 413 EXPORT_TOO_LARGE（见 EXP-14），不再属于 400 校验失败。
    for (const payload of [
      { from: '2026-10-20', to: '2026-10-20' },
      { babyId: baby.id },
      { babyId: baby.id, from: '2026-10-20' },
      { babyId: baby.id, from: '2026-10-21', to: '2026-10-20' },
      { babyId: baby.id, from: '2026/10/20', to: '2026-10-20' },
    ]) {
      const response = await client.post('/exports/feeding-records', payload);
      await expectError(response, 400, 'VALIDATION_ERROR');
      expect(response.headers()['x-ratelimit-limit']).toBe('5');
      expect(response.headers()['x-ratelimit-remaining']).toBe('5');
    }

    // 5 次成功签发依次消耗配额：4 → 3 → 2 → 1 → 0。
    const remainingAfterSuccess: string[] = [];
    for (let index = 0; index < 5; index += 1) {
      const response = await client.post('/exports/feeding-records', {
        babyId: baby.id,
        from: '2025-10-20',
        to: '2026-10-20',
      });
      const body = await expectOk<ExportTicket>(response);
      expect(body.data.rowCount).toBe(0);
      expect(response.headers()['x-ratelimit-limit']).toBe('5');
      remainingAfterSuccess.push(response.headers()['x-ratelimit-remaining']);
    }
    expect(remainingAfterSuccess).toEqual(['4', '3', '2', '1', '0']);

    // 第 6 次成功请求：429 + remaining=0 + Retry-After。
    const blocked = await client.post('/exports/feeding-records', {
      babyId: baby.id,
      from: '2026-10-20',
      to: '2026-10-20',
    });
    expect(blocked.status()).toBe(429);
    expect(blocked.headers()['x-ratelimit-limit']).toBe('5');
    expect(blocked.headers()['x-ratelimit-remaining']).toBe('0');
    expect(Number(blocked.headers()['retry-after'])).toBeGreaterThanOrEqual(1);
    await expectError(blocked, 429, 'RATE_LIMITED');

    // 配额耗尽后即使请求体非法也返回 429（限流先于业务校验）。
    const invalidWhenExhausted = await client.post('/exports/feeding-records', {
      babyId: baby.id,
    });
    expect(invalidWhenExhausted.status()).toBe(429);
    expect(invalidWhenExhausted.headers()['x-ratelimit-remaining']).toBe('0');
    await expectError(invalidWhenExhausted, 429, 'RATE_LIMITED');

    // 设备归属：另一设备使用自己的配额访问 D1 的宝宝 → 404，且失败不消耗配额。
    const notFound = await otherDevice.client.post('/exports/feeding-records', {
      babyId: baby.id,
      from: '2026-10-20',
      to: '2026-10-20',
    });
    await expectError(notFound, 404, 'NOT_FOUND');
    expect(notFound.headers()['x-ratelimit-limit']).toBe('5');
    expect(notFound.headers()['x-ratelimit-remaining']).toBe('5');
  });

  test('EXP-10 token 篡改与过期', async ({ request }) => {
    const { client, baby, deviceId } = await setupBaby(request);
    await seedStatsFixture(client, baby.id);
    const ticket = await expectOk<ExportTicket>(await requestExport(client, baby.id));
    const token = tokenOf(ticket.data.downloadUrl);
    const [payloadPart, signaturePart] = token.split('.');

    const tamperedSignature = `${payloadPart}.${signaturePart.slice(0, -1)}${
      signaturePart.endsWith('A') ? 'B' : 'A'
    }`;
    const tampered = await downloadCsv(
      request,
      `/api/v1/exports/feeding-records/${tamperedSignature}.csv`,
    );
    expect(tampered.status).toBe(403);
    expect(JSON.parse(tampered.text).code).toBe('EXPORT_TOKEN_INVALID');

    const payload = decodeExportTokenPayload(token);
    const forgedPayload = Buffer.from(
      JSON.stringify({ ...payload, b: uuid() }),
      'utf8',
    ).toString('base64url');
    const forged = await downloadCsv(
      request,
      `/api/v1/exports/feeding-records/${forgedPayload}.${signaturePart}.csv`,
    );
    expect(forged.status).toBe(403);
    expect(JSON.parse(forged.text).code).toBe('EXPORT_TOKEN_INVALID');

    const expired = signExpiredExportToken({
      deviceHashHex: 'a'.repeat(64),
      babyId: baby.id,
      from: '2026-10-20',
      to: '2026-10-20',
    });
    const expiredDownload = await downloadCsv(
      request,
      `/api/v1/exports/feeding-records/${expired}.csv`,
    );
    expect(expiredDownload.status).toBe(410);
    expect(JSON.parse(expiredDownload.text).code).toBe('EXPORT_TOKEN_EXPIRED');

    const nowSeconds = Math.floor(Date.now() / 1000);
    expect(payload.e - nowSeconds).toBeGreaterThanOrEqual(295);
    expect(payload.e - nowSeconds).toBeLessThanOrEqual(300);
    expect(deviceId).not.toBe(payload.d);
  });

  test('EXP-11 token payload 不含原始设备 ID', async ({ request }) => {
    const { client, baby, deviceId } = await setupBaby(request);
    await seedStatsFixture(client, baby.id);
    const ticket = await expectOk<ExportTicket>(await requestExport(client, baby.id));

    const raw = ticket.data.downloadUrl;
    expect(raw).not.toContain(deviceId);

    const token = tokenOf(raw);
    const [payloadPart, signaturePart] = token.split('.');
    const payload = decodeExportTokenPayload(token);

    expect(Object.keys(payload).sort()).toEqual(['b', 'd', 'e', 'f', 'n', 't', 'v']);
    expect(payload.v).toBe(1);
    expect(payload.b).toBe(baby.id);
    expect(payload.f).toBe('2026-10-20');
    expect(payload.t).toBe('2026-10-20');
    expect(Number.isInteger(payload.e)).toBe(true);
    expect(payload.n).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(payload.d).toMatch(/^[0-9a-f]{64}$/);
    expect(payload.d).toBe(deviceHashHex(deviceId));
    expect(payloadPart).not.toContain(deviceId);

    expect(signaturePart).toHaveLength(43);
    expect(requireExportTokenKey().length).toBeGreaterThan(0);
  });

  test('EXP-12 超过 10,000 行拒绝导出', async ({ request }) => {
    const { client, baby, deviceId } = await setupBaby(request);
    const hash = deviceHashHex(deviceId);
    const deviceRow = queryOne(
      `SELECT id FROM device WHERE device_uid_hash = UNHEX('${hash}')`,
    );
    expect(deviceRow).not.toBeNull();
    const deviceRowId = deviceRow?.[0];

    execSql(`
      SET SESSION cte_max_recursion_depth = 20000;
      INSERT INTO feeding_record
        (id, device_id, baby_id, feed_type, amount_value, amount_unit,
         started_at, tz_offset_minutes, record_date)
      WITH RECURSIVE seq AS (
        SELECT 1 AS n
        UNION ALL
        SELECT n + 1 FROM seq WHERE n < 10001
      )
      SELECT UUID(), ${deviceRowId}, '${baby.id}', 'FORMULA', 100.00, 'ML',
             '2026-10-01 00:00:00.000', 480, '2026-10-01'
      FROM seq
    `);

    const tooLarge = await client.post('/exports/feeding-records', {
      babyId: baby.id,
      from: '2026-10-01',
      to: '2026-10-01',
    });
    const body = await expectError(tooLarge, 413, 'EXPORT_TOO_LARGE');
    expect((body.data as { rowCount: number }).rowCount).toBe(10001);
    expect((body.data as { maxRows: number }).maxRows).toBe(10000);
    expect(body.data).not.toHaveProperty('downloadUrl');
    // Q-25：EXPORT_TOO_LARGE 已经过限流器，返回导出作用域头；预占后回滚，Remaining 不减少。
    expect(tooLarge.headers()['x-ratelimit-limit']).toBe(
      String(RATE_LIMIT_EXPORT_PER_HOUR),
    );
    expect(tooLarge.headers()['x-ratelimit-remaining']).toBe(
      String(RATE_LIMIT_EXPORT_PER_HOUR),
    );

    execSql(
      `DELETE FROM feeding_record WHERE baby_id = '${baby.id}' AND record_date = '2026-10-01' LIMIT 1`,
    );

    const exactlyResponse = await client.post('/exports/feeding-records', {
      babyId: baby.id,
      from: '2026-10-01',
      to: '2026-10-01',
    });
    const exactly = await expectOk<ExportTicket>(exactlyResponse);
    expect(exactly.data.rowCount).toBe(10000);
    // 失败未消耗额度，因此第一次成功签发应为 limit-1。
    expect(exactlyResponse.headers()['x-ratelimit-remaining']).toBe(
      String(RATE_LIMIT_EXPORT_PER_HOUR - 1),
    );
  });

  test('EXP-13 请求体超过 1MB 返回 PAYLOAD_TOO_LARGE 且不消耗导出配额', async ({
    request,
  }) => {
    const { client, baby } = await setupBaby(request);
    const limit = RATE_LIMIT_EXPORT_PER_HOUR;

    // MaxBodySizeFilter 在限流器之前拒绝，响应体仍是统一错误包。
    const oversizedBody = JSON.stringify({
      babyId: baby.id,
      from: '2026-10-20',
      to: '2026-10-20',
      padding: 'x'.repeat(1024 * 1024 + 1),
    });
    const tooLarge = await client.post('/exports/feeding-records', oversizedBody);
    await expectError(tooLarge, 413, 'PAYLOAD_TOO_LARGE');
    expect(tooLarge.headers()['x-ratelimit-limit']).toBeUndefined();
    expect(tooLarge.headers()['x-ratelimit-remaining']).toBeUndefined();
    expect(tooLarge.headers()['retry-after']).toBeUndefined();

    // 配额未被该 413 消耗：成功签发依次为 limit-1 … 0。
    const remainingAfterSuccess: string[] = [];
    for (let index = 0; index < limit; index += 1) {
      const response = await client.post('/exports/feeding-records', {
        babyId: baby.id,
        from: '2026-10-20',
        to: '2026-10-20',
      });
      await expectOk<ExportTicket>(response);
      expect(response.headers()['x-ratelimit-limit']).toBe(String(limit));
      remainingAfterSuccess.push(response.headers()['x-ratelimit-remaining']);
    }
    expect(remainingAfterSuccess).toEqual(
      Array.from({ length: limit }, (_, index) => String(limit - index - 1)),
    );
  });

  test('EXP-14 跨度超过 366 天返回 EXPORT_TOO_LARGE 且不消耗导出配额', async ({
    request,
  }) => {
    const { client, baby } = await setupBaby(request);
    const limit = RATE_LIMIT_EXPORT_PER_HOUR;

    // Q-27：from/to 合法，仅闭区间跨度 367 天超限；366 天边界由 EXP-09 的成功循环覆盖。
    const tooLarge = await client.post('/exports/feeding-records', {
      babyId: baby.id,
      from: '2025-10-19',
      to: '2026-10-20',
    });
    const body = await expectError(tooLarge, 413, 'EXPORT_TOO_LARGE');
    expect(body.data).toEqual({
      maxDays: 366,
      from: '2025-10-19',
      to: '2026-10-20',
      spanDays: 367,
    });
    expect(body.data).not.toHaveProperty('rowCount');
    expect(body.data).not.toHaveProperty('maxRows');
    expect(body.data).not.toHaveProperty('downloadUrl');

    // 该 413 已过限流器：返回导出作用域头、预占回滚、无 Retry-After。
    expect(tooLarge.headers()['x-ratelimit-limit']).toBe(String(limit));
    expect(tooLarge.headers()['x-ratelimit-remaining']).toBe(String(limit));
    expect(tooLarge.headers()['retry-after']).toBeUndefined();

    const after = await requestExport(client, baby.id);
    await expectOk<ExportTicket>(after);
    expect(after.headers()['x-ratelimit-remaining']).toBe(String(limit - 1));
  });
});
