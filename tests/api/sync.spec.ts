import { expect, test } from '@playwright/test';

import { expectError, expectOk, type ApiClient } from './helpers/api-client';
import { queryOne } from './helpers/db';
import { deviceHashHex } from './helpers/device-hash';
import { at, uuid } from './helpers/fixtures';
import {
  redisCompareAndDelete,
  redisExists,
  redisSetNxPx,
  redisTtl,
  syncBatchKeyOf,
  syncLockKeyOf,
} from './helpers/redis';
import {
  createBaby,
  createFeeding,
  resetApiState,
  setupBaby,
  setupDevice,
  type Baby,
  type FeedingRecord,
  type Page,
} from './helpers/scenario';

interface SyncResult {
  entityType: 'BABY' | 'FEEDING_RECORD' | 'GROWTH_RECORD';
  id: string;
  status: 'APPLIED' | 'DUPLICATE' | 'CONFLICT_SERVER_WINS' | 'REJECTED';
  revision?: number;
  record?: Record<string, unknown> | null;
  error?: { code: string; message: string; fieldErrors?: unknown };
}

interface SyncData {
  batchId: string;
  replayed: boolean;
  processedAt: string;
  results: SyncResult[];
  summary: {
    applied: number;
    duplicate: number;
    conflict: number;
    rejected: number;
  };
}

type Change = Record<string, unknown>;

function babyChange(id: string, baseRevision: number, overrides: Change = {}): Change {
  return {
    entityType: 'BABY',
    op: 'UPSERT',
    id,
    baseRevision,
    data: {
      name: '同步宝宝',
      gender: 'FEMALE',
      birthDate: '2026-03-01',
      isDefault: false,
      ...overrides,
    },
  };
}

function feedingChange(
  id: string,
  babyId: string,
  baseRevision: number,
  overrides: Change = {},
): Change {
  return {
    entityType: 'FEEDING_RECORD',
    op: 'UPSERT',
    id,
    baseRevision,
    data: {
      babyId,
      feedType: 'FORMULA',
      amountValue: 120,
      amountUnit: 'ML',
      startedAt: at('2026-10-20', '08:00:00'),
      ...overrides,
    },
  };
}

function deleteChange(
  entityType: 'BABY' | 'FEEDING_RECORD' | 'GROWTH_RECORD',
  id: string,
  baseRevision: number,
): Change {
  return { entityType, op: 'DELETE', id, baseRevision };
}

function batch(changes: Change[], batchId: string = uuid()) {
  return {
    batchId,
    clientTime: at('2026-10-26', '16:00:00'),
    changes,
  };
}

async function push(client: ApiClient, body: ReturnType<typeof batch>) {
  return client.post('/sync/push', body);
}

/**
 * 契约：docs/architecture/v1.0-baby-feeding.md §4.10、addendum Q-05..Q-08/Q-17/Q-22
 * 用例：docs/tests/v1.0.md §13（SYNC-01..SYNC-20）
 * 状态：TE-02 可执行断言。
 */
