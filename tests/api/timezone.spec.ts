import { expect, test } from '@playwright/test';

import { expectOk } from './helpers/api-client';
import { queryOne } from './helpers/db';
import { at, uuid } from './helpers/fixtures';
import {
  createFeeding,
  expectUtcMillis,
  resetApiState,
  setupBaby,
  type FeedingRecord,
  type Page,
} from './helpers/scenario';

/**
 * 契约：docs/architecture/v1.0-baby-feeding.md §3.4、§4.6、§4.7
 * 用例：docs/tests/v1.0.md §9（TZ-01..TZ-06）
 * 状态：TE-02 可执行断言。
 */
test.describe('时区与本地日期（TZ）', () => {
  test.beforeEach(async () => {
    await resetApiState();
  });

  test('TZ-01 +08:00 午夜边界', async ({ request }) => {
    const { client, baby } = await setupBaby(request);

    const beforeMidnight = await createFeeding(client, baby.id, {
      startedAt: '2026-10-20T23:59:59+08:00',
    });
    const afterMidnight = await createFeeding(client, baby.id, {
      startedAt: '2026-10-21T00:00:00+08:00',
    });

    expect(beforeMidnight.recordDate).toBe('2026-10-20');
    expect(afterMidnight.recordDate).toBe('2026-10-21');

    const day20 = await expectOk<Page<FeedingRecord>>(
      await client.get(`/feeding-records?babyId=${baby.id}&date=2026-10-20`),
    );
    expect(day20.data.items.map((item) => item.id)).toEqual([beforeMidnight.id]);

    const day21 = await expectOk<Page<FeedingRecord>>(
      await client.get(`/feeding-records?babyId=${baby.id}&date=2026-10-21`),
    );
    expect(day21.data.items.map((item) => item.id)).toEqual([afterMidnight.id]);
  });

  test('TZ-02 同一 UTC 时刻、不同偏移 → 不同本地日期', async ({ request }) => {
    const { client, baby } = await setupBaby(request);

    const shanghai = await createFeeding(client, baby.id, {
      startedAt: '2026-10-27T01:00:00+08:00',
    });
    const utc = await createFeeding(client, baby.id, {
      startedAt: '2026-10-26T17:00:00+00:00',
    });

    expect(shanghai.recordDate).toBe('2026-10-27');
    expect(shanghai.tzOffsetMinutes).toBe(480);
    expect(utc.recordDate).toBe('2026-10-26');
    expect(utc.tzOffsetMinutes).toBe(0);

    const shanghaiRow = queryOne(
      `SELECT started_at FROM feeding_record WHERE id = '${shanghai.id}'`,
    );
    const utcRow = queryOne(`SELECT started_at FROM feeding_record WHERE id = '${utc.id}'`);
    expect(shanghaiRow?.[0]).toBe(utcRow?.[0]);
  });

  test('TZ-03 夏令时偏移可用', async ({ request }) => {
    const { client, baby } = await setupBaby(request);

    const record = await createFeeding(client, baby.id, {
      startedAt: '2026-03-08T03:30:00-04:00',
    });
    expect(record.tzOffsetMinutes).toBe(-240);
    expect(record.recordDate).toBe('2026-03-08');

    const row = queryOne(
      `SELECT started_at FROM feeding_record WHERE id = '${record.id}'`,
    );
    expect(row?.[0]).toBe('2026-03-08 07:30:00.000');
  });

  test('TZ-04 响应保留原始偏移、审计时间用 UTC', async ({ request }) => {
    const { client, baby } = await setupBaby(request);

    const created = await createFeeding(client, baby.id, {
      startedAt: '2026-10-20T14:00:00+08:00',
    });
    const fetched = await expectOk<FeedingRecord>(
      await client.get(`/feeding-records/${created.id}`),
    );

    expect(fetched.data.startedAt).toBe('2026-10-20T14:00:00+08:00');
    expectUtcMillis(fetched.data.createdAt);
    expectUtcMillis(fetched.data.updatedAt);
    expect(fetched.data.recordDate).toBe('2026-10-20');
  });

  test('TZ-05 统计按本地日期分组（跨月/跨年）', async ({ request }) => {
    const { client, baby } = await setupBaby(request);

    await createFeeding(client, baby.id, {
      startedAt: '2026-10-20T23:59:59+08:00',
      amountValue: 120,
    });
    await createFeeding(client, baby.id, {
      startedAt: '2026-12-31T23:30:00+08:00',
      amountValue: 100,
    });

    const october = await expectOk<{
      feedingCount: number;
      totalAmountMl: number;
    }>(await client.get(`/stats/daily?babyId=${baby.id}&date=2026-10-20`));
    expect(october.data.feedingCount).toBe(1);
    expect(october.data.totalAmountMl).toBe(120.0);

    const nextDay = await expectOk<{ feedingCount: number; totalAmountMl: number }>(
      await client.get(`/stats/daily?babyId=${baby.id}&date=2026-10-21`),
    );
    expect(nextDay.data.feedingCount).toBe(0);
    expect(nextDay.data.totalAmountMl).toBe(0.0);

    const newYearEve = await expectOk<{ feedingCount: number; totalAmountMl: number }>(
      await client.get(`/stats/daily?babyId=${baby.id}&date=2026-12-31`),
    );
    expect(newYearEve.data.feedingCount).toBe(1);
    expect(newYearEve.data.totalAmountMl).toBe(100.0);

    const newYear = await expectOk<{ feedingCount: number; totalAmountMl: number }>(
      await client.get(`/stats/daily?babyId=${baby.id}&date=2027-01-01`),
    );
    expect(newYear.data.feedingCount).toBe(0);
    expect(newYear.data.totalAmountMl).toBe(0.0);
  });

  test('TZ-06 recordDate 由服务端计算，忽略客户端伪造字段', async ({ request }) => {
    const { client, baby } = await setupBaby(request);

    const body = await expectOk<{ record: FeedingRecord }>(
      await client.post('/feeding-records', {
        id: uuid(),
        babyId: baby.id,
        feedType: 'FORMULA',
        amountValue: 120,
        amountUnit: 'ML',
        startedAt: at('2026-10-20', '08:00:00'),
        recordDate: '1999-01-01',
        tzOffsetMinutes: -720,
      }),
    );

    expect(body.data.record.recordDate).toBe('2026-10-20');
    expect(body.data.record.tzOffsetMinutes).toBe(480);
  });
});
