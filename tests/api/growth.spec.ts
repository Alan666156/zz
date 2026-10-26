import { expect, test } from '@playwright/test';

import { expectError, expectOk } from './helpers/api-client';
import { queryOne } from './helpers/db';
import { addDays, todayUtc } from './helpers/env';
import { uuid } from './helpers/fixtures';
import {
  createBaby,
  expectUtcMillis,
  resetApiState,
  setupBaby,
  setupDevice,
  type Page,
} from './helpers/scenario';

interface GrowthRecord {
  id: string;
  babyId: string;
  measuredOn: string;
  heightCm: number | null;
  weightKg: number | null;
  headCircumferenceCm: number | null;
  note: string | null;
  revision: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

type AnyRecord = Record<string, unknown>;

function growthBody(babyId: string, overrides: AnyRecord = {}): AnyRecord {
  return {
    id: uuid(),
    babyId,
    measuredOn: '2026-10-20',
    heightCm: 68.5,
    weightKg: 8.12,
    headCircumferenceCm: 43.0,
    note: '社区体检',
    ...overrides,
  };
}

/**
 * 契约：docs/architecture/v1.0-baby-feeding.md §4.8、§4.1、addendum Q-02
 * 用例：docs/tests/v1.0.md §11（GROWTH-01..GROWTH-12）
 * 状态：TE-02 可执行断言。
 */
test.describe('生长记录（GROWTH）', () => {
  test.beforeEach(async () => {
    await resetApiState();
  });

  test('GROWTH-01 创建单指标记录', async ({ request }) => {
    const { client, baby } = await setupBaby(request);
    const id = uuid();

    const body = await expectOk<{ created: boolean; record: GrowthRecord }>(
      await client.post('/growth-records', {
        id,
        babyId: baby.id,
        measuredOn: '2026-10-20',
        weightKg: 8.12,
        note: '社区体检',
      }),
    );
    const record = body.data.record;
    expect(body.data.created).toBe(true);
    expect(record.id).toBe(id);
    expect(record.heightCm).toBeNull();
    expect(record.headCircumferenceCm).toBeNull();
    expect(record.weightKg).toBe(8.12);
    expect(record.note).toBe('社区体检');
    expect(record.revision).toBe(1);
    expectUtcMillis(record.createdAt);
    expectUtcMillis(record.updatedAt);
  });

  test('GROWTH-02 至少提供一项指标', async ({ request }) => {
    const { client, baby } = await setupBaby(request);

    for (const payload of [
      growthBody(baby.id, {
        heightCm: undefined,
        weightKg: undefined,
        headCircumferenceCm: undefined,
      }),
      growthBody(baby.id, {
        heightCm: null,
        weightKg: null,
        headCircumferenceCm: null,
      }),
    ]) {
      await expectError(
        await client.post('/growth-records', payload),
        400,
        'VALIDATION_ERROR',
      );
    }

    const onlyHeight = await expectOk<{ created: boolean }>(
      await client.post(
        '/growth-records',
        growthBody(baby.id, { weightKg: undefined, headCircumferenceCm: undefined }),
      ),
    );
    expect(onlyHeight.data.created).toBe(true);
  });

  test('GROWTH-03 指标范围边界', async ({ request }) => {
    const { client, baby } = await setupBaby(request);

    const cases: Array<[string, AnyRecord, number]> = [
      ['height 20.0', { heightCm: 20.0, weightKg: undefined, headCircumferenceCm: undefined }, 200],
      ['height 150.0', { heightCm: 150.0, weightKg: undefined, headCircumferenceCm: undefined }, 200],
      ['height 19.9', { heightCm: 19.9, weightKg: undefined, headCircumferenceCm: undefined }, 400],
      ['height 150.1', { heightCm: 150.1, weightKg: undefined, headCircumferenceCm: undefined }, 400],
      ['weight 0.5', { weightKg: 0.5, heightCm: undefined, headCircumferenceCm: undefined }, 200],
      ['weight 50', { weightKg: 50, heightCm: undefined, headCircumferenceCm: undefined }, 200],
      ['weight 0.49', { weightKg: 0.49, heightCm: undefined, headCircumferenceCm: undefined }, 400],
      ['weight 50.01', { weightKg: 50.01, heightCm: undefined, headCircumferenceCm: undefined }, 400],
      ['head 20.0', { headCircumferenceCm: 20.0, heightCm: undefined, weightKg: undefined }, 200],
      ['head 70.0', { headCircumferenceCm: 70.0, heightCm: undefined, weightKg: undefined }, 200],
      ['head 19.9', { headCircumferenceCm: 19.9, heightCm: undefined, weightKg: undefined }, 400],
      ['head 70.1', { headCircumferenceCm: 70.1, heightCm: undefined, weightKg: undefined }, 400],
    ];

    for (const [label, overrides, status] of cases) {
      const response = await client.post('/growth-records', growthBody(baby.id, overrides));
      expect(response.status(), label).toBe(status);
      if (status === 400) {
        await expectError(response, 400, 'VALIDATION_ERROR');
      } else {
        await expectOk(response);
      }
    }
  });

  test('GROWTH-04 小数位与超精度拒绝', async ({ request }) => {
    const { client, baby } = await setupBaby(request);

    const valid: AnyRecord[] = [
      growthBody(baby.id, { weightKg: 8.12 }),
      growthBody(baby.id, { heightCm: 68.5 }),
      growthBody(baby.id, { headCircumferenceCm: 43.0 }),
    ];
    for (const payload of valid) {
      await expectOk(await client.post('/growth-records', payload));
    }

    const invalid: Array<[AnyRecord, string]> = [
      [{ weightKg: 8.123 }, 'weightKg'],
      [{ heightCm: 68.55 }, 'heightCm'],
      [{ headCircumferenceCm: 43.55 }, 'headCircumferenceCm'],
    ];
    for (const [overrides, field] of invalid) {
      const response = await client.post('/growth-records', growthBody(baby.id, overrides));
      const body = await expectError(response, 400, 'VALIDATION_ERROR');
      expect(
        (body.data as { fieldErrors: Array<{ field: string }> }).fieldErrors.some(
          (item) => item.field === field,
        ),
      ).toBe(true);
    }

    const scaledResponse = await client.post(
      '/growth-records',
      growthBody(baby.id, { weightKg: 8.5, heightCm: 68, headCircumferenceCm: 43 }),
    );
    const scaledBody = await expectOk<{ record: GrowthRecord }>(scaledResponse);
    expect(scaledBody.data.record.weightKg).toBe(8.5);
    expect(scaledBody.data.record.heightCm).toBe(68);
    expect(scaledBody.data.record.headCircumferenceCm).toBe(43);

    // JSON number 的 scale 只能在原始文本中验证（Jackson BigDecimal 保留 8.50/68.0/43.0）。
    const raw = await scaledResponse.text();
    expect(raw).toContain('"weightKg":8.50');
    expect(raw).toContain('"heightCm":68.0');
    expect(raw).toContain('"headCircumferenceCm":43.0');

    const count = queryOne(
      `SELECT COUNT(*) FROM growth_record WHERE baby_id = '${baby.id}' AND deleted_at IS NULL`,
    );
    expect(Number(count?.[0])).toBe(4);
  });

  test('GROWTH-05 measuredOn 边界与同日多条', async ({ request }) => {
    const { client, baby } = await setupBaby(request);
    const today = todayUtc();

    for (const measuredOn of [today, addDays(today, 1), '2026-03-01']) {
      await expectOk(
        await client.post('/growth-records', growthBody(baby.id, { measuredOn })),
      );
    }
    await expectOk(
      await client.post(
        '/growth-records',
        growthBody(baby.id, { measuredOn: today, weightKg: 8.2 }),
      ),
    );

    for (const measuredOn of [addDays(today, 2), '2026-02-28']) {
      const response = await client.post(
        '/growth-records',
        growthBody(baby.id, { measuredOn }),
      );
      const body = await expectError(response, 400, 'VALIDATION_ERROR');
      expect(
        (body.data as { fieldErrors: Array<{ field: string }> }).fieldErrors.some(
          (item) => item.field === 'measuredOn',
        ),
      ).toBe(true);
    }

    const sameDay = await expectOk<Page<GrowthRecord>>(
      await client.get(`/growth-records?babyId=${baby.id}&size=100`),
    );
    expect(sameDay.data.items.filter((item) => item.measuredOn === today)).toHaveLength(2);
  });

  test('GROWTH-06 相同 id 重复创建幂等', async ({ request }) => {
    const { client, baby } = await setupBaby(request);
    const id = uuid();
    const first = await expectOk<{ record: GrowthRecord }>(
      await client.post('/growth-records', growthBody(baby.id, { id })),
    );

    const duplicate = await expectOk<{ created: boolean; record: GrowthRecord }>(
      await client.post('/growth-records', growthBody(baby.id, { id, weightKg: 9.0 })),
    );
    expect(duplicate.data.created).toBe(false);
    expect(duplicate.data.record.weightKg).toBe(8.12);
    expect(duplicate.data.record.revision).toBe(1);

    const list = await expectOk<Page<GrowthRecord>>(
      await client.get(`/growth-records?babyId=${baby.id}`),
    );
    expect(list.data.total).toBe(1);
    expect(first.data.record.id).toBe(id);
  });

  test('GROWTH-07 列表过滤、排序与跨度', async ({ request }) => {
    const { client, baby } = await setupBaby(request);

    const older = await expectOk<{ record: GrowthRecord }>(
      await client.post(
        '/growth-records',
        growthBody(baby.id, { measuredOn: '2026-10-18', weightKg: 8.0 }),
      ),
    );
    const sameDayFirst = await expectOk<{ record: GrowthRecord }>(
      await client.post(
        '/growth-records',
        growthBody(baby.id, { measuredOn: '2026-10-20', weightKg: 8.1 }),
      ),
    );
    const sameDaySecond = await expectOk<{ record: GrowthRecord }>(
      await client.post(
        '/growth-records',
        growthBody(baby.id, { measuredOn: '2026-10-20', weightKg: 8.2 }),
      ),
    );
    const newest = await expectOk<{ record: GrowthRecord }>(
      await client.post(
        '/growth-records',
        growthBody(baby.id, { measuredOn: '2026-10-22', weightKg: 8.3 }),
      ),
    );
    const deleted = await expectOk<{ record: GrowthRecord }>(
      await client.post(
        '/growth-records',
        growthBody(baby.id, { measuredOn: '2026-10-21', weightKg: 8.25 }),
      ),
    );
    await expectOk(
      await client.delete(`/growth-records/${deleted.data.record.id}?baseRevision=1`),
    );

    const all = await expectOk<Page<GrowthRecord>>(
      await client.get(`/growth-records?babyId=${baby.id}&size=100`),
    );
    expect(all.data.total).toBe(4);
    expect(all.data.items.map((item) => item.id)).toEqual([
      newest.data.record.id,
      sameDaySecond.data.record.id,
      sameDayFirst.data.record.id,
      older.data.record.id,
    ]);

    const range = await expectOk<Page<GrowthRecord>>(
      await client.get(
        `/growth-records?babyId=${baby.id}&from=2026-10-20&to=2026-10-21&size=100`,
      ),
    );
    expect(range.data.total).toBe(2);
    expect(range.data.items.every((item) => item.measuredOn === '2026-10-20')).toBe(true);

    for (const [from, to, status] of [
      ['2025-10-20', '2026-10-20', 200],
      ['2025-10-19', '2026-10-20', 400],
      ['2026-10-21', '2026-10-20', 400],
    ] as const) {
      const response = await client.get(
        `/growth-records?babyId=${baby.id}&from=${from}&to=${to}`,
      );
      expect(response.status()).toBe(status);
    }

    for (const query of ['size=101', 'page=0']) {
      await expectError(
        await client.get(`/growth-records?babyId=${baby.id}&${query}`),
        400,
        'VALIDATION_ERROR',
      );
    }
  });

  test('GROWTH-08 latest', async ({ request }) => {
    const { client, baby } = await setupBaby(request);

    const older = await expectOk<{ record: GrowthRecord }>(
      await client.post(
        '/growth-records',
        growthBody(baby.id, { measuredOn: '2026-10-18' }),
      ),
    );
    const newer = await expectOk<{ record: GrowthRecord }>(
      await client.post(
        '/growth-records',
        growthBody(baby.id, { measuredOn: '2026-10-20' }),
      ),
    );

    const latest = await expectOk<GrowthRecord>(
      await client.get(`/growth-records/latest?babyId=${baby.id}`),
    );
    expect(latest.data.id).toBe(newer.data.record.id);
    expect(latest.data.id).not.toBe(older.data.record.id);

    const emptyBaby = await createBaby(client, { name: '无记录', isDefault: false });
    const empty = await expectOk<GrowthRecord | null>(
      await client.get(`/growth-records/latest?babyId=${emptyBaby.id}`),
    );
    expect(empty.data).toBeNull();
  });

  test('GROWTH-09 PATCH 部分更新与“至少一项”约束', async ({ request }) => {
    const { client, baby } = await setupBaby(request);
    const record = await expectOk<{ record: GrowthRecord }>(
      await client.post('/growth-records', growthBody(baby.id)),
    );

    const first = await expectOk<GrowthRecord>(
      await client.patch(`/growth-records/${record.data.record.id}`, {
        baseRevision: 1,
        weightKg: 8.5,
      }),
    );
    expect(first.data.weightKg).toBe(8.5);
    expect(first.data.heightCm).toBe(68.5);
    expect(first.data.headCircumferenceCm).toBe(43.0);
    expect(first.data.revision).toBe(2);

    const second = await expectOk<GrowthRecord>(
      await client.patch(`/growth-records/${record.data.record.id}`, {
        baseRevision: 2,
        heightCm: null,
        headCircumferenceCm: null,
      }),
    );
    expect(second.data.heightCm).toBeNull();
    expect(second.data.headCircumferenceCm).toBeNull();
    expect(second.data.weightKg).toBe(8.5);
    expect(second.data.revision).toBe(3);

    await expectError(
      await client.patch(`/growth-records/${record.data.record.id}`, {
        baseRevision: 3,
        weightKg: null,
      }),
      400,
      'VALIDATION_ERROR',
    );

    const fetched = await expectOk<GrowthRecord>(
      await client.get(`/growth-records/${record.data.record.id}`),
    );
    expect(fetched.data.revision).toBe(3);
    expect(fetched.data.weightKg).toBe(8.5);
  });

  test('GROWTH-10 revision 冲突、删除与幂等', async ({ request }) => {
    const { client, baby } = await setupBaby(request);
    const record = await expectOk<{ record: GrowthRecord }>(
      await client.post('/growth-records', growthBody(baby.id)),
    );
    await expectOk(
      await client.patch(`/growth-records/${record.data.record.id}`, {
        baseRevision: 1,
        weightKg: 8.2,
      }),
    );

    const conflict = await client.patch(`/growth-records/${record.data.record.id}`, {
      baseRevision: 1,
      weightKg: 9.9,
    });
    const conflictBody = await expectError(conflict, 409, 'CONFLICT');
    expect((conflictBody.data as { current: GrowthRecord }).current.revision).toBe(2);

    const second = await expectOk<{ record: GrowthRecord }>(
      await client.post(
        '/growth-records',
        growthBody(baby.id, { measuredOn: '2026-10-19', weightKg: 8.0 }),
      ),
    );
    const deleted = await expectOk<{
      revision: number;
      deletedAt: string;
      alreadyDeleted: boolean;
    }>(
      await client.delete(`/growth-records/${second.data.record.id}?baseRevision=1`),
    );
    expect(deleted.data.revision).toBe(2);
    expectUtcMillis(deleted.data.deletedAt);
    expect(deleted.data.alreadyDeleted).toBe(false);

    const again = await expectOk<{
      revision: number;
      deletedAt: string;
      alreadyDeleted: boolean;
    }>(
      await client.delete(`/growth-records/${second.data.record.id}?baseRevision=2`),
    );
    expect(again.data.alreadyDeleted).toBe(true);
    expect(again.data.revision).toBe(2);

    await expectError(
      await client.post('/growth-records', growthBody(baby.id, { id: second.data.record.id })),
      404,
      'NOT_FOUND',
    );
    await expectError(
      await client.get(`/growth-records/${second.data.record.id}`),
      404,
      'NOT_FOUND',
    );
    await expectError(
      await client.patch(`/growth-records/${second.data.record.id}`, {
        baseRevision: 2,
        weightKg: 8.3,
      }),
      404,
      'NOT_FOUND',
    );

    const list = await expectOk<Page<GrowthRecord>>(
      await client.get(`/growth-records?babyId=${baby.id}`),
    );
    expect(list.data.items.map((item) => item.id)).not.toContain(second.data.record.id);

    const row = queryOne(
      `SELECT deleted_at IS NOT NULL FROM growth_record WHERE id = '${second.data.record.id}'`,
    );
    expect(row?.[0]).toBe('1');
  });

  test('GROWTH-11 跨设备隔离', async ({ request }) => {
    const d1 = await setupBaby(request);
    const record = await expectOk<{ record: GrowthRecord }>(
      await d1.client.post('/growth-records', growthBody(d1.baby.id)),
    );
    const d2 = await setupBaby(request);

    await expectError(
      await d2.client.get(`/growth-records/${record.data.record.id}`),
      404,
      'NOT_FOUND',
    );
    await expectError(
      await d2.client.get(`/growth-records?babyId=${d1.baby.id}`),
      404,
      'NOT_FOUND',
    );
    await expectError(
      await d2.client.get(`/growth-records/latest?babyId=${d1.baby.id}`),
      404,
      'NOT_FOUND',
    );
    await expectError(
      await d2.client.patch(`/growth-records/${record.data.record.id}`, {
        baseRevision: 1,
        weightKg: 9.0,
      }),
      404,
      'NOT_FOUND',
    );
    await expectError(
      await d2.client.delete(`/growth-records/${record.data.record.id}?baseRevision=1`),
      404,
      'NOT_FOUND',
    );
    await expectError(
      await d1.client.post('/growth-records', growthBody(d2.baby.id)),
      404,
      'NOT_FOUND',
    );

    const fetched = await expectOk<GrowthRecord>(
      await d1.client.get(`/growth-records/${record.data.record.id}`),
    );
    expect(fetched.data.weightKg).toBe(8.12);
    expect(fetched.data.revision).toBe(1);
    expect(fetched.data.deletedAt).toBeNull();
  });

  test('GROWTH-12 删除宝宝后生长记录不可见', async ({ request }) => {
    const { client, baby } = await setupBaby(request);
    const record = await expectOk<{ record: GrowthRecord }>(
      await client.post('/growth-records', growthBody(baby.id)),
    );

    await expectOk(await client.delete(`/babies/${baby.id}?baseRevision=1`));

    await expectError(
      await client.get(`/growth-records?babyId=${baby.id}`),
      404,
      'NOT_FOUND',
    );
    await expectError(
      await client.get(`/growth-records/latest?babyId=${baby.id}`),
      404,
      'NOT_FOUND',
    );

    const row = queryOne(
      `SELECT deleted_at IS NOT NULL, revision FROM growth_record WHERE id = '${record.data.record.id}'`,
    );
    expect(row?.[0]).toBe('1');
    expect(row?.[1]).toBe('2');
  });
});
