import { expect, test } from '@playwright/test';

import { ApiClient, expectError, expectOk } from './helpers/api-client';
import {
  RATE_LIMIT_EXPORT_PER_HOUR,
  RATE_LIMIT_INIT_PER_HOUR,
  RATE_LIMIT_SYNC_PER_MINUTE,
  RUN_PATH_NORMALIZATION,
} from './helpers/env';
import { at, uuid } from './helpers/fixtures';
import { resetApiState, setupBaby } from './helpers/scenario';

/**
 * 契约：docs/architecture/v1.0-contract-addendum.md §9（Q-26 / N-7）
 * 用例：docs/tests/v1.0.md §14（RL-07..RL-10）
 * 状态：已写好；N-7 合入并重启后置 RUN_PATH_NORMALIZATION=1 执行。
 *
 * 说明：这些用例要求后端按规范化路由判定 init/export/sync 作用域，
 * 修复前会因原始 requestURI 不匹配而绕过专用限额；在 N-7 上线前不作为缺陷判红。
 * 执行前清空 Redis DB14（至少 `zz:bf:v1:rl:*`），并确认后端使用默认阈值。
 */
test.describe('路径规范化与端点作用域限流（Q-26）', () => {
  test.beforeEach(async () => {
    await resetApiState();
  });

  const pending = '等待 backend-dev N-7（规范化路由限流）合入并重启，置 RUN_PATH_NORMALIZATION=1 后执行';

  test('Q26-01 sync 矩阵参数与查询串共享分钟额度', async ({ request }) => {
    test.skip(!RUN_PATH_NORMALIZATION, pending);
    const limit = RATE_LIMIT_SYNC_PER_MINUTE;
    const { client, baby } = await setupBaby(request);
    const payload = {
      batchId: uuid(),
      clientTime: at('2026-10-26', '16:00:00'),
      changes: [
        {
          entityType: 'BABY',
          op: 'UPSERT',
          id: baby.id,
          baseRevision: 0,
          data: { name: '小满', birthDate: '2026-03-01' },
        },
      ],
    };

    for (let index = 0; index < limit; index += 1) {
      const response = await client.post('/sync/push', {
        ...payload,
        batchId: uuid(),
      });
      expect(response.status(), `canonical sync #${index + 1}`).toBe(200);
    }

    // 矩阵参数路径与规范路径共用同一 sync 计数器。
    const matrix = await client.post('/sync/push;a=1', {
      ...payload,
      batchId: uuid(),
    });
    expect(matrix.status()).toBe(429);
    expect(matrix.headers()['x-ratelimit-limit']).toBe(String(limit));
    expect(matrix.headers()['x-ratelimit-remaining']).toBe('0');
    expect(Number(matrix.headers()['retry-after'])).toBeGreaterThanOrEqual(1);
    await expectError(matrix, 429, 'RATE_LIMITED');

    // 查询串同样不得改变作用域。
    const query = await client.post('/sync/push?x=1', {
      ...payload,
      batchId: uuid(),
    });
    expect(query.status()).toBe(429);
    expect(query.headers()['x-ratelimit-limit']).toBe(String(limit));
    expect(query.headers()['x-ratelimit-remaining']).toBe('0');
    expect(Number(query.headers()['retry-after'])).toBeGreaterThanOrEqual(1);
    await expectError(query, 429, 'RATE_LIMITED');
  });

  test('Q26-02 export 矩阵参数路径不得绕过导出额度', async ({ request }) => {
    test.skip(!RUN_PATH_NORMALIZATION, pending);
    const limit = RATE_LIMIT_EXPORT_PER_HOUR;
    const { client, baby } = await setupBaby(request);
    const body = {
      babyId: baby.id,
      from: '2026-10-20',
      to: '2026-10-20',
    };

    for (let index = 0; index < limit; index += 1) {
      const response = await client.post('/exports/feeding-records', body);
      await expectOk(response);
      expect(response.headers()['x-ratelimit-limit']).toBe(String(limit));
    }

    const blocked = await client.post('/exports/feeding-records;x=1', body);
    expect(blocked.status()).toBe(429);
    expect(blocked.headers()['x-ratelimit-limit']).toBe(String(limit));
    expect(blocked.headers()['x-ratelimit-remaining']).toBe('0');
    expect(Number(blocked.headers()['retry-after'])).toBeGreaterThanOrEqual(1);
    const error = await expectError(blocked, 429, 'RATE_LIMITED');
    expect(error.data).not.toHaveProperty('downloadUrl');
  });

  test('Q26-03 init 矩阵参数路径共享 IP 小时额度', async ({ request }) => {
    test.skip(!RUN_PATH_NORMALIZATION, pending);
    const limit = RATE_LIMIT_INIT_PER_HOUR;

    for (let index = 0; index < limit; index += 1) {
      const client = new ApiClient(request, uuid());
      const response = await client.post('/devices/init', {
        platform: 'H5',
        appVersion: '1.0.0',
      });
      await expectOk(response);
      expect(response.headers()['x-ratelimit-limit']).toBe(String(limit));
    }

    const blockedClient = new ApiClient(request, uuid());
    const blocked = await blockedClient.post('/devices/init;x=1', {
      platform: 'H5',
      appVersion: '1.0.0',
    });
    expect(blocked.status()).toBe(429);
    expect(blocked.headers()['x-ratelimit-limit']).toBe(String(limit));
    expect(blocked.headers()['x-ratelimit-remaining']).toBe('0');
    expect(Number(blocked.headers()['retry-after'])).toBeGreaterThanOrEqual(1);
    await expectError(blocked, 429, 'RATE_LIMITED');
  });

  test('Q26-04 受保护端点加矩阵参数后仍要求设备头', async ({ request }) => {
    test.skip(!RUN_PATH_NORMALIZATION, pending);
    const client = new ApiClient(request, uuid());
    const response = await client.get('/babies;x=1', { omitDeviceHeader: true });
    await expectError(response, 409, 'DEVICE_NOT_REGISTERED');
  });
});
