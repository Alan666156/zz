import { expect, test } from '@playwright/test';

import { expectError, expectOk } from './helpers/api-client';
import { at, uuid } from './helpers/fixtures';
import {
  createFeeding,
  expectUtcMillis,
  resetApiState,
  setupBaby,
  type FeedingRecord,
  type Page,
} from './helpers/scenario';

type AnyRecord = Record<string, unknown>;

function breastBody(babyId: string, overrides: AnyRecord = {}): AnyRecord {
  return {
    id: uuid(),
    babyId,
    feedType: 'BREAST',
    breastSide: 'LEFT',
    durationSec: 900,
    startedAt: at('2026-10-20', '08:00:00'),
    endedAt: at('2026-10-20', '08:15:00'),
    note: '中途有点吐奶',
    tags: ['SPIT_UP'],
    ...overrides,
  };
}

function formulaBody(babyId: string, overrides: AnyRecord = {}): AnyRecord {
  return {
    id: uuid(),
    babyId,
    feedType: 'FORMULA',
    amountValue: 120,
    amountUnit: 'ML',
    startedAt: at('2026-10-20', '10:00:00'),
    ...overrides,
  };
}

function solidBody(babyId: string, overrides: AnyRecord = {}): AnyRecord {
  return {
    id: uuid(),
    babyId,
    feedType: 'SOLID',
    amountValue: 30,
    amountUnit: 'G',
    startedAt: at('2026-10-20', '13:00:00'),
    ...overrides,
  };
}

/**
 * 契约：docs/architecture/v1.0-baby-feeding.md §4.6、§3.4
 * 用例：docs/tests/v1.0.md §8（FEED-01..FEED-24）
 * 状态：TE-02 可执行断言。
 */
