import { randomUUID } from 'node:crypto';

import { DEFAULT_TZ_OFFSET } from './env';

/** 生成 UUID v4 小写。 */
export function uuid(): string {
  return randomUUID();
}

/** 拼接带偏移的本地时间，例如 at('2026-10-20', '08:00:00')。 */
export function at(date: string, time: string, offset: string = DEFAULT_TZ_OFFSET): string {
  return `${date}T${time}${offset}`;
}

export const FIXTURE_DATE = '2026-10-20';

export interface BabyPayload {
  id: string;
  name: string;
  gender: 'MALE' | 'FEMALE' | 'UNKNOWN';
  birthDate: string;
  isDefault?: boolean;
}

export function makeBaby(overrides: Partial<BabyPayload> = {}): BabyPayload {
  return {
    id: uuid(),
    name: `宝宝${uuid().slice(0, 8)}`,
    gender: 'FEMALE',
    birthDate: '2026-03-01',
    ...overrides,
  };
}

export type FeedType = 'BREAST' | 'FORMULA' | 'MIXED' | 'SOLID';
export type BreastSide = 'LEFT' | 'RIGHT' | 'BOTH';
export type AmountUnit = 'ML' | 'G';

export interface FeedingPayload {
  id: string;
  babyId: string;
  feedType: FeedType;
  breastSide?: BreastSide | null;
  amountValue?: number | null;
  amountUnit?: AmountUnit | null;
  durationSec?: number | null;
  startedAt: string;
  endedAt?: string | null;
  note?: string | null;
  tags?: string[] | null;
}

export function makeFeeding(babyId: string, overrides: Partial<FeedingPayload> = {}): FeedingPayload {
  return {
    id: uuid(),
    babyId,
    feedType: 'BREAST',
    breastSide: 'LEFT',
    durationSec: 900,
    startedAt: at(FIXTURE_DATE, '08:00:00'),
    endedAt: at(FIXTURE_DATE, '08:15:00'),
    note: '中途有点吐奶',
    tags: ['SPIT_UP'],
    ...overrides,
  };
}

export function makeFormula(babyId: string, overrides: Partial<FeedingPayload> = {}): FeedingPayload {
  return makeFeeding(babyId, {
    feedType: 'FORMULA',
    breastSide: null,
    amountValue: 120,
    amountUnit: 'ML',
    durationSec: null,
    endedAt: null,
    note: null,
    tags: [],
    ...overrides,
  });
}

export function makeMixed(babyId: string, overrides: Partial<FeedingPayload> = {}): FeedingPayload {
  return makeFeeding(babyId, {
    feedType: 'MIXED',
    breastSide: 'BOTH',
    amountValue: 90,
    amountUnit: 'ML',
    durationSec: 480,
    ...overrides,
  });
}

export function makeSolid(babyId: string, overrides: Partial<FeedingPayload> = {}): FeedingPayload {
  return makeFeeding(babyId, {
    feedType: 'SOLID',
    breastSide: null,
    amountValue: 30,
    amountUnit: 'G',
    durationSec: null,
    endedAt: null,
    ...overrides,
  });
}

export interface GrowthPayload {
  id: string;
  babyId: string;
  measuredOn: string;
  heightCm?: number | null;
  weightKg?: number | null;
  headCircumferenceCm?: number | null;
  note?: string | null;
}

export function makeGrowth(babyId: string, overrides: Partial<GrowthPayload> = {}): GrowthPayload {
  return {
    id: uuid(),
    babyId,
    measuredOn: FIXTURE_DATE,
    heightCm: 68.5,
    weightKg: 8.12,
    headCircumferenceCm: 43.0,
    note: '社区体检',
    ...overrides,
  };
}

export interface SyncChange {
  entityType: 'BABY' | 'FEEDING_RECORD' | 'GROWTH_RECORD';
  op: 'UPSERT' | 'DELETE';
  id: string;
  baseRevision: number;
  data?: Record<string, unknown>;
}

export function makeSyncBatch(changes: SyncChange[], batchId: string = uuid()) {
  return {
    batchId,
    clientTime: at('2026-10-26', '16:00:00'),
    changes,
  };
}
