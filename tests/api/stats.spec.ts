import { expect, test } from '@playwright/test';

import { expectError, expectOk } from './helpers/api-client';
import { at, uuid } from './helpers/fixtures';
import {
  createBaby,
  createFeeding,
  resetApiState,
  seedStatsFixture,
  setupBaby,
} from './helpers/scenario';

interface DailyStats {
  babyId: string;
  date: string;
  feedingCount: number;
  byType: Record<'BREAST' | 'FORMULA' | 'MIXED' | 'SOLID', number>;
  totalAmountMl: number;
  totalSolidG: number;
  totalBreastDurationSec: number;
  totalDurationSec: number;
  avgAmountMl: number | null;
  lastFeedingAt: string | null;
  cached: boolean;
}

interface TrendPoint {
  date: string;
  feedingCount: number;
  totalAmountMl: number;
  totalSolidG: number;
  totalBreastDurationSec: number;
  totalDurationSec: number;
  avgDurationSec: number | null;
}

interface Trend {
  babyId: string;
  from: string;
  to: string;
  granularity: string;
  points: TrendPoint[];
  cached: boolean;
}

/**
 * 契约：docs/architecture/v1.0-baby-feeding.md §4.7、§2.4
 * 用例：docs/tests/v1.0.md §10（STATS-01..STATS-09）
 * 状态：TE-02 可执行断言。
 */
