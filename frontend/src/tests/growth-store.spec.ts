import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { ApiError } from '@/api/client'
import { getGrowthRecordsByBaby, putGrowthRecordCache } from '@/db'
import { listOutbox } from '@/db/outbox'
import { useGrowthStore } from '@/stores/growth'
import type { GrowthRecord, GrowthRecordInput } from '@/types/models'

const apiMocks = vi.hoisted(() => ({
  listGrowthRecords: vi.fn(),
  fetchLatestGrowthRecord: vi.fn(),
  createGrowthRecordRequest: vi.fn(),
  patchGrowthRecordRequest: vi.fn(),
  deleteGrowthRecordRequest: vi.fn(),
}))

vi.mock('@/api/growth', () => apiMocks)

const INPUT: GrowthRecordInput = {
  measuredOn: '2026-10-20',
  heightCm: 68.5,
  weightKg: 8.12,
  headCircumferenceCm: 43,
  note: '社区体检',
}

function record(overrides: Partial<GrowthRecord> = {}): GrowthRecord {
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

describe('growth store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    apiMocks.listGrowthRecords.mockReset()
    apiMocks.fetchLatestGrowthRecord.mockReset()
    apiMocks.createGrowthRecordRequest.mockReset()
    apiMocks.patchGrowthRecordRequest.mockReset()
    apiMocks.deleteGrowthRecordRequest.mockReset()
  })

  it('新建记录本地落库并同步成功后替换为服务端 revision', async () => {
    apiMocks.createGrowthRecordRequest.mockImplementation(async (input: GrowthRecordInput) => ({
      created: true,
      record: {
        ...record(),
        id: input.id ?? 'growth-1',
        babyId: 'baby-1',
        measuredOn: input.measuredOn,
        heightCm: input.heightCm ?? null,
        weightKg: input.weightKg ?? null,
        headCircumferenceCm: input.headCircumferenceCm ?? null,
        note: input.note ?? null,
      },
    }))
    const store = useGrowthStore()
    store.currentBabyId = 'baby-1'

    const outcome = await store.createRecord(INPUT, 'baby-1', '2026-03-01')

    expect(outcome.status).toBe('synced')
    expect(store.records).toHaveLength(1)
    expect(store.records[0].revision).toBe(1)
    expect(store.latest?.id).toBe(store.records[0].id)
    expect(await getGrowthRecordsByBaby('baby-1')).toHaveLength(1)
    expect(await listOutbox()).toHaveLength(0)
  })

  it('三项全空时拒绝保存', async () => {
    const store = useGrowthStore()
    await expect(
      store.createRecord({ measuredOn: '2026-10-20' }, 'baby-1', '2026-03-01'),
    ).rejects.toThrow('至少填写')
    expect(store.records).toHaveLength(0)
  })

  it('409 冲突时使用服务端 data.current 覆盖本地', async () => {
    const local = record()
    const store = useGrowthStore()
    store.currentBabyId = 'baby-1'
    store.records = [local]
    apiMocks.patchGrowthRecordRequest.mockRejectedValue(
      new ApiError('CONFLICT', 409, 'conflict', {
        current: record({ revision: 2, weightKg: 8.5 }),
      }),
    )

    const outcome = await store.updateRecord(
      local,
      { ...INPUT, weightKg: 9.5 },
      '2026-03-01',
    )

    expect(outcome.status).toBe('conflict')
    expect(store.records[0].weightKg).toBe(8.5)
    expect(store.records[0].revision).toBe(2)
    expect(await listOutbox()).toHaveLength(0)
  })

  it('列表失败时使用 IndexedDB 缓存并标记离线', async () => {
    apiMocks.listGrowthRecords.mockRejectedValue(
      new ApiError('NETWORK_ERROR', 0, 'offline'),
    )
    await putGrowthRecordCache(record({ id: 'cached', weightKg: 8.5 }))
    const store = useGrowthStore()

    await store.load('baby-1')

    expect(store.offline).toBe(true)
    expect(store.records).toHaveLength(1)
    expect(store.latest?.weightKg).toBe(8.5)
    expect(store.hasData).toBe(true)
    expect(store.lastError).toBeTruthy()
  })

  it('删除已同步记录会带 baseRevision 并清空缓存', async () => {
    const local = record()
    const store = useGrowthStore()
    store.currentBabyId = 'baby-1'
    store.records = [local]
    await putGrowthRecordCache(local)
    apiMocks.deleteGrowthRecordRequest.mockResolvedValue({
      id: local.id,
      revision: 2,
      deletedAt: '2026-10-21T00:00:00.000Z',
      alreadyDeleted: false,
    })

    const outcome = await store.deleteRecord(local)

    expect(outcome.status).toBe('synced')
    expect(store.records).toHaveLength(0)
    expect(await getGrowthRecordsByBaby('baby-1')).toHaveLength(0)
    expect(apiMocks.deleteGrowthRecordRequest).toHaveBeenCalledWith(local.id, 1)
    expect(await listOutbox()).toHaveLength(0)
  })
})
