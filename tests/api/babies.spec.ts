import { expect, test } from '@playwright/test';

import { expectError, expectOk } from './helpers/api-client';
import { queryOne } from './helpers/db';
import { addDays, addYears, todayUtc } from './helpers/env';
import { uuid } from './helpers/fixtures';
import {
  createBaby,
  createFeeding,
  expectSameNotFound,
  expectUtcMillis,
  resetApiState,
  setupBaby,
  setupDevice,
  type Baby,
  type CreateBabyData,
} from './helpers/scenario';

const B1_ID = 'b1a2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
const B1_BODY = {
  id: B1_ID,
  name: '小满',
  gender: 'FEMALE' as const,
  birthDate: '2026-03-01',
};

/**
 * 契约：docs/architecture/v1.0-baby-feeding.md §4.5、§4.3
 * 用例：docs/tests/v1.0.md §7（BABY-01..BABY-17）
 * 状态：TE-02 可执行断言。
 */
test.describe('宝宝档案（BABY）', () => {
  test.beforeEach(async () => {
    await resetApiState();
  });

  test('BABY-01 创建第一个宝宝自动成为默认', async ({ request }) => {
    const { client } = await setupDevice(request);

    const response = await client.post('/babies', B1_BODY);
    const body = await expectOk<CreateBabyData>(response);
    const baby = body.data.baby;

    expect(body.data.created).toBe(true);
    expect(baby.id).toBe(B1_ID);
    expect(baby.name).toBe('小满');
    expect(baby.gender).toBe('FEMALE');
    expect(baby.birthDate).toBe('2026-03-01');
    expect(baby.revision).toBe(1);
    expect(baby.isDefault).toBe(true);
    expect(baby.deletedAt).toBeNull();
    expectUtcMillis(baby.createdAt);
    expectUtcMillis(baby.updatedAt);
    expect(Math.abs(Date.parse(baby.updatedAt) - Date.parse(baby.createdAt))).toBeLessThanOrEqual(1);

    const list = await expectOk<Baby[]>(await client.get('/babies'));
    expect(list.data).toHaveLength(1);
    expect(list.data[0]).toEqual(baby);
  });

  test('BABY-02 名称去空格与 Unicode 长度边界', async ({ request }) => {
    const { client } = await setupDevice(request);

    const trimmed = await expectOk<CreateBabyData>(
      await client.post('/babies', { name: '  小满  ', birthDate: '2026-03-01' }),
    );
    expect(trimmed.data.baby.name).toBe('小满');

    const twenty = '满'.repeat(20);
    const maxName = await expectOk<CreateBabyData>(
      await client.post('/babies', { name: twenty, birthDate: '2026-03-01' }),
    );
    expect(maxName.data.baby.name).toHaveLength(20);

    const tooLong = await client.post('/babies', {
      name: '满'.repeat(21),
      birthDate: '2026-03-01',
    });
    const tooLongBody = await expectError(tooLong, 400, 'VALIDATION_ERROR');
    expect(
      (tooLongBody.data as { fieldErrors: Array<{ field: string }> }).fieldErrors.some(
        (item) => item.field === 'name',
      ),
    ).toBe(true);

    await expectError(
      await client.post('/babies', { name: '   ', birthDate: '2026-03-01' }),
      400,
      'VALIDATION_ERROR',
    );
    await expectError(
      await client.post('/babies', { name: '小\u0007满', birthDate: '2026-03-01' }),
      400,
      'VALIDATION_ERROR',
    );
  });

  test('BABY-03 相同 id 重复创建幂等', async ({ request }) => {
    const { client } = await setupDevice(request);
    await createBaby(client, B1_BODY);

    const second = await expectOk<CreateBabyData>(
      await client.post('/babies', { ...B1_BODY, name: '小满满' }),
    );
    expect(second.data.created).toBe(false);
    expect(second.data.baby.name).toBe('小满');
    expect(second.data.baby.revision).toBe(1);

    const list = await expectOk<Baby[]>(await client.get('/babies'));
    expect(list.data).toHaveLength(1);
  });

  test('BABY-04 性别默认值与非法枚举', async ({ request }) => {
    const { client } = await setupDevice(request);

    const noGender = await expectOk<CreateBabyData>(
      await client.post('/babies', { name: '默认性别', birthDate: '2026-03-01' }),
    );
    expect(noGender.data.baby.gender).toBe('UNKNOWN');

    const male = await expectOk<CreateBabyData>(
      await client.post('/babies', {
        name: '男孩',
        gender: 'MALE',
        birthDate: '2026-03-01',
      }),
    );
    expect(male.data.baby.gender).toBe('MALE');

    await expectError(
      await client.post('/babies', {
        name: '非法性别',
        gender: 'BOY',
        birthDate: '2026-03-01',
      }),
      400,
      'VALIDATION_ERROR',
    );
  });

  test('BABY-05 出生日期边界（UTC + ±1 天容差）', async ({ request }) => {
    const { client } = await setupDevice(request);
    const today = todayUtc();

    const validDates = [
      today,
      addDays(today, 1),
      addYears(today, -3),
      addDays(addYears(today, -3), -1),
    ];
    for (const birthDate of validDates) {
      const created = await expectOk<CreateBabyData>(
        await client.post('/babies', { name: '边界宝宝', birthDate }),
      );
      expect(created.data.created).toBe(true);
      expect(created.data.baby.birthDate).toBe(birthDate);
    }

    const invalidDates = [addDays(today, 2), addDays(addYears(today, -3), -2), '2026/03/01'];
    for (const birthDate of invalidDates) {
      const response = await client.post('/babies', { name: '越界宝宝', birthDate });
      const body = await expectError(response, 400, 'VALIDATION_ERROR');
      expect(
        (body.data as { fieldErrors: Array<{ field: string }> }).fieldErrors.some(
          (item) => item.field === 'birthDate',
        ),
      ).toBe(true);
    }
  });

  test('BABY-06 最多 5 个宝宝', async ({ request }) => {
    const { client } = await setupDevice(request);

    const babies: Baby[] = [];
    for (let index = 0; index < 5; index += 1) {
      babies.push(await createBaby(client, { name: `宝宝${index + 1}` }));
    }

    const sixth = await client.post('/babies', {
      name: '第六个',
      birthDate: '2026-03-01',
    });
    await expectError(sixth, 400, 'BABY_LIMIT_EXCEEDED');

    const beforeDelete = await expectOk<Baby[]>(await client.get('/babies'));
    expect(beforeDelete.data).toHaveLength(5);

    const deleted = await expectOk<{ alreadyDeleted: boolean }>(
      await client.delete(`/babies/${babies[4].id}?baseRevision=1`),
    );
    expect(deleted.data.alreadyDeleted).toBe(false);

    const seventh = await expectOk<CreateBabyData>(
      await client.post('/babies', { name: '替补宝宝', birthDate: '2026-03-01' }),
    );
    expect(seventh.data.created).toBe(true);

    const after = await expectOk<Baby[]>(await client.get('/babies'));
    expect(after.data).toHaveLength(5);
  });

  test('BABY-07 默认宝宝切换是原子的', async ({ request }) => {
    const { client } = await setupDevice(request);

    const b1 = await createBaby(client, { name: 'B1' });
    const b2 = await createBaby(client, { name: 'B2', isDefault: false });
    expect(b1.isDefault).toBe(true);
    expect(b2.isDefault).toBe(false);

    const b3 = await createBaby(client, { name: 'B3', isDefault: true });
    let list = await expectOk<Baby[]>(await client.get('/babies'));
    expect(list.data.filter((item) => item.isDefault).map((item) => item.id)).toEqual([b3.id]);
    expect(list.data[0].id).toBe(b3.id);

    const patched = await expectOk<Baby>(
      await client.patch(`/babies/${b2.id}`, { baseRevision: 1, isDefault: true }),
    );
    expect(patched.data.revision).toBe(2);
    expect(patched.data.isDefault).toBe(true);

    list = await expectOk<Baby[]>(await client.get('/babies'));
    expect(list.data.filter((item) => item.isDefault).map((item) => item.id)).toEqual([b2.id]);
    expect(list.data.map((item) => item.id)).toEqual([b2.id, b1.id, b3.id]);
  });

  test('BABY-08 列表排序、排除已删除、设备隔离', async ({ request }) => {
    const d1 = await setupDevice(request);
    const b1 = await createBaby(d1.client, { name: 'B1' });
    const b2 = await createBaby(d1.client, { name: 'B2', isDefault: false });
    const b3 = await createBaby(d1.client, { name: 'B3', isDefault: false });
    await expectOk(await d1.client.delete(`/babies/${b3.id}?baseRevision=1`));

    const d2 = await setupDevice(request);
    const b4 = await createBaby(d2.client, { name: 'B4' });

    const list1 = await expectOk<Baby[]>(await d1.client.get('/babies'));
    expect(list1.data.map((item) => item.id)).toEqual([b1.id, b2.id]);
    expect(list1.data.some((item) => item.id === b3.id || item.id === b4.id)).toBe(false);

    const list2 = await expectOk<Baby[]>(await d2.client.get('/babies'));
    expect(list2.data.map((item) => item.id)).toEqual([b4.id]);

    expect(Object.keys(list1.data[0]).sort()).toEqual(
      [
        'id',
        'name',
        'gender',
        'birthDate',
        'isDefault',
        'revision',
        'createdAt',
        'updatedAt',
        'deletedAt',
      ].sort(),
    );
  });

  test('BABY-09 读取单个宝宝与跨设备 404', async ({ request }) => {
    const d1 = await setupDevice(request);
    const b1 = await createBaby(d1.client, B1_BODY);
    const d2 = await setupDevice(request);

    const own = await expectOk<Baby>(await d1.client.get(`/babies/${b1.id}`));
    expect(own.data).toEqual(b1);

    const crossDevice = await d2.client.get(`/babies/${b1.id}`);
    const crossBody = await expectError(crossDevice, 404, 'NOT_FOUND');

    const random = await d1.client.get(`/babies/${uuid()}`);
    const randomBody = await expectError(random, 404, 'NOT_FOUND');

    expectSameNotFound(crossBody, randomBody);
  });

  test('BABY-10 PATCH 部分更新与 revision 递增', async ({ request }) => {
    const { client, baby } = await setupBaby(request, B1_BODY);

    const patched = await expectOk<Baby>(
      await client.patch(`/babies/${baby.id}`, { baseRevision: 1, name: '小满满' }),
    );
    expect(patched.data.name).toBe('小满满');
    expect(patched.data.gender).toBe('FEMALE');
    expect(patched.data.birthDate).toBe('2026-03-01');
    expect(patched.data.isDefault).toBe(true);
    expect(patched.data.revision).toBe(2);
    expect(Date.parse(patched.data.updatedAt)).toBeGreaterThanOrEqual(
      Date.parse(patched.data.createdAt),
    );

    const fetched = await expectOk<Baby>(await client.get(`/babies/${baby.id}`));
    expect(fetched.data.name).toBe('小满满');
    expect(fetched.data.revision).toBe(2);

    await expectError(
      await client.patch(`/babies/${baby.id}`, { baseRevision: 2, gender: null }),
      400,
      'VALIDATION_ERROR',
    );
  });

  test('BABY-11 PATCH baseRevision 冲突', async ({ request }) => {
    const { client, baby } = await setupBaby(request, B1_BODY);

    await expectOk<Baby>(
      await client.patch(`/babies/${baby.id}`, { baseRevision: 1, name: '小满满' }),
    );

    const conflict = await client.patch(`/babies/${baby.id}`, {
      baseRevision: 1,
      name: '覆盖尝试',
    });
    const body = await expectError(conflict, 409, 'CONFLICT');
    const current = (body.data as { current: Baby }).current;
    expect(current.revision).toBe(2);
    expect(current.name).toBe('小满满');

    const fetched = await expectOk<Baby>(await client.get(`/babies/${baby.id}`));
    expect(fetched.data.name).toBe('小满满');
    expect(fetched.data.revision).toBe(2);
  });

  test('BABY-12 试图取消唯一默认宝宝', async ({ request }) => {
    const { client, baby } = await setupBaby(request, B1_BODY);

    await expectError(
      await client.patch(`/babies/${baby.id}`, { baseRevision: 1, isDefault: false }),
      400,
      'DEFAULT_BABY_REQUIRED',
    );

    const fetched = await expectOk<Baby>(await client.get(`/babies/${baby.id}`));
    expect(fetched.data.isDefault).toBe(true);
    expect(fetched.data.revision).toBe(1);
  });

  test('BABY-13 缺少 baseRevision 或类型非法', async ({ request }) => {
    const { client, baby } = await setupBaby(request, B1_BODY);

    const missing = await client.patch(`/babies/${baby.id}`, { name: '无版本' });
    const missingBody = await expectError(missing, 400, 'VALIDATION_ERROR');
    expect(
      (missingBody.data as { fieldErrors: Array<{ field: string }> }).fieldErrors.some(
        (item) => item.field === 'baseRevision',
      ),
    ).toBe(true);

    await expectError(
      await client.patch(`/babies/${baby.id}`, { baseRevision: '1', name: '字符串版本' }),
      400,
      'VALIDATION_ERROR',
    );
    await expectError(
      await client.patch(`/babies/${baby.id}`, { baseRevision: 0, name: '零版本' }),
      409,
      'CONFLICT',
    );
  });

  test('BABY-14 删除宝宝级联软删除', async ({ request }) => {
    const { client, baby } = await setupBaby(request, B1_BODY);
    const feeding1 = await createFeeding(client, baby.id, {
      startedAt: '2026-10-20T08:00:00+08:00',
    });
    const feeding2 = await createFeeding(client, baby.id, {
      startedAt: '2026-10-20T09:00:00+08:00',
    });
    const growth = await expectOk<{ record: { id: string; revision: number } }>(
      await client.post('/growth-records', {
        id: uuid(),
        babyId: baby.id,
        measuredOn: '2026-10-20',
        weightKg: 8.12,
      }),
    );

    const response = await client.delete(`/babies/${baby.id}?baseRevision=1`);
    const body = await expectOk<{
      id: string;
      revision: number;
      deletedAt: string;
      cascadedFeedingRecords: number;
      cascadedGrowthRecords: number;
      alreadyDeleted: boolean;
    }>(response);

    expect(body.data.id).toBe(baby.id);
    expect(body.data.revision).toBe(2);
    expectUtcMillis(body.data.deletedAt);
    expect(body.data.cascadedFeedingRecords).toBe(2);
    expect(body.data.cascadedGrowthRecords).toBe(1);
    expect(body.data.alreadyDeleted).toBe(false);

    await expectError(
      await client.get(`/feeding-records/${feeding1.id}`),
      404,
      'NOT_FOUND',
    );
    await expectError(
      await client.get(`/feeding-records/${feeding2.id}`),
      404,
      'NOT_FOUND',
    );
    await expectError(
      await client.get(`/growth-records/${growth.data.record.id}`),
      404,
      'NOT_FOUND',
    );

    const list = await expectOk<Baby[]>(await client.get('/babies'));
    expect(list.data.some((item) => item.id === baby.id)).toBe(false);
    await expectError(await client.get(`/babies/${baby.id}`), 404, 'NOT_FOUND');
    await expectError(
      await client.patch(`/babies/${baby.id}`, { baseRevision: 2, name: '已删除' }),
      404,
      'NOT_FOUND',
    );

    const rows = queryOne(
      `SELECT deleted_at IS NOT NULL, revision FROM baby WHERE id = '${baby.id}'`,
    );
    expect(rows?.[0]).toBe('1');
    expect(rows?.[1]).toBe('2');
  });

  test('BABY-15 删除幂等与默认宝宝重新指派', async ({ request }) => {
    const { client } = await setupDevice(request);
    const b1 = await createBaby(client, B1_BODY);
    const b2 = await createBaby(client, { name: 'B2', isDefault: false });

    const first = await expectOk<{ alreadyDeleted: boolean; deletedAt: string }>(
      await client.delete(`/babies/${b1.id}?baseRevision=1`),
    );
    expect(first.data.alreadyDeleted).toBe(false);

    const listAfter = await expectOk<Baby[]>(await client.get('/babies'));
    expect(listAfter.data.map((item) => item.id)).toEqual([b2.id]);
    expect(listAfter.data[0].isDefault).toBe(true);

    const second = await expectOk<{ alreadyDeleted: boolean; deletedAt: string }>(
      await client.delete(`/babies/${b1.id}?baseRevision=2`),
    );
    expect(second.data.alreadyDeleted).toBe(true);
    expect(second.data.deletedAt).toBe(first.data.deletedAt);

    await expectError(
      await client.post('/babies', { ...B1_BODY, name: '复活尝试' }),
      404,
      'NOT_FOUND',
    );
    await expectError(
      await client.patch(`/babies/${b1.id}`, { baseRevision: 2, name: '复活尝试' }),
      404,
      'NOT_FOUND',
    );
  });

  test('BABY-16 跨设备修改/删除 404', async ({ request }) => {
    const d1 = await setupDevice(request);
    const b1 = await createBaby(d1.client, B1_BODY);
    const d2 = await setupDevice(request);

    await expectError(
      await d2.client.patch(`/babies/${b1.id}`, { baseRevision: 1, name: '越权修改' }),
      404,
      'NOT_FOUND',
    );
    await expectError(
      await d2.client.delete(`/babies/${b1.id}?baseRevision=1`),
      404,
      'NOT_FOUND',
    );

    const fetched = await expectOk<Baby>(await d1.client.get(`/babies/${b1.id}`));
    expect(fetched.data.name).toBe('小满');
    expect(fetched.data.revision).toBe(1);
    expect(fetched.data.deletedAt).toBeNull();
  });

  test('BABY-17 宝宝 id 由客户端生成且不回写替换', async ({ request }) => {
    const { client } = await setupDevice(request);
    const id = uuid();

    const created = await expectOk<CreateBabyData>(
      await client.post('/babies', { id, name: '小满', birthDate: '2026-03-01' }),
    );
    expect(created.data.baby.id).toBe(id);

    const fetched = await expectOk<Baby>(await client.get(`/babies/${id}`));
    expect(fetched.data.id).toBe(id);

    const row = queryOne(`SELECT id FROM baby WHERE id = '${id}'`);
    expect(row?.[0]).toBe(id);
  });
});
