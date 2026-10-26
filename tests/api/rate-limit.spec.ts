import { expect, test } from '@playwright/test';

import { ApiClient, expectError, expectOk } from './helpers/api-client';
import { downloadCsv } from './helpers/csv';
import { at, uuid } from './helpers/fixtures';
import { flushRedisDb } from './helpers/redis';
import {
  RATE_LIMIT_API_PER_MINUTE,
  RATE_LIMIT_EXPORT_PER_HOUR,
  RATE_LIMIT_INIT_PER_HOUR,
  RATE_LIMIT_SYNC_PER_MINUTE,
  RUN_RATE_LIMIT,
} from './helpers/env';
import {
  createFeeding,
  resetApiState,
  setupBaby,
  setupDevice,
  type Baby,
} from './helpers/scenario';

/**
 * 契约：docs/architecture/v1.0-baby-feeding.md §2.4、addendum Q-12/Q-18
 * 用例：docs/tests/v1.0.md §14（RL-01..RL-06）
 * 状态：TE-02 可执行断言。
 *
 * 限流用例会耗尽额度，必须独立运行，且后端与测试进程使用同一组阈值：
 *   npm run reset:env
 *   APP_RATE_LIMIT_API_PER_MINUTE=5 APP_RATE_LIMIT_INIT_PER_HOUR=3 \
 *   APP_RATE_LIMIT_EXPORT_PER_HOUR=2 APP_RATE_LIMIT_SYNC_PER_MINUTE=3 \
 *   RUN_RATE_LIMIT=1 npm run test:rate-limit
 */