test.describe('离线批量同步（SYNC）', () => {
  test.beforeEach(async () => {
    await resetApiState();
  });

  test('SYNC-01 批量创建宝宝与喂养记录', async ({ request }) => {
    const { client } = await setupDevice(request);
    const babyId = uuid();
    const feedingId = uuid();
    const body = batch([
      babyChange(babyId, 0, { name: '同步宝宝', isDefault: true }),
      feedingChange(feedingId, babyId, 0),
    ]);

    const response = await expectOk<SyncData>(await push(client, body));
    expect(response.data.batchId).toBe(body.batchId);
    expect(response.data.replayed).toBe(false);
    expect(response.data.results.map((item) => item.entityType)).toEqual([
      'BABY',
      'FEEDING_RECORD',
    ]);
    expect(response.data.results.every((item) => item.status === 'APPLIED')).toBe(true);
    expect(response.data.results.map((item) => item.revision)).toEqual([1, 1]);
    expect(response.data.summary).toEqual({
      applied: 2,
      duplicate: 0,
      conflict: 0,
      rejected: 0,
    });

    const baby = await expectOk<Baby>(await client.get(`/babies/${babyId}`));
    expect(baby.data.revision).toBe(1);
    const feeding = await expectOk<FeedingRecord>(
      await client.get(`/feeding-records/${feedingId}`),
    );
    expect(feeding.data.revision).toBe(1);
    expect(feeding.data.amountValue).toBe(120);
  });

  test('SYNC-02 相同 batchId + 相同请求体回放', async ({ request }) => {
    const { client, baby } = await setupBaby(request);
    const feedingId = uuid();
    const body = batch([feedingChange(feedingId, baby.id, 0)]);

    const first = await expectOk<SyncData>(await push(client, body));
    const replay = await expectOk<SyncData>(await push(client, body));

    expect(replay.data.replayed).toBe(true);
    expect(replay.data.summary).toEqual(first.data.summary);
    expect(replay.data.results.map((item) => [item.status, item.revision])).toEqual(
      first.data.results.map((item) => [item.status, item.revision]),
    );

    const list = await expectOk<Page<FeedingRecord>>(
      await client.get(`/feeding-records?babyId=${baby.id}&date=2026-10-20`),
    );
    expect(list.data.total).toBe(1);
  });

  test('SYNC-03 相同 batchId + 不同请求体', async ({ request }) => {
    const { client, baby } = await setupBaby(request);
    const feedingId = uuid();
    const batchId = uuid();

    await expectOk<SyncData>(
      await push(client, batch([feedingChange(feedingId, baby.id, 0)], batchId)),
    );

    const changed = batch(
      [feedingChange(feedingId, baby.id, 0, { amountValue: 150 })],
      batchId,
    );
    await expectError(await push(client, changed), 409, 'CONFLICT');

    const record = await expectOk<FeedingRecord>(
      await client.get(`/feeding-records/${feedingId}`),
    );
    expect(record.data.amountValue).toBe(120);
  });

  test('SYNC-04 UPSERT baseRevision=0 且服务端已存在', async ({ request }) => {
    const { client, baby } = await setupBaby(request);
    const existing = await createFeeding(client, baby.id, { amountValue: 120 });

    const response = await expectOk<SyncData>(
      await push(
        client,
        batch([feedingChange(existing.id, baby.id, 0, { amountValue: 999 })]),
      ),
    );
    expect(response.data.results[0].status).toBe('DUPLICATE');
    expect(response.data.results[0].revision).toBe(1);
    expect(response.data.results[0].record?.amountValue).toBe(120);
    expect(response.data.summary.duplicate).toBe(1);
  });

  test('SYNC-05 UPSERT baseRevision 等于当前 revision', async ({ request }) => {
    const { client, baby } = await setupBaby(request);
    const existing = await createFeeding(client, baby.id, { amountValue: 120 });

    const response = await expectOk<SyncData>(
      await push(
        client,
        batch([feedingChange(existing.id, baby.id, 1, { amountValue: 150 })]),
      ),
    );
    expect(response.data.results[0].status).toBe('APPLIED');
    expect(response.data.results[0].revision).toBe(2);
    expect(response.data.summary.applied).toBe(1);

    const fetched = await expectOk<FeedingRecord>(
      await client.get(`/feeding-records/${existing.id}`),
    );
    expect(fetched.data.amountValue).toBe(150);
    expect(fetched.data.revision).toBe(2);
  });

  test('SYNC-06 UPSERT baseRevision 不匹配 → 服务端胜出', async ({ request }) => {
    const { client, baby } = await setupBaby(request);
    const existing = await createFeeding(client, baby.id, { amountValue: 120 });
    await expectOk(
      await push(
        client,
        batch([feedingChange(existing.id, baby.id, 1, { amountValue: 150 })]),
      ),
    );

    const response = await expectOk<SyncData>(
      await push(
        client,
        batch([feedingChange(existing.id, baby.id, 1, { amountValue: 999 })]),
      ),
    );
    expect(response.data.results[0].status).toBe('CONFLICT_SERVER_WINS');
    expect(response.data.results[0].revision).toBe(2);
    expect(response.data.results[0].record?.amountValue).toBe(150);
    expect(response.data.summary.conflict).toBe(1);

    const fetched = await expectOk<FeedingRecord>(
      await client.get(`/feeding-records/${existing.id}`),
    );
    expect(fetched.data.amountValue).toBe(150);
  });

  test('SYNC-07 DELETE 服务端不存在', async ({ request }) => {
    const { client } = await setupBaby(request);
    const missingId = uuid();

    const response = await expectOk<SyncData>(
      await push(client, batch([deleteChange('FEEDING_RECORD', missingId, 1)])),
    );
    expect(response.data.results[0].status).toBe('DUPLICATE');
    expect(response.data.summary.duplicate).toBe(1);

    const row = queryOne(`SELECT COUNT(*) FROM feeding_record WHERE id = '${missingId}'`);
    expect(Number(row?.[0])).toBe(0);
  });

  test('SYNC-08 DELETE baseRevision 匹配', async ({ request }) => {
    const { client, baby } = await setupBaby(request);
    const record = await createFeeding(client, baby.id);

    const response = await expectOk<SyncData>(
      await push(client, batch([deleteChange('FEEDING_RECORD', record.id, 1)])),
    );
    const result = response.data.results[0];
    expect(result.status).toBe('APPLIED');
    expect(result.revision).toBe(2);
    expect(result.record?.deletedAt).toBeTruthy();

    await expectError(
      await client.get(`/feeding-records/${record.id}`),
      404,
      'NOT_FOUND',
    );
    const list = await expectOk<Page<FeedingRecord>>(
      await client.get(`/feeding-records?babyId=${baby.id}&date=2026-10-20`),
    );
    expect(list.data.items.map((item) => item.id)).not.toContain(record.id);
  });

  test('SYNC-09 DELETE baseRevision 不匹配', async ({ request }) => {
    const { client, baby } = await setupBaby(request);
    const record = await createFeeding(client, baby.id);

    const response = await expectOk<SyncData>(
      await push(client, batch([deleteChange('FEEDING_RECORD', record.id, 99)])),
    );
    expect(response.data.results[0].status).toBe('CONFLICT_SERVER_WINS');
    expect(response.data.results[0].revision).toBe(1);

    const fetched = await expectOk<FeedingRecord>(
      await client.get(`/feeding-records/${record.id}`),
    );
    expect(fetched.data.deletedAt).toBeNull();
    expect(fetched.data.revision).toBe(1);
  });

  test('SYNC-10 引用不可见宝宝 → 单条 REJECTED，整批 200', async ({ request }) => {
    const { client } = await setupDevice(request);
    const secondDevice = await setupBaby(request);
    const babyId = uuid();
    const feedingId = uuid();

    const orderResponse = await expectOk<SyncData>(
      await push(
        client,
        batch([
          feedingChange(feedingId, babyId, 0),
          babyChange(babyId, 0, { name: '迟到宝宝' }),
        ]),
      ),
    );
    expect(orderResponse.data.results[0].status).toBe('REJECTED');
    expect(orderResponse.data.results[0].error?.code).toBe('NOT_FOUND');
    expect(Object.keys(orderResponse.data.results[0].error ?? {}).sort()).toEqual([
      'code',
      'message',
    ]);
    expect(orderResponse.data.results[1].status).toBe('APPLIED');
    expect(orderResponse.data.results[1].revision).toBe(1);
    expect(orderResponse.data.summary).toEqual({
      applied: 1,
      duplicate: 0,
      conflict: 0,
      rejected: 1,
    });

    const missingBaby = await expectOk<SyncData>(
      await push(client, batch([feedingChange(uuid(), uuid(), 0)])),
    );
    expect(missingBaby.data.results[0].status).toBe('REJECTED');

    const deletedBaby = await createBaby(client, { name: '待删除' });
    await expectOk(await client.delete(`/babies/${deletedBaby.id}?baseRevision=1`));
    const deletedRef = await expectOk<SyncData>(
      await push(client, batch([feedingChange(uuid(), deletedBaby.id, 0)])),
    );
    expect(deletedRef.data.results[0].status).toBe('REJECTED');

    const crossDevice = await expectOk<SyncData>(
      await push(client, batch([feedingChange(uuid(), secondDevice.baby.id, 0)])),
    );
    expect(crossDevice.data.results[0].status).toBe('REJECTED');

    const errors = [
      missingBaby.data.results[0].error,
      deletedRef.data.results[0].error,
      crossDevice.data.results[0].error,
    ];
    for (const error of errors) {
      expect(error?.code).toBe('NOT_FOUND');
      expect(error).toEqual(errors[0]);
    }

    const retry = await expectOk<SyncData>(
      await push(client, batch([feedingChange(feedingId, babyId, 0)])),
    );
    expect(retry.data.results[0].status).toBe('APPLIED');
    expect(retry.data.results[0].revision).toBe(1);
  });

  test('SYNC-11 单条校验失败不影响其他条', async ({ request }) => {
    const { client, baby } = await setupBaby(request);
    const newBabyId = uuid();
    const invalidId = uuid();
    const validId = uuid();

    const response = await expectOk<SyncData>(
      await push(
        client,
        batch([
          babyChange(newBabyId, 0),
          feedingChange(invalidId, baby.id, 0, { amountValue: undefined }),
          feedingChange(validId, baby.id, 0),
        ]),
      ),
    );
    expect(response.data.results.map((item) => item.status)).toEqual([
      'APPLIED',
      'REJECTED',
      'APPLIED',
    ]);
    expect(response.data.results[1].error?.code).toBe('VALIDATION_ERROR');
    expect(response.data.summary).toEqual({
      applied: 2,
      duplicate: 0,
      conflict: 0,
      rejected: 1,
    });

    await expectError(
      await client.get(`/feeding-records/${invalidId}`),
      404,
      'NOT_FOUND',
    );
    await expectOk(await client.get(`/feeding-records/${validId}`));
  });

  test('SYNC-12 同一批次重复 (entityType,id)', async ({ request }) => {
    const { client, baby } = await setupBaby(request);
    const id = uuid();

    await expectError(
      await push(
        client,
        batch([
          feedingChange(id, baby.id, 0),
          feedingChange(id, baby.id, 0, { amountValue: 150 }),
        ]),
      ),
      400,
      'VALIDATION_ERROR',
    );

    await expectError(
      await client.get(`/feeding-records/${id}`),
      404,
      'NOT_FOUND',
    );
  });

  test('SYNC-13 changes 数量与 batchId 校验', async ({ request }) => {
    const { client, baby } = await setupBaby(request);

    await expectError(await push(client, batch([])), 400, 'VALIDATION_ERROR');

    const fiftyOne = Array.from({ length: 51 }, () =>
      feedingChange(uuid(), baby.id, 0),
    );
    await expectError(await push(client, batch(fiftyOne)), 400, 'VALIDATION_ERROR');

    const fifty = Array.from({ length: 50 }, () => feedingChange(uuid(), baby.id, 0));
    const ok = await expectOk<SyncData>(await push(client, batch(fifty)));
    expect(ok.data.summary.applied).toBe(50);

    const noBatch = batch([feedingChange(uuid(), baby.id, 0)]);
    delete (noBatch as { batchId?: string }).batchId;
    await expectError(await push(client, noBatch as ReturnType<typeof batch>), 400, 'VALIDATION_ERROR');

    await expectError(
      await push(client, { ...batch([feedingChange(uuid(), baby.id, 0)]), batchId: 'not-uuid' }),
      400,
      'VALIDATION_ERROR',
    );
  });

  test('SYNC-14 跨设备 id 不得被修改', async ({ request }) => {
    const d1 = await setupDevice(request);
    const d2 = await setupBaby(request);
    const d2Feeding = await createFeeding(d2.client, d2.baby.id);

    const response = await expectOk<SyncData>(
      await push(
        d1.client,
        batch([
          babyChange(d2.baby.id, 0, { name: '越权改名' }),
          feedingChange(d2Feeding.id, d2.baby.id, 0, { amountValue: 999 }),
        ]),
      ),
    );
    expect(response.data.results.every((item) => item.status === 'REJECTED')).toBe(true);
    expect(
      response.data.results.every((item) => item.error?.code === 'NOT_FOUND'),
    ).toBe(true);

    const d2Baby = await expectOk<Baby>(await d2.client.get(`/babies/${d2.baby.id}`));
    expect(d2Baby.data.name).toBe('小满');
    expect(d2Baby.data.revision).toBe(1);
    const d2Record = await expectOk<FeedingRecord>(
      await d2.client.get(`/feeding-records/${d2Feeding.id}`),
    );
    expect(d2Record.data.amountValue).toBe(120);
    expect(d2Record.data.revision).toBe(1);

    const d1Babies = await expectOk<Baby[]>(await d1.client.get('/babies'));
    expect(d1Babies.data).toEqual([]);
  });

  test('SYNC-15 clientTime 不参与冲突裁决', async ({ request }) => {
    const { client, baby } = await setupBaby(request);
    const record = await createFeeding(client, baby.id, { amountValue: 120 });

    const batchA = {
      batchId: uuid(),
      clientTime: '2000-01-01T00:00:00+00:00',
      changes: [feedingChange(record.id, baby.id, 1, { amountValue: 150 })],
    };
    const applied = await expectOk<SyncData>(await push(client, batchA));
    expect(applied.data.results[0].status).toBe('APPLIED');
    expect(applied.data.results[0].revision).toBe(2);

    const batchB = {
      batchId: uuid(),
      clientTime: '2099-01-01T00:00:00+00:00',
      changes: [feedingChange(record.id, baby.id, 1, { amountValue: 999 })],
    };
    const conflict = await expectOk<SyncData>(await push(client, batchB));
    expect(conflict.data.results[0].status).toBe('CONFLICT_SERVER_WINS');
    expect(conflict.data.results[0].record?.amountValue).toBe(150);

    const fetched = await expectOk<FeedingRecord>(
      await client.get(`/feeding-records/${record.id}`),
    );
    expect(fetched.data.amountValue).toBe(150);
  });

  test('SYNC-16 同步批次锁（确定性预占）', async ({ request }) => {
    const { client, baby, deviceId } = await setupBaby(request);
    const hash = deviceHashHex(deviceId);
    const lockKey = syncLockKeyOf(hash);
    const lockToken = uuid();
    expect(redisSetNxPx(lockKey, lockToken, 15_000)).toBe(true);
    expect(redisTtl(lockKey)).toBeGreaterThan(0);
    expect(redisTtl(lockKey)).toBeLessThanOrEqual(15);

    const feedingId = uuid();
    const body = batch([feedingChange(feedingId, baby.id, 0)]);
    const blocked = await client.post('/sync/push', body);
    await expectError(blocked, 409, 'SYNC_IN_PROGRESS');
    const retryAfter = Number(blocked.headers()['retry-after']);
    expect(Number.isInteger(retryAfter)).toBe(true);
    expect(retryAfter).toBeGreaterThanOrEqual(1);
    expect(redisExists(lockKey)).toBe(true);
    await expectError(
      await client.get(`/feeding-records/${feedingId}`),
      404,
      'NOT_FOUND',
    );

    expect(redisCompareAndDelete(lockKey, lockToken)).toBe(1);

    const applied = await expectOk<SyncData>(await client.post('/sync/push', body));
    expect(applied.data.replayed).toBe(false);
    expect(applied.data.results[0].status).toBe('APPLIED');
    expect(applied.data.results[0].revision).toBe(1);

    const replay = await expectOk<SyncData>(await client.post('/sync/push', body));
    expect(replay.data.replayed).toBe(true);
    expect(replay.data.summary).toEqual(applied.data.summary);

    const idempotencyKey = syncBatchKeyOf(hash, body.batchId);
    const ttl = redisTtl(idempotencyKey);
    expect(ttl).toBeGreaterThanOrEqual(86_390);
    expect(ttl).toBeLessThanOrEqual(86_400);

    const list = await expectOk<Page<FeedingRecord>>(
      await client.get(`/feeding-records?babyId=${baby.id}&date=2026-10-20`),
    );
    expect(list.data.total).toBe(1);
  });

  test('SYNC-17 已 tombstone 记录：DELETE 幂等、UPSERT 永不复活', async ({ request }) => {
    const { client, baby } = await setupBaby(request);
    const record = await createFeeding(client, baby.id, { amountValue: 120 });
    await expectOk(
      await client.delete(`/feeding-records/${record.id}?baseRevision=1`),
    );

    const upsertMatching = await expectOk<SyncData>(
      await push(
        client,
        batch([feedingChange(record.id, baby.id, 2, { amountValue: 999 })]),
      ),
    );
    expect(upsertMatching.data.results[0].status).toBe('DUPLICATE');
    expect(upsertMatching.data.summary.duplicate).toBe(1);
    expect(upsertMatching.data.results[0].record?.deletedAt).toBeTruthy();
    expect(upsertMatching.data.results[0].record?.revision).toBe(2);
    expect(upsertMatching.data.results[0].record?.amountValue).toBe(120);

    const upsertZero = await expectOk<SyncData>(
      await push(
        client,
        batch([feedingChange(record.id, baby.id, 0, { amountValue: 999 })]),
      ),
    );
    expect(upsertZero.data.results[0].status).toBe('DUPLICATE');
    expect(upsertZero.data.results[0].record?.deletedAt).toBeTruthy();
    expect(upsertZero.data.results[0].record?.revision).toBe(2);

    const deleteAgain = await expectOk<SyncData>(
      await push(client, batch([deleteChange('FEEDING_RECORD', record.id, 2)])),
    );
    expect(deleteAgain.data.results[0].status).toBe('DUPLICATE');
    expect(deleteAgain.data.summary.duplicate).toBe(1);
    expect(deleteAgain.data.results[0].record?.deletedAt).toBeTruthy();
    expect(deleteAgain.data.results[0].record?.revision).toBe(2);

    await expectError(
      await client.get(`/feeding-records/${record.id}`),
      404,
      'NOT_FOUND',
    );

    const row = queryOne(
      `SELECT deleted_at IS NOT NULL, revision FROM feeding_record WHERE id = '${record.id}'`,
    );
    expect(row?.[0]).toBe('1');
    expect(row?.[1]).toBe('2');
  });

  test('SYNC-18 首次已提交但响应丢失，复用原请求体重试 → replayed', async ({ request }) => {
    const { client, baby } = await setupBaby(request);
    const feedingId = uuid();
    const body = batch([feedingChange(feedingId, baby.id, 0)]);

    // 第一次请求服务端已提交，但客户端未收到响应；
    // 客户端必须冻结 batchId/clientTime/changes，用原始 body 重试（Q-22）。
    await expectOk<SyncData>(await push(client, body));
    const retry = await expectOk<SyncData>(await push(client, body));

    expect(retry.data.batchId).toBe(body.batchId);
    expect(retry.data.replayed).toBe(true);
    expect(retry.data.results.map((item) => [item.status, item.revision])).toEqual([
      ['APPLIED', 1],
    ]);

    const list = await expectOk<Page<FeedingRecord>>(
      await client.get(`/feeding-records?babyId=${baby.id}&date=2026-10-20`),
    );
    expect(list.data.total).toBe(1);
  });

  test('SYNC-19 同 batchId 仅 clientTime 变化 → 409', async ({ request }) => {
    const { client, baby } = await setupBaby(request);
    const feedingId = uuid();
    const body = batch([feedingChange(feedingId, baby.id, 0)]);

    await expectOk<SyncData>(await push(client, body));

    const changedClientTime = {
      ...body,
      clientTime: at('2026-10-26', '16:05:00'),
    };
    await expectError(await push(client, changedClientTime), 409, 'CONFLICT');

    const record = await expectOk<FeedingRecord>(
      await client.get(`/feeding-records/${feedingId}`),
    );
    expect(record.data.amountValue).toBe(120);
    expect(record.data.revision).toBe(1);
  });

  test('SYNC-20 新 batchId + 相同 changes → 正常处理且单条幂等', async ({ request }) => {
    const { client, baby } = await setupBaby(request);
    const feedingId = uuid();
    const body = batch([feedingChange(feedingId, baby.id, 0)]);

    await expectOk<SyncData>(await push(client, body));

    const newBatch = { ...body, batchId: uuid() };
    const retried = await expectOk<SyncData>(await push(client, newBatch));
    expect(retried.data.batchId).toBe(newBatch.batchId);
    expect(retried.data.replayed).toBe(false);
    expect(retried.data.results[0].status).toBe('DUPLICATE');
    expect(retried.data.results[0].revision).toBe(1);

    const list = await expectOk<Page<FeedingRecord>>(
      await client.get(`/feeding-records?babyId=${baby.id}&date=2026-10-20`),
    );
    expect(list.data.total).toBe(1);
  });
});