test.describe('统计（STATS）', () => {
  test.beforeEach(async () => {
    await resetApiState();
  });

  test('STATS-01 空数据日报返回零值', async ({ request }) => {
    const { client, baby } = await setupBaby(request);

    const body = await expectOk<DailyStats>(
      await client.get(`/stats/daily?babyId=${baby.id}&date=2026-10-19`),
    );
    expect(body.data.babyId).toBe(baby.id);
    expect(body.data.date).toBe('2026-10-19');
    expect(body.data.feedingCount).toBe(0);
    expect(body.data.byType).toEqual({ BREAST: 0, FORMULA: 0, MIXED: 0, SOLID: 0 });
    expect(body.data.totalAmountMl).toBe(0.0);
    expect(body.data.totalSolidG).toBe(0.0);
    expect(body.data.totalBreastDurationSec).toBe(0);
    expect(body.data.totalDurationSec).toBe(0);
    expect(body.data.avgAmountMl).toBeNull();
    expect(body.data.lastFeedingAt).toBeNull();
  });

  test('STATS-02 日报精确聚合', async ({ request }) => {
    const { client, baby } = await setupBaby(request);
    await seedStatsFixture(client, baby.id);

    const body = await expectOk<DailyStats>(
      await client.get(`/stats/daily?babyId=${baby.id}&date=2026-10-20`),
    );
    expect(body.data.feedingCount).toBe(8);
    expect(body.data.byType).toEqual({ BREAST: 3, FORMULA: 2, MIXED: 1, SOLID: 2 });
    expect(body.data.totalAmountMl).toBe(360.0);
    expect(body.data.totalSolidG).toBe(50.0);
    expect(body.data.totalBreastDurationSec).toBe(3180);
    expect(body.data.totalDurationSec).toBe(3600);
    expect(body.data.avgAmountMl).toBe(120.0);
    expect(body.data.lastFeedingAt).toBe('2026-10-20T15:00:00+08:00');
    expect(body.data.date).toBe('2026-10-20');
    expect(body.data.babyId).toBe(baby.id);
  });

  test('STATS-03 已删除记录、其他宝宝、其他设备不计入', async ({ request }) => {
    const { client, baby } = await setupBaby(request);
    const fixture = await seedStatsFixture(client, baby.id);

    const otherBaby = await createBaby(client, { name: 'B2', isDefault: false });
    await createFeeding(client, otherBaby.id, { amountValue: 500 });
    const otherDevice = await setupBaby(request);
    await createFeeding(otherDevice.client, otherDevice.baby.id, { amountValue: 500 });

    const before = await expectOk<DailyStats>(
      await client.get(`/stats/daily?babyId=${baby.id}&date=2026-10-20`),
    );
    expect(before.data.feedingCount).toBe(8);
    expect(before.data.totalAmountMl).toBe(360.0);

    await expectOk(
      await client.delete(`/feeding-records/${fixture.ids.breastLeft}?baseRevision=1`),
    );

    const after = await expectOk<DailyStats>(
      await client.get(`/stats/daily?babyId=${baby.id}&date=2026-10-20`),
    );
    expect(after.data.feedingCount).toBe(7);
    expect(after.data.totalAmountMl).toBe(360.0);
    expect(after.data.totalBreastDurationSec).toBe(2280);
    expect(after.data.totalDurationSec).toBe(2700);
  });

  test('STATS-04 平均值、时长与最后喂养时间', async ({ request }) => {
    const { client, baby } = await setupBaby(request);
    await seedStatsFixture(client, baby.id);
    await createFeeding(client, baby.id, {
      amountValue: 100,
      startedAt: at('2026-10-20', '17:00:00'),
    });

    const body = await expectOk<DailyStats>(
      await client.get(`/stats/daily?babyId=${baby.id}&date=2026-10-20`),
    );
    expect(body.data.totalAmountMl).toBe(460.0);
    expect(body.data.avgAmountMl).toBe(115.0);
    expect(body.data.totalDurationSec).toBe(3600);
    expect(body.data.lastFeedingAt).toBe('2026-10-20T17:00:00+08:00');
  });

  test('STATS-05 日报参数与归属校验', async ({ request }) => {
    const { client, baby } = await setupBaby(request);
    const otherDevice = await setupBaby(request);

    for (const query of [
      `babyId=${baby.id}`,
      `babyId=${baby.id}&date=2026-13-01`,
      `babyId=${baby.id}&date=2026/10/20`,
      'date=2026-10-20',
    ]) {
      await expectError(
        await client.get(`/stats/daily?${query}`),
        400,
        'VALIDATION_ERROR',
      );
    }

    await expectError(
      await client.get(`/stats/daily?babyId=${uuid()}&date=2026-10-20`),
      404,
      'NOT_FOUND',
    );
    await expectError(
      await otherDevice.client.get(`/stats/daily?babyId=${baby.id}&date=2026-10-20`),
      404,
      'NOT_FOUND',
    );

    const future = await expectOk<DailyStats>(
      await client.get(`/stats/daily?babyId=${baby.id}&date=2099-01-01`),
    );
    expect(future.data.feedingCount).toBe(0);
    expect(future.data.totalAmountMl).toBe(0.0);
  });

  test('STATS-06 日报缓存命中与写入失效', async ({ request }) => {
    const { client, baby } = await setupBaby(request);
    await createFeeding(client, baby.id, { amountValue: 50 });

    const first = await expectOk<DailyStats>(
      await client.get(`/stats/daily?babyId=${baby.id}&date=2026-10-20`),
    );
    expect(first.data.cached).toBe(false);

    const second = await expectOk<DailyStats>(
      await client.get(`/stats/daily?babyId=${baby.id}&date=2026-10-20`),
    );
    expect(second.data.cached).toBe(true);
    expect(second.data.totalAmountMl).toBe(first.data.totalAmountMl);
    expect(second.data.feedingCount).toBe(first.data.feedingCount);

    await createFeeding(client, baby.id, {
      amountValue: 50,
      startedAt: at('2026-10-20', '11:00:00'),
    });

    const afterWrite = await expectOk<DailyStats>(
      await client.get(`/stats/daily?babyId=${baby.id}&date=2026-10-20`),
    );
    expect(afterWrite.data.totalAmountMl).toBe(
      Number((first.data.totalAmountMl + 50).toFixed(1)),
    );
    expect(afterWrite.data.feedingCount).toBe(first.data.feedingCount + 1);
  });

  test('STATS-07 趋势补零与精确点值', async ({ request }) => {
    const { client, baby } = await setupBaby(request);
    await seedStatsFixture(client, baby.id);
    await createFeeding(client, baby.id, {
      amountValue: 120,
      durationSec: 300,
      startedAt: at('2026-10-21', '09:00:00'),
    });

    const body = await expectOk<Trend>(
      await client.get(
        `/stats/trend?babyId=${baby.id}&from=2026-10-19&to=2026-10-21`,
      ),
    );
    expect(body.data.from).toBe('2026-10-19');
    expect(body.data.to).toBe('2026-10-21');
    expect(body.data.granularity).toBe('DAY');
    expect(body.data.points).toHaveLength(3);

    expect(body.data.points[0]).toEqual({
      date: '2026-10-19',
      feedingCount: 0,
      totalAmountMl: 0.0,
      totalSolidG: 0.0,
      totalBreastDurationSec: 0,
      totalDurationSec: 0,
      avgDurationSec: null,
    });
    expect(body.data.points[1]).toEqual({
      date: '2026-10-20',
      feedingCount: 8,
      totalAmountMl: 360.0,
      totalSolidG: 50.0,
      totalBreastDurationSec: 3180,
      totalDurationSec: 3600,
      avgDurationSec: 600,
    });
    expect(body.data.points[2]).toEqual({
      date: '2026-10-21',
      feedingCount: 1,
      totalAmountMl: 120.0,
      totalSolidG: 0.0,
      totalBreastDurationSec: 0,
      totalDurationSec: 300,
      avgDurationSec: 300,
    });
  });

  test('STATS-08 趋势参数与跨度上限', async ({ request }) => {
    const { client, baby } = await setupBaby(request);
    const otherDevice = await setupBaby(request);

    for (const query of [
      `babyId=${baby.id}&from=2026-10-01`,
      `babyId=${baby.id}&to=2026-10-01`,
      `babyId=${baby.id}&from=2026-10-21&to=2026-10-01`,
      `babyId=${baby.id}&from=2026/10/01&to=2026/10/02`,
    ]) {
      await expectError(
        await client.get(`/stats/trend?${query}`),
        400,
        'VALIDATION_ERROR',
      );
    }

    const ninety = await expectOk<Trend>(
      await client.get(
        `/stats/trend?babyId=${baby.id}&from=2026-01-01&to=2026-03-31`,
      ),
    );
    expect(ninety.data.points).toHaveLength(90);

    await expectError(
      await client.get(
        `/stats/trend?babyId=${baby.id}&from=2025-12-31&to=2026-03-31`,
      ),
      400,
      'VALIDATION_ERROR',
    );

    await expectError(
      await otherDevice.client.get(
        `/stats/trend?babyId=${baby.id}&from=2026-10-01&to=2026-10-02`,
      ),
      404,
      'NOT_FOUND',
    );
  });

  test('STATS-09 平均值口径与 HALF_UP 舍入', async ({ request }) => {
    const { client, baby: babyA } = await setupBaby(request);
    const babyB = await createBaby(client, { name: 'B2', isDefault: false });
    const babyC = await createBaby(client, { name: 'B3', isDefault: false });

    // ① 3 条有 duration（100/101/101）+ 1 条无 duration → 100.67 → 101
    for (const [index, duration] of [100, 101, 101].entries()) {
      await createFeeding(client, babyA.id, {
        startedAt: at('2026-10-01', `${String(index + 8).padStart(2, '0')}:00:00`),
        durationSec: duration,
        amountValue: 120,
      });
    }
    await createFeeding(client, babyA.id, {
      startedAt: at('2026-10-01', '12:00:00'),
      durationSec: null,
      amountValue: 120,
    });

    const trendA = await expectOk<Trend>(
      await client.get(
        `/stats/trend?babyId=${babyA.id}&from=2026-10-01&to=2026-10-01`,
      ),
    );
    expect(trendA.data.points[0].avgDurationSec).toBe(101);

    // ② 100/101 → 100.5 HALF_UP → 101（HALF_EVEN 会是 100）
    for (const [index, duration] of [100, 101].entries()) {
      await createFeeding(client, babyB.id, {
        startedAt: at('2026-10-02', `${String(index + 8).padStart(2, '0')}:00:00`),
        durationSec: duration,
        amountValue: 120,
      });
    }
    const trendB = await expectOk<Trend>(
      await client.get(
        `/stats/trend?babyId=${babyB.id}&from=2026-10-02&to=2026-10-02`,
      ),
    );
    expect(trendB.data.points[0].avgDurationSec).toBe(101);

    // ③ (100+100+100+101)/4 = 100.25 HALF_UP → 100.3（HALF_EVEN 会是 100.2）
    for (const [index, amount] of [100, 100, 100, 101].entries()) {
      await createFeeding(client, babyC.id, {
        startedAt: at('2026-10-03', `${String(index + 8).padStart(2, '0')}:00:00`),
        amountValue: amount,
      });
    }
    const dailyC = await expectOk<DailyStats>(
      await client.get(`/stats/daily?babyId=${babyC.id}&date=2026-10-03`),
    );
    expect(dailyC.data.avgAmountMl).toBe(100.3);
  });
});
