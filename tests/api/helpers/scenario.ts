import { expect, type APIRequestContext } from '@playwright/test';

import { ApiClient, expectOk, newDeviceClient, type InitData } from './api-client';
import { flushRedisDb } from './redis';
import { at, uuid, type FeedingPayload, type BabyPayload } from './fixtures';

/** 每个 API 用例前清空 Redis DB14：限流计数、统计缓存、同步锁/幂等键。 */
export async function resetApiState(): Promise<void> {
  flushRedisDb();
}

export interface DeviceSetup {
  client: ApiClient;
  deviceId: string;
  init: InitData;
}

export async function setupDevice(
  request: APIRequestContext,
  appVersion = '1.0.0',
): Promise<DeviceSetup> {
  const { client, deviceId, init } = await newDeviceClient(request, appVersion);
  return { client, deviceId, init };
}

export interface Baby {
  id: string;
  name: string;
  gender: 'MALE' | 'FEMALE' | 'UNKNOWN';
  birthDate: string;
  isDefault: boolean;
  revision: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface CreateBabyData {
  created: boolean;
  baby: Baby;
}

export interface FeedingRecord {
  id: string;
  babyId: string;
  feedType: 'BREAST' | 'FORMULA' | 'MIXED' | 'SOLID';
  breastSide: 'LEFT' | 'RIGHT' | 'BOTH' | null;
  amountValue: number | null;
  amountUnit: 'ML' | 'G' | null;
  durationSec: number | null;
  startedAt: string;
  endedAt: string | null;
  recordDate: string;
  tzOffsetMinutes: number;
  note: string | null;
  tags: string[] | null;
  revision: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface Page<T> {
  items: T[];
  page: number;
  size: number;
  total: number;
  hasNext: boolean;
}

export interface SetupBaby extends DeviceSetup {
  baby: Baby;
}

/** 新设备 + 一个宝宝（默认 isDefault 由服务端决定）。 */
export async function setupBaby(
  request: APIRequestContext,
  overrides: Partial<BabyPayload> = {},
): Promise<SetupBaby> {
  const setup = await setupDevice(request);
  const baby = await createBaby(setup.client, overrides);
  return { ...setup, baby };
}

export async function createBaby(
  client: ApiClient,
  overrides: Partial<BabyPayload> = {},
): Promise<Baby> {
  const payload: BabyPayload = {
    id: uuid(),
    name: '小满',
    gender: 'FEMALE',
    birthDate: '2026-03-01',
    ...overrides,
  };
  const response = await client.post('/babies', payload);
  const body = await expectOk<CreateBabyData>(response);
  return body.data.baby;
}

/** 创建喂养记录并返回服务端对象。 */
export async function createFeeding(
  client: ApiClient,
  babyId: string,
  payload: Partial<FeedingPayload> = {},
): Promise<FeedingRecord> {
  const body = {
    id: uuid(),
    babyId,
    feedType: 'FORMULA' as const,
    amountValue: 120,
    amountUnit: 'ML' as const,
    startedAt: at('2026-10-20', '10:00:00'),
    ...payload,
  };
  const response = await client.post('/feeding-records', body);
  const envelope = await expectOk<{ created: boolean; record: FeedingRecord }>(response);
  return envelope.data.record;
}

export interface StatsFixture {
  babyId: string;
  ids: {
    breastLeft: string;
    breastRight: string;
    formula120: string;
    formula150: string;
    mixed: string;
    solid30: string;
    breastBoth: string;
    solid20: string;
    deletedFormula500: string;
  };
}

/**
 * 按 docs/tests/v1.0.md §4.2 写入 9 条记录（本地日期 2026-10-20，+08:00），
 * 并删除第 9 条（FORMULA 500 ML），使其不参与统计/导出。
 */
export async function seedStatsFixture(
  client: ApiClient,
  babyId: string,
): Promise<StatsFixture> {
  const ids = {
    // 记录 id 是全局主键：每次调用都必须唯一，否则跨用例会命中其他设备
    // 的同 id 记录（幂等创建返回 404），无法重复运行。
    breastLeft: uuid(),
    breastRight: uuid(),
    formula120: uuid(),
    formula150: uuid(),
    mixed: uuid(),
    solid30: uuid(),
    breastBoth: uuid(),
    solid20: uuid(),
    deletedFormula500: uuid(),
  };

  const entries: Array<Partial<FeedingPayload> & { id: string }> = [
    {
      id: ids.breastLeft,
      feedType: 'BREAST',
      breastSide: 'LEFT',
      amountValue: null,
      amountUnit: null,
      durationSec: 900,
      startedAt: at('2026-10-20', '08:00:00'),
      endedAt: at('2026-10-20', '08:15:00'),
      note: '中途有点吐奶',
      tags: ['SPIT_UP'],
    },
    {
      id: ids.breastRight,
      feedType: 'BREAST',
      breastSide: 'RIGHT',
      amountValue: null,
      amountUnit: null,
      durationSec: 600,
      startedAt: at('2026-10-20', '09:00:00'),
      endedAt: at('2026-10-20', '09:10:00'),
      note: null,
      tags: [],
    },
    {
      id: ids.formula120,
      feedType: 'FORMULA',
      breastSide: null,
      amountValue: 120,
      amountUnit: 'ML',
      durationSec: 300,
      startedAt: at('2026-10-20', '10:00:00'),
      endedAt: at('2026-10-20', '10:05:00'),
      note: null,
      tags: [],
    },
    {
      id: ids.formula150,
      feedType: 'FORMULA',
      breastSide: null,
      amountValue: 150,
      amountUnit: 'ML',
      durationSec: null,
      startedAt: at('2026-10-20', '11:00:00'),
      endedAt: null,
      note: null,
      tags: [],
    },
    {
      id: ids.mixed,
      feedType: 'MIXED',
      breastSide: 'BOTH',
      amountValue: 90,
      amountUnit: 'ML',
      durationSec: 480,
      startedAt: at('2026-10-20', '12:00:00'),
      endedAt: at('2026-10-20', '12:08:00'),
      note: null,
      tags: [],
    },
    {
      id: ids.solid30,
      feedType: 'SOLID',
      breastSide: null,
      amountValue: 30,
      amountUnit: 'G',
      durationSec: 120,
      startedAt: at('2026-10-20', '13:00:00'),
      endedAt: at('2026-10-20', '13:02:00'),
      note: null,
      tags: [],
    },
    {
      id: ids.breastBoth,
      feedType: 'BREAST',
      breastSide: 'BOTH',
      amountValue: null,
      amountUnit: null,
      durationSec: 1200,
      startedAt: at('2026-10-20', '14:00:00'),
      endedAt: at('2026-10-20', '14:20:00'),
      note: null,
      tags: [],
    },
    {
      id: ids.solid20,
      feedType: 'SOLID',
      breastSide: null,
      amountValue: 20,
      amountUnit: 'G',
      durationSec: null,
      startedAt: at('2026-10-20', '15:00:00'),
      endedAt: null,
      note: null,
      tags: [],
    },
    {
      id: ids.deletedFormula500,
      feedType: 'FORMULA',
      breastSide: null,
      amountValue: 500,
      amountUnit: 'ML',
      durationSec: 600,
      startedAt: at('2026-10-20', '16:00:00'),
      endedAt: at('2026-10-20', '16:10:00'),
      note: null,
      tags: [],
    },
  ];

  for (const entry of entries) {
    await createFeeding(client, babyId, entry);
  }

  const deleteResponse = await client.delete(
    `/feeding-records/${ids.deletedFormula500}?baseRevision=1`,
  );
  await expectOk(deleteResponse);

  return { babyId, ids };
}

/** 断言字符串是 canonical 小写 UUID v4（Q-13）。 */
export function expectUuidV4(value: unknown): void {
  expect(typeof value, `expected UUID v4 string, got ${JSON.stringify(value)}`).toBe('string');
  expect(value).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
  );
}

/** 断言 UTC 毫秒时间格式：2026-10-26T08:00:00.000Z。 */
export function expectUtcMillis(value: unknown): void {
  expect(typeof value).toBe('string');
  expect(value).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
}

/** 精确比较两个 404 的 code/message/data，用于“不泄露存在性”断言。 */
export function expectSameNotFound(
  a: { code: string; message: string; data: unknown },
  b: { code: string; message: string; data: unknown },
): void {
  expect(a.code).toBe('NOT_FOUND');
  expect(b.code).toBe('NOT_FOUND');
  expect(a.message).toBe(b.message);
  expect(a.data).toEqual(b.data);
}
