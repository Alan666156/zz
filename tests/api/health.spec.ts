import { expect, test } from '@playwright/test';

import { API_PREFIX } from './helpers/env';

interface HealthData {
  status: string;
  checks: {
    db: { status: string; latencyMs: number };
    redis: { status: string; latencyMs: number };
  };
  version: string;
  serverTime: string;
}

/**
 * 契约：docs/architecture/v1.0-baby-feeding.md §4.11
 * 用例：docs/tests/v1.0.md §17（HEALTH-01..HEALTH-03）
 * 状态：TE-02 可执行断言。
 */
test.describe('健康检查（HEALTH）', () => {
  test('HEALTH-01 健康检查 UP 与依赖明细', async ({ request }) => {
    const response = await request.get(`${API_PREFIX}/health`);
    expect(response.status()).toBe(200);

    const body = (await response.json()) as {
      code: string;
      data: HealthData;
      serverTime: string;
    };
    expect(body.code).toBe('OK');
    expect(body.data.status).toBe('UP');
    expect(body.data.checks.db.status).toBe('UP');
    expect(body.data.checks.redis.status).toBe('UP');
    expect(body.data.checks.db.latencyMs).toBeGreaterThanOrEqual(0);
    expect(body.data.checks.redis.latencyMs).toBeGreaterThanOrEqual(0);
    expect(body.data.version.length).toBeGreaterThan(0);
    expect(body.data.serverTime).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
    );
    expect(body.serverTime).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
    );

    const headers = response.headers();
    expect(headers['cache-control']).toBe('no-store');
    expect(headers['x-content-type-options']).toBe('nosniff');
  });

  test('HEALTH-02 健康检查不需要设备头', async ({ request }) => {
    const withoutHeader = await request.get(`${API_PREFIX}/health`);
    expect(withoutHeader.status()).toBe(200);

    const withInvalidHeader = await request.get(`${API_PREFIX}/health`, {
      headers: { 'X-Device-Id': 'not-a-uuid' },
    });
    expect(withInvalidHeader.status()).toBe(200);
  });

  test('HEALTH-03 不暴露 actuator 其他端点', async ({ request }) => {
    for (const path of ['/actuator', '/actuator/health']) {
      const response = await request.get(path);
      expect(response.status(), path).toBe(404);
    }
  });
});