test.describe('喂养记录（FEED）', () => {
  test.beforeEach(async () => {
    await resetApiState();
  });

  test('FEED-01 创建母乳记录（精确响应）', async ({ request }) => {
    const { client, baby } = await setupBaby(request);
    const id = uuid();

    const response = await client.post(
      '/feeding-records',
      breastBody(baby.id, { id }),
    );
    const body = await expectOk<{ created: boolean; record: FeedingRecord }>(response);
    const record = body.data.record;

    expect(body.data.created).toBe(true);
    expect(record.id).toBe(id);
    expect(record.revision).toBe(1);
    expect(record.amountValue).toBeNull();
    expect(record.amountUnit).toBeNull();
    expect(record.breastSide).toBe('LEFT');
    expect(record.durationSec).toBe(900);
    expect(record.startedAt).toBe('2026-10-20T08:00:00+08:00');
    expect(record.endedAt).toBe('2026-10-20T08:15:00+08:00');
    expect(record.recordDate).toBe('2026-10-20');
    expect(record.tzOffsetMinutes).toBe(480);
    expect(record.note).toBe('中途有点吐奶');
    expect(record.tags).toEqual(['SPIT_UP']);
    expect(record.deletedAt).toBeNull();
    expectUtcMillis(record.createdAt);
    expectUtcMillis(record.updatedAt);

    const fetched = await expectOk<FeedingRecord>(
      await client.get(`/feeding-records/${id}`),
    );
    expect(fetched.data).toEqual(record);
  });

  test('FEED-02 创建配方奶记录', async ({ request }) => {
    const { client, baby } = await setupBaby(request);

    const body = await expectOk<{ created: boolean; record: FeedingRecord }>(
      await client.post('/feeding-records', formulaBody(baby.id, { id: undefined })),
    );
    const record = body.data.record;

    expect(body.data.created).toBe(true);
    expect(record.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(record.breastSide).toBeNull();
    expect(record.amountValue).toBe(120);
    expect(record.amountUnit).toBe('ML');
    expect(record.durationSec).toBeNull();
    expect(record.recordDate).toBe('2026-10-20');
  });

  test('FEED-03 创建混合记录', async ({ request }) => {
    const { client, baby } = await setupBaby(request);

    const body = await expectOk<{ created: boolean; record: FeedingRecord }>(
      await client.post(
        '/feeding-records',
        breastBody(baby.id, {
          feedType: 'MIXED',
          breastSide: 'BOTH',
          amountValue: 90,
          amountUnit: 'ML',
          durationSec: 480,
          endedAt: at('2026-10-20', '12:08:00'),
          startedAt: at('2026-10-20', '12:00:00'),
        }),
      ),
    );
    const record = body.data.record;
    expect(body.data.created).toBe(true);
    expect(record.feedType).toBe('MIXED');
    expect(record.breastSide).toBe('BOTH');
    expect(record.amountValue).toBe(90);
    expect(record.amountUnit).toBe('ML');
    expect(record.durationSec).toBe(480);
  });

  test('FEED-04 创建辅食记录', async ({ request }) => {
    const { client, baby } = await setupBaby(request);

    const body = await expectOk<{ created: boolean; record: FeedingRecord }>(
      await client.post('/feeding-records', solidBody(baby.id)),
    );
    const record = body.data.record;
    expect(body.data.created).toBe(true);
    expect(record.breastSide).toBeNull();
    expect(record.amountUnit).toBe('G');
    expect(record.recordDate).toBe('2026-10-20');
    expect(record.durationSec).toBeNull();
  });

  test('FEED-05 相同 id 重复创建幂等', async ({ request }) => {
    const { client, baby } = await setupBaby(request);
    const id = uuid();
    const first = await createFeeding(client, baby.id, {
      id,
      feedType: 'BREAST',
      breastSide: 'LEFT',
      amountValue: null,
      amountUnit: null,
      durationSec: 900,
    });

    const duplicate = await expectOk<{ created: boolean; record: FeedingRecord }>(
      await client.post('/feeding-records', breastBody(baby.id, { id, durationSec: 120 })),
    );
    expect(duplicate.data.created).toBe(false);
    expect(duplicate.data.record.durationSec).toBe(900);
    expect(duplicate.data.record.revision).toBe(1);

    const list = await expectOk<Page<FeedingRecord>>(
      await client.get(`/feeding-records?babyId=${baby.id}&date=2026-10-20`),
    );
    expect(list.data.total).toBe(1);

    await expectOk(await client.delete(`/feeding-records/${first.id}?baseRevision=1`));
    await expectError(
      await client.post('/feeding-records', breastBody(baby.id, { id })),
      404,
      'NOT_FOUND',
    );
  });

  test('FEED-06 母乳校验矩阵', async ({ request }) => {
    const { client, baby } = await setupBaby(request);

    const cases: Array<[string, AnyRecord, string]> = [
      ['缺 breastSide', { breastSide: undefined }, 'breastSide'],
      ['amountValue 非空', { amountValue: 10 }, 'amountValue'],
      ['amountUnit 非空', { amountUnit: 'ML' }, 'amountUnit'],
      ['durationSec=0', { durationSec: 0 }, 'durationSec'],
      ['durationSec=21601', { durationSec: 21601 }, 'durationSec'],
    ];

    for (const [label, overrides, field] of cases) {
      const response = await client.post('/feeding-records', breastBody(baby.id, overrides));
      const body = await expectError(response, 400, 'VALIDATION_ERROR');
      expect(
        (body.data as { fieldErrors: Array<{ field: string }> }).fieldErrors.some(
          (item) => item.field === field,
        ),
        `${label} should fail on ${field}`,
      ).toBe(true);
    }

    const list = await expectOk<Page<FeedingRecord>>(
      await client.get(`/feeding-records?babyId=${baby.id}&date=2026-10-20`),
    );
    expect(list.data.total).toBe(0);
  });

  test('FEED-07 配方奶校验矩阵', async ({ request }) => {
    const { client, baby } = await setupBaby(request);

    const valid: AnyRecord[] = [
      formulaBody(baby.id, { amountValue: 500 }),
      formulaBody(baby.id, { durationSec: 0 }),
      formulaBody(baby.id, { durationSec: 21600 }),
    ];
    for (const payload of valid) {
      const body = await expectOk<{ created: boolean }>(
        await client.post('/feeding-records', payload),
      );
      expect(body.data.created).toBe(true);
    }

    const invalid: AnyRecord[] = [
      formulaBody(baby.id, { amountValue: undefined }),
      formulaBody(baby.id, { amountValue: 0 }),
      formulaBody(baby.id, { amountValue: 500.01 }),
      formulaBody(baby.id, { amountUnit: 'G' }),
      formulaBody(baby.id, { breastSide: 'LEFT' }),
      formulaBody(baby.id, { durationSec: 21601 }),
    ];
    for (const payload of invalid) {
      await expectError(
        await client.post('/feeding-records', payload),
        400,
        'VALIDATION_ERROR',
      );
    }

    const list = await expectOk<Page<FeedingRecord>>(
      await client.get(`/feeding-records?babyId=${baby.id}&date=2026-10-20`),
    );
    expect(list.data.total).toBe(3);
  });

  test('FEED-08 混合校验矩阵', async ({ request }) => {
    const { client, baby } = await setupBaby(request);
    const base = (overrides: AnyRecord) =>
      breastBody(baby.id, {
        feedType: 'MIXED',
        breastSide: 'BOTH',
        amountValue: 90,
        amountUnit: 'ML',
        durationSec: 480,
        ...overrides,
      });

    for (const overrides of [
      { breastSide: undefined },
      { amountValue: undefined },
      { durationSec: undefined },
      { amountUnit: 'G' },
      { durationSec: 0 },
    ]) {
      await expectError(
        await client.post('/feeding-records', base(overrides)),
        400,
        'VALIDATION_ERROR',
      );
    }

    const ok = await expectOk<{ created: boolean }>(
      await client.post('/feeding-records', base({})),
    );
    expect(ok.data.created).toBe(true);
  });

  test('FEED-09 辅食校验矩阵', async ({ request }) => {
    const { client, baby } = await setupBaby(request);

    const withoutAmount = await expectOk<{ created: boolean }>(
      await client.post(
        '/feeding-records',
        solidBody(baby.id, { amountValue: undefined, amountUnit: undefined }),
      ),
    );
    expect(withoutAmount.data.created).toBe(true);

    const boundaries = [
      solidBody(baby.id, { amountValue: 30, amountUnit: 'G' }),
      solidBody(baby.id, { amountValue: 2000, amountUnit: 'G' }),
    ];
    for (const payload of boundaries) {
      const body = await expectOk<{ created: boolean }>(
        await client.post('/feeding-records', payload),
      );
      expect(body.data.created).toBe(true);
    }

    for (const payload of [
      solidBody(baby.id, { amountValue: 0 }),
      solidBody(baby.id, { amountValue: 2000.01 }),
      solidBody(baby.id, { amountUnit: 'ML' }),
      solidBody(baby.id, { breastSide: 'LEFT' }),
    ]) {
      await expectError(
        await client.post('/feeding-records', payload),
        400,
        'VALIDATION_ERROR',
      );
    }
  });

  test('FEED-10 时间格式：必须带偏移', async ({ request }) => {
    const { client, baby } = await setupBaby(request);

    await expectError(
      await client.post(
        '/feeding-records',
        formulaBody(baby.id, { startedAt: '2026-10-20T08:00:00' }),
      ),
      400,
      'VALIDATION_ERROR',
    );

    const offset = await expectOk<{ record: FeedingRecord }>(
      await client.post(
        '/feeding-records',
        formulaBody(baby.id, { startedAt: '2026-10-20T08:00:00+08:00' }),
      ),
    );
    expect(offset.data.record.tzOffsetMinutes).toBe(480);

    const utc = await expectOk<{ record: FeedingRecord }>(
      await client.post(
        '/feeding-records',
        formulaBody(baby.id, { startedAt: '2026-10-20T00:00:00Z' }),
      ),
    );
    expect(utc.data.record.tzOffsetMinutes).toBe(0);
    expect(utc.data.record.recordDate).toBe('2026-10-20');
  });

  test('FEED-11 startedAt 不得晚于服务端当前时间 +5 分钟', async ({ request }) => {
    const { client, baby } = await setupBaby(request);
    const serverTime = (await expectOk<unknown>(await client.get('/babies'))).serverTime;

    const shifted = (minutes: number): string =>
      new Date(Date.parse(serverTime) + minutes * 60_000)
        .toISOString()
        .replace(/\.\d{3}Z$/, '+00:00');

    const near = await expectOk<{ created: boolean }>(
      await client.post(
        '/feeding-records',
        formulaBody(baby.id, { startedAt: shifted(2) }),
      ),
    );
    expect(near.data.created).toBe(true);

    const far = await client.post(
      '/feeding-records',
      formulaBody(baby.id, { startedAt: shifted(10) }),
    );
    const body = await expectError(far, 400, 'VALIDATION_ERROR');
    expect(
      (body.data as { fieldErrors: Array<{ field: string }> }).fieldErrors.some(
        (item) => item.field === 'startedAt',
      ),
    ).toBe(true);
  });

  test('FEED-12 startedAt 不得早于宝宝出生日期（本地日期）', async ({ request }) => {
    const { client, baby } = await setupBaby(request);

    const ok = await expectOk<{ created: boolean }>(
      await client.post(
        '/feeding-records',
        formulaBody(baby.id, { startedAt: '2026-03-01T00:30:00+08:00' }),
      ),
    );
    expect(ok.data.created).toBe(true);

    const tooEarly = await client.post(
      '/feeding-records',
      formulaBody(baby.id, { startedAt: '2026-02-28T23:30:00+08:00' }),
    );
    const body = await expectError(tooEarly, 400, 'VALIDATION_ERROR');
    expect(
      (body.data as { fieldErrors: Array<{ field: string }> }).fieldErrors.some(
        (item) => item.field === 'startedAt',
      ),
    ).toBe(true);
  });

  test('FEED-13 endedAt 校验', async ({ request }) => {
    const { client, baby } = await setupBaby(request);

    for (const endedAt of [
      '2026-10-20T07:59:59+08:00',
      '2026-10-20T14:00:01+08:00',
    ]) {
      await expectError(
        await client.post(
          '/feeding-records',
          breastBody(baby.id, {
            startedAt: '2026-10-20T08:00:00+08:00',
            endedAt,
          }),
        ),
        400,
        'VALIDATION_ERROR',
      );
    }

    const sixHours = await expectOk<{ created: boolean }>(
      await client.post(
        '/feeding-records',
        breastBody(baby.id, {
          startedAt: '2026-10-20T08:00:00+08:00',
          endedAt: '2026-10-20T14:00:00+08:00',
        }),
      ),
    );
    expect(sixHours.data.created).toBe(true);

    const noEnd = await expectOk<{ record: FeedingRecord }>(
      await client.post(
        '/feeding-records',
        breastBody(baby.id, {
          startedAt: '2026-10-20T08:00:00+08:00',
          endedAt: undefined,
          durationSec: 900,
        }),
      ),
    );
    expect(noEnd.data.record.endedAt).toBeNull();
  });

  test('FEED-14 备注与标签校验', async ({ request }) => {
    const { client, baby } = await setupBaby(request);

    const longNote = await expectOk<{ created: boolean }>(
      await client.post(
        '/feeding-records',
        breastBody(baby.id, { note: '备'.repeat(200) }),
      ),
    );
    expect(longNote.data.created).toBe(true);

    await expectError(
      await client.post(
        '/feeding-records',
        breastBody(baby.id, { note: '备'.repeat(201) }),
      ),
      400,
      'VALIDATION_ERROR',
    );

    const deduped = await expectOk<{ record: FeedingRecord }>(
      await client.post(
        '/feeding-records',
        breastBody(baby.id, { tags: ['SPIT_UP', 'SPIT_UP'] }),
      ),
    );
    expect(deduped.data.record.tags).toEqual(['SPIT_UP']);

    // V1.0 标签枚举固定 5 个（SPIT_UP/REFUSED/SLEEPY/HICCUP/OTHER）：
    // 5 个唯一合法值必须 200；“第 6 个不同值”只能是未知 code（下一步断言 400）。
    const maxTags = await expectOk<{ record: FeedingRecord }>(
      await client.post(
        '/feeding-records',
        breastBody(baby.id, {
          tags: ['SPIT_UP', 'REFUSED', 'SLEEPY', 'HICCUP', 'OTHER'],
        }),
      ),
    );
    expect(maxTags.data.record.tags).toEqual([
      'SPIT_UP',
      'REFUSED',
      'SLEEPY',
      'HICCUP',
      'OTHER',
    ]);

    await expectError(
      await client.post('/feeding-records', breastBody(baby.id, { tags: ['UNKNOWN'] })),
      400,
      'VALIDATION_ERROR',
    );

    const ordered = await expectOk<{ record: FeedingRecord }>(
      await client.post(
        '/feeding-records',
        breastBody(baby.id, { tags: ['SLEEPY', 'SPIT_UP', 'SLEEPY'] }),
      ),
    );
    expect(ordered.data.record.tags).toEqual(['SPIT_UP', 'SLEEPY']);
  });

  test('FEED-15 babyId 不存在或不属于当前设备', async ({ request }) => {
    const d1 = await setupBaby(request);
    const d2 = await setupBaby(request);

    await expectError(
      await d1.client.post('/feeding-records', formulaBody(uuid())),
      404,
      'NOT_FOUND',
    );
    await expectError(
      await d1.client.post('/feeding-records', formulaBody(d2.baby.id)),
      404,
      'NOT_FOUND',
    );

    const list = await expectOk<Page<FeedingRecord>>(
      await d1.client.get(`/feeding-records?babyId=${d1.baby.id}&date=2026-10-20`),
    );
    expect(list.data.total).toBe(0);
  });

  test('FEED-16 已删除记录：在线读取/修改 404、删除幂等', async ({ request }) => {
    const { client, baby } = await setupBaby(request);
    const record = await createFeeding(client, baby.id);

    await expectOk(await client.delete(`/feeding-records/${record.id}?baseRevision=1`));

    const missing = await client.get(`/feeding-records/${record.id}`);
    const missingBody = await expectError(missing, 404, 'NOT_FOUND');
    const random = await client.get(`/feeding-records/${uuid()}`);
    const randomBody = await expectError(random, 404, 'NOT_FOUND');
    expect(missingBody.message).toBe(randomBody.message);
    expect(missingBody.data).toEqual(randomBody.data);

    await expectError(
      await client.patch(`/feeding-records/${record.id}`, {
        baseRevision: 2,
        note: '不应生效',
      }),
      404,
      'NOT_FOUND',
    );

    const again = await expectOk<{
      alreadyDeleted: boolean;
      deletedAt: string;
      revision: number;
    }>(await client.delete(`/feeding-records/${record.id}?baseRevision=2`));
    expect(again.data.alreadyDeleted).toBe(true);
    expect(again.data.revision).toBe(2);
  });

  test('FEED-17 按本地日期回溯', async ({ request }) => {
    const { client, baby } = await setupBaby(request);
    for (let index = 0; index < 8; index += 1) {
      await createFeeding(client, baby.id, {
        startedAt: `2026-10-20T${String(8 + index).padStart(2, '0')}:00:00+08:00`,
      });
    }
    await createFeeding(client, baby.id, { startedAt: at('2026-10-19', '09:00:00') });
    await createFeeding(client, baby.id, { startedAt: at('2026-10-21', '09:00:00') });

    const body = await expectOk<Page<FeedingRecord>>(
      await client.get(`/feeding-records?babyId=${baby.id}&date=2026-10-20&size=100`),
    );
    expect(body.data.total).toBe(8);
    expect(body.data.items).toHaveLength(8);
    expect(body.data.items.every((item) => item.recordDate === '2026-10-20')).toBe(true);
    expect(body.data.items[0].startedAt).toBe('2026-10-20T15:00:00+08:00');
    expect(body.data.items[7].startedAt).toBe('2026-10-20T08:00:00+08:00');
  });

  test('FEED-18 from/to 闭区间与跨度上限', async ({ request }) => {
    const { client, baby } = await setupBaby(request);
    await createFeeding(client, baby.id, { startedAt: at('2026-04-01', '08:00:00') });
    await createFeeding(client, baby.id, { startedAt: at('2026-06-30', '08:00:00') });

    const within = await expectOk<Page<FeedingRecord>>(
      await client.get(
        `/feeding-records?babyId=${baby.id}&from=2026-04-01&to=2026-06-30`,
      ),
    );
    expect(within.data.total).toBe(2);
    expect(
      within.data.items.map((item) => item.recordDate).sort(),
    ).toEqual(['2026-04-01', '2026-06-30']);

    await expectOk(
      await client.get(
        `/feeding-records?babyId=${baby.id}&from=2026-03-31&to=2026-06-30`,
      ),
    );

    await expectError(
      await client.get(
        `/feeding-records?babyId=${baby.id}&from=2026-03-30&to=2026-06-30`,
      ),
      400,
      'VALIDATION_ERROR',
    );
  });

  test('FEED-19 日期参数互斥、类型过滤与分页', async ({ request }) => {
    const { client, baby } = await setupBaby(request);
    await createFeeding(client, baby.id, {
      feedType: 'BREAST',
      breastSide: 'LEFT',
      amountValue: null,
      amountUnit: null,
      durationSec: 600,
    });
    await createFeeding(client, baby.id);

    await expectError(
      await client.get(
        `/feeding-records?babyId=${baby.id}&date=2026-10-20&from=2026-10-01&to=2026-10-31`,
      ),
      400,
      'VALIDATION_ERROR',
    );
    await expectError(
      await client.get(`/feeding-records?babyId=${baby.id}`),
      400,
      'VALIDATION_ERROR',
    );

    const filtered = await expectOk<Page<FeedingRecord>>(
      await client.get(
        `/feeding-records?babyId=${baby.id}&date=2026-10-20&feedType=BREAST`,
      ),
    );
    expect(filtered.data.items.length).toBeGreaterThan(0);
    expect(filtered.data.items.every((item) => item.feedType === 'BREAST')).toBe(true);

    for (const query of ['feedType=UNKNOWN', 'size=101', 'size=0', 'page=0']) {
      await expectError(
        await client.get(`/feeding-records?babyId=${baby.id}&date=2026-10-20&${query}`),
        400,
        'VALIDATION_ERROR',
      );
    }
  });

  test('FEED-20 PATCH 部分更新与合并后重校验', async ({ request }) => {
    const { client, baby } = await setupBaby(request);
    const record = await createFeeding(client, baby.id, {
      feedType: 'BREAST',
      breastSide: 'LEFT',
      amountValue: null,
      amountUnit: null,
      durationSec: 900,
      note: '原始备注',
    });

    const patched = await expectOk<FeedingRecord>(
      await client.patch(`/feeding-records/${record.id}`, {
        baseRevision: 1,
        durationSec: 960,
        note: '已补喂 30ml',
      }),
    );
    expect(patched.data.durationSec).toBe(960);
    expect(patched.data.note).toBe('已补喂 30ml');
    expect(patched.data.breastSide).toBe('LEFT');
    expect(patched.data.startedAt).toBe(record.startedAt);
    expect(patched.data.revision).toBe(2);

    await expectError(
      await client.patch(`/feeding-records/${record.id}`, {
        baseRevision: 2,
        amountValue: 30,
        amountUnit: 'ML',
      }),
      400,
      'VALIDATION_ERROR',
    );

    for (const babyId of [uuid(), baby.id, null]) {
      await expectError(
        await client.patch(`/feeding-records/${record.id}`, { baseRevision: 2, babyId }),
        400,
        'VALIDATION_ERROR',
      );
    }

    const fetched = await expectOk<FeedingRecord>(
      await client.get(`/feeding-records/${record.id}`),
    );
    expect(fetched.data.revision).toBe(2);
    expect(fetched.data.babyId).toBe(baby.id);
  });

  test('FEED-21 PATCH revision 冲突', async ({ request }) => {
    const { client, baby } = await setupBaby(request);
    const record = await createFeeding(client, baby.id);

    await expectOk(
      await client.patch(`/feeding-records/${record.id}`, {
        baseRevision: 1,
        amountValue: 150,
      }),
    );

    const conflict = await client.patch(`/feeding-records/${record.id}`, {
      baseRevision: 1,
      amountValue: 200,
    });
    const body = await expectError(conflict, 409, 'CONFLICT');
    const current = (body.data as { current: FeedingRecord }).current;
    expect(current.revision).toBe(2);
    expect(current.amountValue).toBe(150);
  });

  test('FEED-22 删除记录：软删除、幂等、冲突', async ({ request }) => {
    const { client, baby } = await setupBaby(request);
    const record = await createFeeding(client, baby.id);
    const other = await createFeeding(client, baby.id, {
      startedAt: at('2026-10-20', '11:00:00'),
    });

    const first = await expectOk<{
      revision: number;
      deletedAt: string;
      alreadyDeleted: boolean;
    }>(await client.delete(`/feeding-records/${record.id}?baseRevision=1`));
    expect(first.data.revision).toBe(2);
    expectUtcMillis(first.data.deletedAt);
    expect(first.data.alreadyDeleted).toBe(false);

    const second = await expectOk<{
      revision: number;
      deletedAt: string;
      alreadyDeleted: boolean;
    }>(await client.delete(`/feeding-records/${record.id}?baseRevision=1`));
    expect(second.data.alreadyDeleted).toBe(true);
    expect(second.data.deletedAt).toBe(first.data.deletedAt);
    expect(second.data.revision).toBe(2);

    await expectError(
      await client.delete(`/feeding-records/${other.id}?baseRevision=99`),
      409,
      'CONFLICT',
    );

    const list = await expectOk<Page<FeedingRecord>>(
      await client.get(`/feeding-records?babyId=${baby.id}&date=2026-10-20`),
    );
    expect(list.data.items.map((item) => item.id)).not.toContain(record.id);
    await expectError(
      await client.get(`/feeding-records/${record.id}`),
      404,
      'NOT_FOUND',
    );
  });

  test('FEED-23 数值精度：amountValue 最多 1 位小数', async ({ request }) => {
    const { client, baby } = await setupBaby(request);

    const oneDecimal = await expectOk<{ record: FeedingRecord }>(
      await client.post('/feeding-records', formulaBody(baby.id, { amountValue: 120.5 })),
    );
    expect(oneDecimal.data.record.amountValue).toBe(120.5);

    await expectError(
      await client.post('/feeding-records', formulaBody(baby.id, { amountValue: 120.55 })),
      400,
      'VALIDATION_ERROR',
    );
    await expectError(
      await client.post('/feeding-records', formulaBody(baby.id, { amountValue: '120' })),
      400,
      'VALIDATION_ERROR',
    );
  });

  test('FEED-24 非法 feedType', async ({ request }) => {
    const { client, baby } = await setupBaby(request);

    for (const feedType of ['breast', 'WATER', null, undefined]) {
      const response = await client.post(
        '/feeding-records',
        formulaBody(baby.id, { feedType }),
      );
      const body = await expectError(response, 400, 'VALIDATION_ERROR');
      expect(
        (body.data as { fieldErrors: Array<{ field: string }> }).fieldErrors.some(
          (item) => item.field === 'feedType',
        ),
      ).toBe(true);
    }
  });
});
