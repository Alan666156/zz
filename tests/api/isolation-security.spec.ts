import { expect, test } from '@playwright/test';

import { expectError, expectOk } from './helpers/api-client';
import { downloadCsv } from './helpers/csv';
import { at, uuid } from './helpers/fixtures';
import {
  createFeeding,
  expectSameNotFound,
  resetApiState,
  setupBaby,
  type Baby,
  type Page,
} from './helpers/scenario';

interface StatsDaily {
  feedingCount: number;
  totalAmountMl: number;
}

interface GrowthRecord {
  id: string;
  revision: number;
  deletedAt: string | null;
  weightKg: number | null;
}

/**
 * 契约：docs/architecture/v1.0-baby-feeding.md §2.5、§4.5、§4.6、§4.7、§4.8、§4.9、§4.2
 * 用例：docs/tests/v1.0.md §15（ISO-01..ISO-05）、§16（SEC-01..SEC-03）
 * 状态：TE-02 可执行断言。
 */
test.describe('设备隔离与安全（ISO/SEC）', () => {
  test.beforeEach(async () => {
    await resetApiState();
  });

  test('ISO-01 列表、统计、趋势不泄露其他设备数据', async ({ request }) => {
    const d1 = await setupBaby(request, { name: '小满' });
    const d1Feeding = await createFeeding(d1.client, d1.baby.id, {
      startedAt: at('2026-10-20', '08:00:00'),
    });
    const d1Growth = await expectOk<{ record: GrowthRecord }>(
      await d1.client.post('/growth-records', {
        babyId: d1.baby.id,
        measuredOn: '2026-10-20',
        weightKg: 8.12,
      }),
    );
    const d2 = await setupBaby(request, { name: '别人家的宝宝' });
    const d2Feeding = await createFeeding(d2.client, d2.baby.id);

    const d1List = await expectOk<Baby[]>(await d1.client.get('/babies'));
    expect(d1List.data.map((item) => item.id)).toEqual([d1.baby.id]);
    expect(JSON.stringify(d1List.data)).not.toContain(d2.baby.name);
    expect(JSON.stringify(d1List.data)).not.toContain(d2.deviceId);

    const d1Feedings = await expectOk<Page<{ id: string }>>(
      await d1.client.get(`/feeding-records?babyId=${d1.baby.id}&date=2026-10-20`),
    );
    expect(d1Feedings.data.items.map((item) => item.id)).toEqual([d1Feeding.id]);
    expect(JSON.stringify(d1Feedings.data)).not.toContain(d2Feeding.id);

    const d1Stats = await expectOk<StatsDaily>(
      await d1.client.get(`/stats/daily?babyId=${d1.baby.id}&date=2026-10-20`),
    );
    expect(d1Stats.data.feedingCount).toBe(1);

    await expectOk(
      await d1.client.get(
        `/stats/trend?babyId=${d1.baby.id}&from=2026-10-20&to=2026-10-20`,
      ),
    );

    for (const path of [
      `/babies/${d1.baby.id}`,
      `/feeding-records?babyId=${d1.baby.id}&date=2026-10-20`,
      `/growth-records?babyId=${d1.baby.id}`,
      `/stats/daily?babyId=${d1.baby.id}&date=2026-10-20`,
      `/stats/trend?babyId=${d1.baby.id}&from=2026-10-20&to=2026-10-20`,
    ]) {
      await expectError(await d2.client.get(path), 404, 'NOT_FOUND');
    }

    const d1GrowthList = await expectOk<Page<GrowthRecord>>(
      await d1.client.get(`/growth-records?babyId=${d1.baby.id}`),
    );
    expect(d1GrowthList.data.items.map((item) => item.id)).toEqual([
      d1Growth.data.record.id,
    ]);
  });

  test('ISO-02 跨设备单条读取与“不存在”响应完全一致', async ({ request }) => {
    const d1 = await setupBaby(request);
    const feeding = await createFeeding(d1.client, d1.baby.id);
    const growth = await expectOk<{ record: GrowthRecord }>(
      await d1.client.post('/growth-records', {
        babyId: d1.baby.id,
        measuredOn: '2026-10-20',
        weightKg: 8.12,
      }),
    );
    const d2 = await setupBaby(request);

    const responses = await Promise.all([
      d2.client.get(`/babies/${d1.baby.id}`),
      d2.client.get(`/babies/${uuid()}`),
      d2.client.get(`/feeding-records/${feeding.id}`),
      d2.client.get(`/growth-records/${growth.data.record.id}`),
    ]);

    const bodies = [];
    for (const response of responses) {
      bodies.push(await expectError(response, 404, 'NOT_FOUND'));
    }
    for (const body of bodies.slice(1)) {
      expectSameNotFound(bodies[0], body);
    }
  });

  test('ISO-03 跨设备创建子资源', async ({ request }) => {
    const d1 = await setupBaby(request);
    await createFeeding(d1.client, d1.baby.id);
    const before = await expectOk<StatsDaily>(
      await d1.client.get(`/stats/daily?babyId=${d1.baby.id}&date=2026-10-20`),
    );
    const d2 = await setupBaby(request);

    await expectError(
      await d2.client.post('/feeding-records', {
        babyId: d1.baby.id,
        feedType: 'FORMULA',
        amountValue: 500,
        amountUnit: 'ML',
        startedAt: at('2026-10-20', '20:00:00'),
      }),
      404,
      'NOT_FOUND',
    );
    await expectError(
      await d2.client.post('/growth-records', {
        babyId: d1.baby.id,
        measuredOn: '2026-10-20',
        weightKg: 9.0,
      }),
      404,
      'NOT_FOUND',
    );

    const after = await expectOk<StatsDaily>(
      await d1.client.get(`/stats/daily?babyId=${d1.baby.id}&date=2026-10-20`),
    );
    expect(after.data).toEqual(before.data);
  });

  test('ISO-04 跨设备修改/删除', async ({ request }) => {
    const d1 = await setupBaby(request);
    const feeding = await createFeeding(d1.client, d1.baby.id);
    const growth = await expectOk<{ record: GrowthRecord }>(
      await d1.client.post('/growth-records', {
        babyId: d1.baby.id,
        measuredOn: '2026-10-20',
        weightKg: 8.12,
      }),
    );
    const d2 = await setupBaby(request);

    const attempts = [
      d2.client.patch(`/babies/${d1.baby.id}`, { baseRevision: 1, name: '越权' }),
      d2.client.delete(`/babies/${d1.baby.id}?baseRevision=1`),
      d2.client.patch(`/feeding-records/${feeding.id}`, {
        baseRevision: 1,
        amountValue: 999,
      }),
      d2.client.delete(`/feeding-records/${feeding.id}?baseRevision=1`),
      d2.client.patch(`/growth-records/${growth.data.record.id}`, {
        baseRevision: 1,
        weightKg: 9.9,
      }),
      d2.client.delete(`/growth-records/${growth.data.record.id}?baseRevision=1`),
    ];
    for (const response of await Promise.all(attempts)) {
      await expectError(response, 404, 'NOT_FOUND');
    }

    const baby = await expectOk<Baby>(await d1.client.get(`/babies/${d1.baby.id}`));
    expect(baby.data.name).toBe('小满');
    expect(baby.data.revision).toBe(1);
    expect(baby.data.deletedAt).toBeNull();

    const feedingAfter = await expectOk<{ revision: number; amountValue: number; deletedAt: string | null }>(
      await d1.client.get(`/feeding-records/${feeding.id}`),
    );
    expect(feedingAfter.data.revision).toBe(1);
    expect(feedingAfter.data.amountValue).toBe(120);
    expect(feedingAfter.data.deletedAt).toBeNull();

    const growthAfter = await expectOk<GrowthRecord>(
      await d1.client.get(`/growth-records/${growth.data.record.id}`),
    );
    expect(growthAfter.data.revision).toBe(1);
    expect(growthAfter.data.weightKg).toBe(8.12);
    expect(growthAfter.data.deletedAt).toBeNull();
  });

  test('ISO-05 导出只允许本设备宝宝', async ({ request }) => {
    const d1 = await setupBaby(request);
    await createFeeding(d1.client, d1.baby.id);
    const ticket = await expectOk<{ downloadUrl: string }>(
      await d1.client.post('/exports/feeding-records', {
        babyId: d1.baby.id,
        from: '2026-10-20',
        to: '2026-10-20',
      }),
    );
    const d2 = await setupBaby(request);

    await expectError(
      await d2.client.post('/exports/feeding-records', {
        babyId: d1.baby.id,
        from: '2026-10-20',
        to: '2026-10-20',
      }),
      404,
      'NOT_FOUND',
    );

    const download = await downloadCsv(request, ticket.data.downloadUrl);
    expect(download.status).toBe(200);
    expect(download.text).toContain('小满');
  });

  test('SEC-01 宝宝名中的 HTML 原样存储、由前端转义渲染', async ({ request }) => {
    const { client } = await setupBaby(request, { name: '<b>小满</b>' });

    const list = await expectOk<Baby[]>(await client.get('/babies'));
    expect(list.data[0].name).toBe('<b>小满</b>');
    expect(list.data[0].name).not.toContain('&lt;');
  });

  test('SEC-02 导出 token 路径穿越/畸形输入', async ({ request }) => {
    const paths = [
      '/api/v1/exports/feeding-records/..%2F..%2Fetc%2Fpasswd.csv',
      '/api/v1/exports/feeding-records/%00.csv',
      '/api/v1/exports/feeding-records/aaaa.bbbb.csv',
    ];

    for (const path of paths) {
      const response = await request.get(path);
      expect([403, 404]).toContain(response.status());
      const text = await response.text();
      expect(text).not.toContain('root:');
      expect(text).not.toContain('No such file');
      expect(text).not.toContain('Exception');
    }
  });

  test('SEC-03 错误响应不泄露内部实现', async ({ request }) => {
    const { client, baby } = await setupBaby(request);

    const errors = [
      await client.post('/babies', { name: '', birthDate: '2026-03-01' }),
      await client.get(`/babies/${uuid()}`),
      await client.patch(`/babies/${baby.id}`, { baseRevision: 99, name: '冲突' }),
    ];

    // 触发一次 429：耗尽设备 API 额度。
    for (let index = 0; index < 130; index += 1) {
      const response = await client.get('/babies');
      if (response.status() === 429) {
        errors.push(response);
        break;
      }
    }
    expect(errors.some((response) => response.status() === 429)).toBe(true);

    for (const response of errors) {
      const body = (await response.json()) as Record<string, unknown>;
      expect(Object.keys(body).sort()).toEqual(
        ['code', 'data', 'message', 'requestId', 'serverTime'].sort(),
      );
      const serialized = JSON.stringify(body);
      for (const forbidden of [
        'Exception',
        'stack',
        'SELECT ',
        'select ',
        'jdbc:',
        'password',
        'com.zz.babyfeeding',
        baby.id,
      ]) {
        expect(serialized).not.toContain(forbidden);
      }
    }
  });
});