test.describe('限流（RL）', () => {
  test.beforeEach(async () => {
    await resetApiState();
  });

  test('RL-01 API 设备额度与限流响应头', async ({ request }) => {
    test.skip(!RUN_RATE_LIMIT, '限流专项需 RUN_RATE_LIMIT=1 且独立低阈值上下文');
    const limit = RATE_LIMIT_API_PER_MINUTE;
    const { client, deviceId } = await setupDevice(request);

    // init 本身计入 API 额度；按 Q-12 在 init 后清空计数。
    flushRedisDb();

    const responses = [];
    for (let index = 0; index < limit + 1; index += 1) {
      const response = await client.get('/babies');
      responses.push(response);
      if (index < limit) {
        expect(response.status(), `call #${index + 1}`).toBe(200);
        expect(response.headers()['x-ratelimit-limit']).toBe(String(limit));
        expect(response.headers()['x-ratelimit-remaining']).toBe(
          String(limit - index - 1),
        );
      }
    }

    const limited = responses[limit];
    expect(limited.status()).toBe(429);
    expect(limited.headers()['x-ratelimit-limit']).toBe(String(limit));
    expect(limited.headers()['x-ratelimit-remaining']).toBe('0');
    const retryAfter = Number(limited.headers()['retry-after']);
    expect(Number.isInteger(retryAfter)).toBe(true);
    expect(retryAfter).toBeGreaterThanOrEqual(1);
    expect(retryAfter).toBeLessThanOrEqual(60);

    const body = await expectError(limited, 429, 'RATE_LIMITED');
    expect(body.message.length).toBeGreaterThan(0);

    // 无数据副作用：全新设备初始化后列表为空（额度耗尽不影响已有数据）。
    const other = new ApiClient(request, uuid());
    await expectOk(
      await other.post('/devices/init', { platform: 'H5', appVersion: '1.0.0' }),
    );
    const babies = await expectOk<Baby[]>(await other.get('/babies'));
    expect(babies.data).toEqual([]);
    expect(deviceId).toBeTruthy();
  });

  test('RL-02 设备 init 额度（按 IP）', async ({ request }) => {
    test.skip(!RUN_RATE_LIMIT, '限流专项需 RUN_RATE_LIMIT=1 且独立低阈值上下文');
    const limit = RATE_LIMIT_INIT_PER_HOUR;
    flushRedisDb();

    for (let index = 0; index < limit; index += 1) {
      const client = new ApiClient(request, uuid());
      const body = await expectOk<{ created: boolean }>(
        await client.post('/devices/init', { platform: 'H5', appVersion: '1.0.0' }),
      );
      expect(body.data.created).toBe(true);
    }

    const blockedClient = new ApiClient(request, uuid());
    const blocked = await blockedClient.post('/devices/init', {
      platform: 'H5',
      appVersion: '1.0.0',
    });
    expect(blocked.status()).toBe(429);
    expect(blocked.headers()['x-ratelimit-remaining']).toBe('0');
    expect(Number(blocked.headers()['retry-after'])).toBeGreaterThanOrEqual(1);

    await expectError(await blockedClient.get('/babies'), 409, 'DEVICE_NOT_REGISTERED');
  });

  test('RL-03 导出额度（按设备）', async ({ request }) => {
    test.skip(!RUN_RATE_LIMIT, '限流专项需 RUN_RATE_LIMIT=1 且独立低阈值上下文');
    const limit = RATE_LIMIT_EXPORT_PER_HOUR;
    const { client, baby } = await setupBaby(request);
    await createFeeding(client, baby.id);

    for (let index = 0; index < limit; index += 1) {
      const body = await expectOk<{ downloadUrl: string }>(
        await client.post('/exports/feeding-records', {
          babyId: baby.id,
          from: '2026-10-20',
          to: '2026-10-20',
        }),
      );
      expect(body.data.downloadUrl.endsWith('.csv')).toBe(true);
    }

    const blocked = await client.post('/exports/feeding-records', {
      babyId: baby.id,
      from: '2026-10-20',
      to: '2026-10-20',
    });
    expect(blocked.status()).toBe(429);
    expect(blocked.headers()['x-ratelimit-remaining']).toBe('0');
    expect(Number(blocked.headers()['retry-after'])).toBeGreaterThanOrEqual(1);
    const body = await expectError(blocked, 429, 'RATE_LIMITED');
    expect(body.data).not.toHaveProperty('downloadUrl');
  });

  test('RL-04 同步额度（按设备）', async ({ request }) => {
    test.skip(!RUN_RATE_LIMIT, '限流专项需 RUN_RATE_LIMIT=1 且独立低阈值上下文');
    const limit = RATE_LIMIT_SYNC_PER_MINUTE;
    const { client, baby } = await setupBaby(request);

    for (let index = 0; index < limit; index += 1) {
      const response = await client.post('/sync/push', {
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
      });
      expect(response.status()).toBe(200);
    }

    const blocked = await client.post('/sync/push', {
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
    });
    expect(blocked.status()).toBe(429);
    expect(blocked.headers()['x-ratelimit-remaining']).toBe('0');
    const retryAfter = Number(blocked.headers()['retry-after']);
    expect(Number.isInteger(retryAfter)).toBe(true);
    expect(retryAfter).toBeGreaterThanOrEqual(1);
    expect(retryAfter).toBeLessThanOrEqual(60);
  });

  test('RL-05 健康检查与 CSV 下载不占设备额度', async ({ request }) => {
    test.skip(!RUN_RATE_LIMIT, '限流专项需 RUN_RATE_LIMIT=1 且独立低阈值上下文');
    const limit = RATE_LIMIT_API_PER_MINUTE;
    const { client, baby } = await setupBaby(request);
    await createFeeding(client, baby.id);
    const ticket = await expectOk<{ downloadUrl: string }>(
      await client.post('/exports/feeding-records', {
        babyId: baby.id,
        from: '2026-10-20',
        to: '2026-10-20',
      }),
    );

    flushRedisDb();
    for (let index = 0; index < limit; index += 1) {
      const response = await client.get('/babies');
      expect(response.status()).toBe(200);
    }
    await expectError(await client.get('/babies'), 429, 'RATE_LIMITED');

    const health = await request.get('/api/v1/health');
    expect(health.status()).toBe(200);

    const download = await downloadCsv(request, ticket.data.downloadUrl);
    expect(download.status).toBe(200);
    expect(download.text.startsWith('﻿') || download.bytes[0] === 0xef).toBe(true);
  });

  test('RL-06 Redis 故障时限流 fail-open（非导出）', async () => {
    test.skip(true, 'MANUAL：需停止 Redis，按用例文档人工执行');
  });
});
