import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import {
  getFeedingRecordCache,
  getFeedingRecordsByBabyDate,
  getGrowthRecordCache,
  putGrowthRecordCache,
} from '@/db'
import { useFeedingStore } from '@/stores/feeding'
import { useGrowthStore } from '@/stores/growth'
import { toOffsetISOString, todayLocalDate } from '@/utils/date'
import { buildLocalFeedingRecord } from '@/utils/feeding'
import type { FeedingRecordInput, GrowthRecord, GrowthRecordInput } from '@/types/models'

const outboxMocks = vi.hoisted(() => ({
  enqueueOutbox: vi.fn(),
}))

vi.mock('@/db/outbox', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/db/outbox')>()
  return { ...actual, enqueueOutbox: outboxMocks.enqueueOutbox }
})

function formulaInput(amountValue = 120): FeedingRecordInput {
  return {
    feedType: 'FORMULA',
    amountValue,
    amountUnit: 'ML',
    breastSide: null,
    durationSec: null,
    startedAt: toOffsetISOString(),
    note: null,
    tags: null,
  }
}

const growthInput: GrowthRecordInput = {
  measuredOn: '2026-10-20',
  heightCm: 68.5,
  weightKg: 8.12,
  headCircumferenceCm: 43,
  note: null,
}

function growthRecord(overrides: Partial<GrowthRecord> = {}): GrowthRecord {
  return {
    id: 'growth-1',
    babyId: 'baby-1',
    measuredOn: '2026-10-20',
    heightCm: 68.5,
    weightKg: 8.12,
    headCircumferenceCm: 43,
    note: null,
    revision: 1,
    createdAt: '2026-10-20T08:00:00.000Z',
    updatedAt: '2026-10-20T08:00:00.000Z',
    deletedAt: null,
    ...overrides,
  }
}

describe('IndexedDB 写入失败处理（FIX-FE-08）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    outboxMocks.enqueueOutbox.mockReset()
    outboxMocks.enqueueOutbox.mockRejectedValue(new Error('QuotaExceededError'))
  })

  it('喂养新建：outbox 写入失败时抛错、列表不新增、缓存回滚', async () => {
    const store = useFeedingStore()
    store.currentBabyId = 'baby-1'

    await expect(store.createLocal(formulaInput(), 'baby-1')).rejects.toThrow('保存失败')

    expect(store.records).toHaveLength(0)
    expect(store.pendingCount).toBe(0)
    expect(store.cacheDegraded).toBe(true)
    expect(await getFeedingRecordsByBabyDate('baby-1', todayLocalDate())).toHaveLength(0)
  })

  it('喂养编辑：outbox 写入失败时列表与缓存保持原值', async () => {
    const store = useFeedingStore()
    const synced = { ...buildLocalFeedingRecord(formulaInput(120), 'baby-1'), revision: 1 }
    store.currentBabyId = 'baby-1'
    store.mergeRecords([synced])

    await expect(store.updateRecord(synced, formulaInput(150))).rejects.toThrow('保存失败')

    expect(store.records).toHaveLength(1)
    expect(store.records[0].amountValue).toBe(120)
    expect((await getFeedingRecordCache(synced.id))?.amountValue).toBe(120)
  })

  it('喂养删除：outbox 写入失败时记录恢复、缓存保留', async () => {
    const store = useFeedingStore()
    const synced = { ...buildLocalFeedingRecord(formulaInput(120), 'baby-1'), revision: 1 }
    store.currentBabyId = 'baby-1'
    store.mergeRecords([synced])

    await expect(store.deleteRecord(synced)).rejects.toThrow('删除失败')

    expect(store.records).toHaveLength(1)
    expect(store.records[0].id).toBe(synced.id)
    expect((await getFeedingRecordCache(synced.id))?.id).toBe(synced.id)
  })

  it('生长新建：outbox 写入失败时抛错、列表不新增', async () => {
    const store = useGrowthStore()
    store.currentBabyId = 'baby-1'

    await expect(store.createRecord(growthInput, 'baby-1', '2026-03-01')).rejects.toThrow(
      '保存失败',
    )

    expect(store.records).toHaveLength(0)
    expect(store.cacheDegraded).toBe(true)
  })

  it('生长删除：outbox 写入失败时记录恢复、缓存保留', async () => {
    const store = useGrowthStore()
    const synced = growthRecord()
    await putGrowthRecordCache(synced)
    store.currentBabyId = 'baby-1'
    store.mergeRecords([synced])

    await expect(store.deleteRecord(synced)).rejects.toThrow('删除失败')

    expect(store.records).toHaveLength(1)
    expect(store.records[0].id).toBe(synced.id)
    expect((await getGrowthRecordCache(synced.id))?.id).toBe(synced.id)
  })
})
