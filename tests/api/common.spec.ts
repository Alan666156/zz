import { expect, test } from '@playwright/test';

import { expectError, expectOk, readEnvelope } from './helpers/api-client';
import { API_PREFIX } from './helpers/env';
import { uuid } from './helpers/fixtures';
import {
  createFeeding,
  createBaby,
  expectUtcMillis,
  resetApiState,
  setupBaby,
  setupDevice,
  type Baby,
  type FeedingRecord,
  type Page,
} from './helpers/scenario';

/**
 * 契约：docs/architecture/v1.0-baby-feeding.md §4.1、§4.2、§4.3、§4.12、§2.5
 * 用例：docs/tests/v1.0.md §5（GEN-01..GEN-11）
 * 状态：TE-02 可执行断言。
 */
test.describe('API 通用协议（GEN）', () => {
  test.beforeEach(async () => {
    await resetApiState();
  });

  test('GEN-01 成功响应包、requestId 回写与安全响应头', async ({ request }) => {
    const { client } = await setupDevice(request);
    const requestId = '11111111-1111-4111-8111-111111111111';

    const response = await client.get('/babies', { headers: { 'X-Request-Id': requestId } });
    const body = await expectOk<Baby[]>(response);

    expect(Array.isArray(body.data)).toBe(true);
    expect(body.requestId).toBe(requestId);
    expect(body.serverTime).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);

    const headers = response.headers();
    expect(headers['x-request-id']).toBe(requestId);
    expect(headers['x-api-version']).toBe('1');
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['cache-control']).toBe('no-store');
    expect(headers['referrer-policy']).toBe('no-referrer');
  });

  test('GEN-02 错误响应包结构与字段错误', async ({ request }) => {
    const { client, baby } = await setupBaby(request);

    const response = await client.post('/feeding-records', {
      babyId: baby.id,
      feedType: 'BREAST',
      breastSide: 'LEFT',
      startedAt: '2026-10-20T08:00:00+08:00',
    });
    const body = await expectError(response, 400, 'VALIDATION_ERROR');

    expect(body.message.length).toBeGreaterThan(0);
    const data = body.data as { fieldErrors?: Array<{ field: string; message: string }> };
    expect(Array.isArray(data.fieldErrors)).toBe(true);
    const durationError = data.fieldErrors?.find((item) => item.field === 'durationSec');
    expect(durationError, 'fieldErrors must contain durationSec').toBeTruthy();
    expect(durationError?.message.length).toBeGreaterThan(0);

    expect(Object.keys(body).sort()).toEqual(
      ['code', 'data', 'message', 'requestId', 'serverTime'].sort(),
    );
    expect(body).not.toHaveProperty('trace');
    expect(body).not.toHaveProperty('exception');
    expect(body).not.toHaveProperty('stack');
    expect(body).not.toHaveProperty('sql');

    expect(response.headers()['x-request-id']).toBe(body.requestId);
    expect(response.headers()['x-api-version']).toBe('1');
  });

  test('GEN-03 未携带 X-Request-Id 时服务端生成', async ({ request }) => {
    const first = await request.get(`${API_PREFIX}/health`);
    const second = await request.get(`${API_PREFIX}/health`);

    const firstBody = await expectOk<{ status: string }>(first);
    const secondBody = await expectOk<{ status: string }>(second);

    expect(firstBody.requestId).not.toBe(secondBody.requestId);
    for (const [response, body] of [
      [first, firstBody],
      [second, secondBody],
    ] as const) {
      expect(body.requestId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      );
      expect(response.headers()['x-request-id']).toBe(body.requestId);
    }
  });

  test('GEN-04 X-API-Version 与未知 JSON 字段忽略', async ({ request }) => {
    const { client } = await setupDevice(request);
    const id = uuid();

    const createResponse = await client.post('/babies', {
      id,
      name: '小满',
      gender: 'FEMALE',
      birthDate: '2026-03-01',
      futureField: { x: 1 },
    });
    const created = await expectOk<{ created: boolean; baby: Record<string, unknown> }>(
      createResponse,
    );
    expect(created.data.created).toBe(true);
    expect(created.data.baby).not.toHaveProperty('futureField');
    expect(created.data.baby.id).toBe(id);
    expect(createResponse.headers()['x-api-version']).toBe('1');

    const missing = await client.get(`/babies/${uuid()}`);
    const errorBody = await expectError(missing, 404, 'NOT_FOUND');
    expect(missing.headers()['x-api-version']).toBe('1');
    expect(errorBody.code).toBe('NOT_FOUND');
  });

  test('GEN-05 非法 JSON 与错误 Content-Type', async ({ request }) => {
    const { client } = await setupDevice(request);

    const invalidJson = await client.post('/babies', '{invalid', {
      headers: { 'Content-Type': 'application/json' },
    });
    await expectError(invalidJson, 400, 'BAD_REQUEST');

    const wrongType = await client.post(
      '/babies',
      JSON.stringify({ name: '小满', birthDate: '2026-03-01' }),
      { headers: { 'Content-Type': 'text/plain' } },
    );
    await expectError(wrongType, 415, 'UNSUPPORTED_MEDIA_TYPE');

    for (const response of [invalidJson, wrongType]) {
      const body = await readEnvelope(response);
      expect(Object.keys(body).sort()).toEqual(
        ['code', 'data', 'message', 'requestId', 'serverTime'].sort(),
      );
    }
  });

  test('GEN-06 请求体超过 1 MB', async ({ request }) => {
    const { client } = await setupDevice(request);
    const before = await expectOk<Baby[]>(await client.get('/babies'));

    const body = `{"unknown":"${'a'.repeat(1_048_577)}"}`;
    const response = await client.post('/babies', body);
    await expectError(response, 413, 'PAYLOAD_TOO_LARGE');

    const after = await expectOk<Baby[]>(await client.get('/babies'));
    expect(after.data.length).toBe(before.data.length);
  });

  test('GEN-07 分页默认值、非法参数与超界空页', async ({ request }) => {
    const { client, baby } = await setupBaby(request);

    for (let index = 0; index < 25; index += 1) {
      const minute = String(index).padStart(2, '0');
      await createFeeding(client, baby.id, {
        startedAt: `2026-10-20T10:${minute}:00+08:00`,
      });
    }

    const first = await expectOk<Page<FeedingRecord>>(
      await client.get(`/feeding-records?babyId=${baby.id}&date=2026-10-20`),
    );
    expect(first.data.page).toBe(1);
    expect(first.data.size).toBe(20);
    expect(first.data.items.length).toBe(20);
    expect(first.data.total).toBe(25);
    expect(first.data.hasNext).toBe(true);

    const maxSize = await expectOk<Page<FeedingRecord>>(
      await client.get(`/feeding-records?babyId=${baby.id}&date=2026-10-20&size=100`),
    );
    expect(maxSize.data.size).toBe(100);
    expect(maxSize.data.items.length).toBe(25);
    expect(maxSize.data.hasNext).toBe(false);

    for (const query of ['size=101', 'size=0', 'page=0']) {
      const response = await client.get(
        `/feeding-records?babyId=${baby.id}&date=2026-10-20&${query}`,
      );
      await expectError(response, 400, 'VALIDATION_ERROR');
    }

    const beyond = await expectOk<Page<FeedingRecord>>(
      await client.get(`/feeding-records?babyId=${baby.id}&date=2026-10-20&page=3`),
    );
    expect(beyond.data.items).toEqual([]);
    expect(beyond.data.total).toBe(25);
    expect(beyond.data.hasNext).toBe(false);
    expect(beyond.data.page).toBe(3);
  });

  test('GEN-08 ID 必须是 canonical 小写 UUID v4', async ({ request }) => {
    const { client, deviceId } = await setupDevice(request);

    const v1Id = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';
    const v1Response = await client.post('/babies', {
      id: v1Id,
      name: '小满',
      birthDate: '2026-03-01',
    });
    const v1Error = await expectError(v1Response, 400, 'VALIDATION_ERROR');
    expect(
      (v1Error.data as { fieldErrors: Array<{ field: string }> }).fieldErrors.some(
        (item) => item.field === 'id',
      ),
    ).toBe(true);

    const upperId = 'B1A2C3D4-E5F6-4A7B-8C9D-0E1F2A3B4C5D';
    const upperResponse = await client.post('/babies', {
      id: upperId,
      name: '小满',
      birthDate: '2026-03-01',
    });
    const upperError = await expectError(upperResponse, 400, 'VALIDATION_ERROR');
    expect(
      (upperError.data as { fieldErrors: Array<{ field: string }> }).fieldErrors.some(
        (item) => item.field === 'id',
      ),
    ).toBe(true);

    const upperHeader = await client.get('/babies', {
      headers: { 'X-Device-Id': deviceId.toUpperCase() },
    });
    await expectError(upperHeader, 400, 'DEVICE_ID_INVALID');

    const invalidBatch = await client.post('/sync/push', {
      batchId: 'NOT-A-UUID',
      clientTime: '2026-10-26T16:00:00+08:00',
      changes: [],
    });
    await expectError(invalidBatch, 400, 'VALIDATION_ERROR');

    const babies = await expectOk<Baby[]>(await client.get('/babies'));
    expect(babies.data).toEqual([]);
  });

  test('GEN-09 CORS 白名单与预检', async ({ request }) => {
    const { client } = await setupDevice(request);
    const allowedOrigin = 'http://127.0.0.1:4173';

    const preflight = await request.fetch(`${API_PREFIX}/babies`, {
      method: 'OPTIONS',
      headers: {
        Origin: allowedOrigin,
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'content-type,x-device-id',
      },
    });
    expect([200, 204]).toContain(preflight.status());
    const preflightHeaders = preflight.headers();
    expect(preflightHeaders['access-control-allow-origin']).toBe(allowedOrigin);
    expect(preflightHeaders['access-control-allow-methods']).toContain('POST');
    expect(preflightHeaders['access-control-allow-headers']?.toLowerCase()).toContain(
      'x-device-id',
    );
    expect(preflightHeaders['access-control-allow-credentials']).toBeUndefined();

    const evil = await request.fetch(`${API_PREFIX}/babies`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://evil.example',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'content-type,x-device-id',
      },
    });
    expect(evil.headers()['access-control-allow-origin']).toBeUndefined();

    const actual = await client.get('/babies', { headers: { Origin: allowedOrigin } });
    await expectOk(actual);
    const exposed = actual.headers()['access-control-expose-headers'] ?? '';
    for (const header of [
      'X-Request-Id',
      'X-RateLimit-Limit',
      'X-RateLimit-Remaining',
      'Retry-After',
      'Content-Disposition',
    ]) {
      expect(exposed).toContain(header);
    }
  });

  test('GEN-10 未知路由与不存在资源', async ({ request }) => {
    const { client } = await setupDevice(request);

    const unknownRoute = await client.get('/not-a-route');
    await expectError(unknownRoute, 404, 'NOT_FOUND');

    const missingBaby = await client.get('/babies/00000000-0000-4000-8000-000000000000');
    await expectError(missingBaby, 404, 'NOT_FOUND');

    for (const response of [unknownRoute, missingBaby]) {
      const body = await readEnvelope(response);
      const serialized = JSON.stringify(body);
      expect(serialized).not.toContain('Exception');
      expect(serialized).not.toContain('select ');
      expect(serialized).not.toContain('SELECT ');
    }
  });

  test('GEN-11 SQL 注入式参数不导致 500', async ({ request }) => {
    const { client, baby } = await setupBaby(request);
    const before = await expectOk<Baby[]>(await client.get('/babies'));

    const injection = encodeURIComponent("' OR 1=1 -- ");
    const feeding = await client.get(
      `/feeding-records?babyId=${injection}&date=2026-10-20`,
    );
    await expectError(feeding, 400, 'VALIDATION_ERROR');

    const babyPath = await client.get(`/babies/${encodeURIComponent("' OR 1=1 --")}`);
    await expectError(babyPath, 400, 'VALIDATION_ERROR');

    const after = await expectOk<Baby[]>(await client.get('/babies'));
    expect(after.data.length).toBe(before.data.length);
    expect(after.data[0].id).toBe(baby.id);
  });
});
