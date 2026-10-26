import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { ApiError } from '@/api/client'
import {
  getFeedingRecordCache,
  getMeta,
  putFeedingRecordCache,
  putGrowthRecordCache,
} from '@/db'
import {
  enqueueOutbox,
  getOutboxItem,
  listOutbox,
  outboxKey,
} from '@/db/outbox'
import { useBabyStore } from '@/stores/baby'
import { useFeedingStore } from '@/stores/feeding'
import { useGrowthStore } from '@/stores/growth'
import { useSyncStore } from '@/stores/sync'
import type { Baby, FeedingRecordInput, GrowthRecord } from '@/types/models'
import { toOffsetISOString } from '@/utils/date'
import { buildLocalFeedingRecord, toFeedingSyncData } from '@/utils/feeding'

const syncMocks = vi.hoisted(() => ({
  pushSyncBatch: vi.fn(),
}))

const babyApiMocks = vi.hoisted(() => ({
  fetchBabies: vi.fn(),
  createBabyRequest: vi.fn(),
  patchBabyRequest: vi.fn(),
  deleteBabyRequest: vi.fn(),
}))

vi.mock('@/api/sync', () => syncMocks)
// 同步应用默认宝宝后会异步刷新宝宝列表（FE-06），测试里保持离线避免真实请求
vi.mock('@/api/babies', () => babyApiMocks)

type Change = {
  entityType: 'BABY' | 'FEEDING_RECORD' | 'GROWTH_RECORD'
  op: 'UPSERT' | 'DELETE'
  id: string
  baseRevision: number
  data?: Record<string, unknown>
}

function formulaInput(): FeedingRecordInput {
  return {
    feedType: 'FORMULA',
    amountValue: 120,
    amountUnit: 'ML',
    breastSide: null,
    durationSec: null,
    startedAt: toOffsetISOString(),
    note: null,
    tags: null,
  }
}

function localFeeding(id: string, revision = 1) {
  return { ...buildLocalFeedingRecord(formulaInput(), 'baby-1'), id, revision }
}

function localGrowth(id: string, revision = 1): GrowthRecord {
  const now = new Date().toISOString()
  return {
    id,
    babyId: 'baby-1',
    measuredOn: '2026-10-20',
    heightCm: 68.5,
    weightKg: 8.5,
    headCircumferenceCm: 43,
    note: null,
    revision,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  }
}

function appliedRecord(change: Change): Record<string, unknown> | null {
  if (change.entityType === 'BABY') {
    if (!change.data) return null
    const now = new Date().toISOString()
    return {
      id: change.id,
      name: change.data.name,
      gender: change.data.gender,
      birthDate: change.data.birthDate,
      isDefault: change.data.isDefault,
      revision: 1,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    }
  }
  if (change.entityType === 'FEEDING_RECORD') {
    if (!change.data) return null
    const { babyId, ...rest } = change.data
    const local = buildLocalFeedingRecord(
      rest as unknown as FeedingRecordInput,
      String(babyId),
    )
    return { ...local, id: change.id, revision: 1 }
  }
  if (!change.data) return null
  const now = new Date().toISOString()
  return {
    id: change.id,
    babyId: change.data.babyId,
    measuredOn: change.data.measuredOn,
    heightCm: change.data.heightCm ?? null,
    weightKg: change.data.weightKg ?? null,
    headCircumferenceCm: change.data.headCircumferenceCm ?? null,
    note: change.data.note ?? null,
    revision: 1,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  }
}

function mockApplied(): void {
  syncMocks.pushSyncBatch.mockImplementation(
    async (payload: { batchId: string; changes: Change[] }) => ({
      batchId: payload.batchId,
      replayed: false,
      processedAt: new Date().toISOString(),
      results: payload.changes.map((change) => ({
        entityType: change.entityType,
        id: change.id,
        status: 'APPLIED',
        revision: 1,
        record: appliedRecord(change),
      })),
      summary: {
        applied: payload.changes.length,
        duplicate: 0,
        conflict: 0,
        rejected: 0,
      },
    }),
  )
}

async function seedFeedingOutbox(record: ReturnType<typeof localFeeding>, op: 'UPSERT' | 'DELETE' = 'UPSERT') {
  if (op === 'UPSERT') {
    await putFeedingRecordCache(record)
    await enqueueOutbox({
      entityType: 'FEEDING_RECORD',
      entityId: record.id,
      op,
      baseRevision: record.revision,
      data: toFeedingSyncData(record),
    })
  } else {
    await enqueueOutbox({
      entityType: 'FEEDING_RECORD',
      entityId: record.id,
      op,
      baseRevision: record.revision,
    })
  }
}

describe('sync store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    syncMocks.pushSyncBatch.mockReset()
    babyApiMocks.fetchBabies.mockReset()
    babyApiMocks.fetchBabies.mockRejectedValue(new ApiError('NETWORK_ERROR', 0, 'offline'))
  })

  it('按 BABY 优先、每批 ≤50 推送，APPLIED 后清空 outbox', async () => {
    mockApplied()
    const baby: Baby = {
      id: '11111111-1111-4111-8111-111111111111',
      name: '小满',
      gender: 'FEMALE',
      birthDate: '2026-03-01',
      isDefault: true,
      revision: 0,
      createdAt: '2026-10-01T00:00:00.000Z',
      updatedAt: '2026-10-01T00:00:00.000Z',
      deletedAt: null,
    }
    useBabyStore().babies = [baby]
    await enqueueOutbox({
      entityType: 'BABY',
      entityId: baby.id,
      op: 'UPSERT',
      baseRevision: 0,
      data: {
        name: baby.name,
        gender: baby.gender,
        birthDate: baby.birthDate,
        isDefault: baby.isDefault,
      },
    })
    for (let i = 0; i < 51; i += 1) {
      const id = `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`
      await seedFeedingOutbox(localFeeding(id))
    }

    const sync = useSyncStore()
    const outcome = await sync.syncNow()

    expect(outcome.status).toBe('ok')
    expect(syncMocks.pushSyncBatch).toHaveBeenCalledTimes(2)
    const first = syncMocks.pushSyncBatch.mock.calls[0][0] as { changes: Change[] }
    const second = syncMocks.pushSyncBatch.mock.calls[1][0] as { changes: Change[] }
    expect(first.changes).toHaveLength(50)
    expect(first.changes[0].entityType).toBe('BABY')
    expect(second.changes).toHaveLength(2)
    expect(await listOutbox()).toHaveLength(0)
    expect(sync.pendingCount).toBe(0)
    expect(useBabyStore().babies[0].revision).toBe(1)
  })

  it('UPSERT 命中 tombstone（DUPLICATE + record.deletedAt）时删除本地且不复活', async () => {
    const record = localFeeding('22222222-2222-4222-8222-222222222222')
    await seedFeedingOutbox(record)
    const feeding = useFeedingStore()
    feeding.mergeRecords([record])

    syncMocks.pushSyncBatch.mockResolvedValue({
      batchId: 'batch-1',
      replayed: false,
      processedAt: new Date().toISOString(),
      results: [
        {
          entityType: 'FEEDING_RECORD',
          id: record.id,
          status: 'DUPLICATE',
          revision: 3,
          record: {
            ...record,
            revision: 3,
            deletedAt: '2026-10-26T00:00:00.000Z',
          },
        },
      ],
      summary: { applied: 0, duplicate: 1, conflict: 0, rejected: 0 },
    })

    const outcome = await useSyncStore().syncNow()

    expect(outcome.duplicate).toBe(1)
    expect(await getFeedingRecordCache(record.id)).toBeUndefined()
    expect(feeding.records.some((item) => item.id === record.id)).toBe(false)
    expect(await listOutbox()).toHaveLength(0)
  })

  it('CONFLICT_SERVER_WINS 用服务端记录覆盖本地', async () => {
    const record = localFeeding('33333333-3333-4333-8333-333333333333', 1)
    await seedFeedingOutbox(record)
    const feeding = useFeedingStore()
    feeding.mergeRecords([record])

    syncMocks.pushSyncBatch.mockResolvedValue({
      batchId: 'batch-2',
      replayed: false,
      processedAt: new Date().toISOString(),
      results: [
        {
          entityType: 'FEEDING_RECORD',
          id: record.id,
          status: 'CONFLICT_SERVER_WINS',
          revision: 2,
          record: { ...record, revision: 2, amountValue: 200 },
        },
      ],
      summary: { applied: 0, duplicate: 0, conflict: 1, rejected: 0 },
    })

    const outcome = await useSyncStore().syncNow()

    expect(outcome.conflict).toBe(1)
    expect(feeding.records[0].amountValue).toBe(200)
    expect(feeding.records[0].revision).toBe(2)
    expect(await listOutbox()).toHaveLength(0)
  })

  it('REJECTED 保留本地、标记失败且不再自动重试', async () => {
    const record = localFeeding('44444444-4444-4444-8444-444444444444')
    await seedFeedingOutbox(record)
    const feeding = useFeedingStore()
    feeding.mergeRecords([record])

    syncMocks.pushSyncBatch.mockResolvedValue({
      batchId: 'batch-3',
      replayed: false,
      processedAt: new Date().toISOString(),
      results: [
        {
          entityType: 'FEEDING_RECORD',
          id: record.id,
          status: 'REJECTED',
          revision: 0,
          error: { code: 'NOT_FOUND', message: '宝宝不存在' },
        },
      ],
      summary: { applied: 0, duplicate: 0, conflict: 0, rejected: 1 },
    })

    const sync = useSyncStore()
    const outcome = await sync.syncNow()
    const item = await getOutboxItem(outboxKey('FEEDING_RECORD', record.id))

    expect(outcome.rejected).toBe(1)
    expect(item?.failed).toBe(true)
    expect(item?.lastError).toBe('宝宝不存在')
    expect(sync.failedCount).toBe(1)
    expect(feeding.records.some((entry) => entry.id === record.id)).toBe(true)

    syncMocks.pushSyncBatch.mockClear()
    await sync.syncNow()
    expect(syncMocks.pushSyncBatch).not.toHaveBeenCalled()
  })

  it('网络错误保留 outbox 并按指数退避设置 nextRetryAt', async () => {
    const record = localFeeding('55555555-5555-4555-8555-555555555555')
    await seedFeedingOutbox(record)
    syncMocks.pushSyncBatch.mockRejectedValue(
      new ApiError('NETWORK_ERROR', 0, '网络不可用'),
    )

    const outcome = await useSyncStore().syncNow()
    const item = await getOutboxItem(outboxKey('FEEDING_RECORD', record.id))

    expect(outcome.status).toBe('error')
    expect(item?.attemptCount).toBe(1)
    expect(item?.failed).toBeFalsy()
    expect(Date.parse(item?.nextRetryAt ?? '')).toBeGreaterThan(Date.now())
  })

  it('同一批网络重试复用 batchId；服务端确认后新批次生成新 batchId', async () => {
    const record = localFeeding('88888888-8888-4888-8888-888888888888')
    await seedFeedingOutbox(record)
    const sync = useSyncStore()

    syncMocks.pushSyncBatch.mockRejectedValueOnce(
      new ApiError('NETWORK_ERROR', 0, '网络不可用'),
    )
    await sync.syncNow()

    // 退避未到期时再次保存同一内容：请求体不变，仍复用原批次
    await enqueueOutbox({
      entityType: 'FEEDING_RECORD',
      entityId: record.id,
      op: 'UPSERT',
      baseRevision: record.revision,
      data: toFeedingSyncData(record),
    })
    mockApplied()
    const outcome = await sync.syncNow()

    expect(outcome.status).toBe('ok')
    const firstBatch = syncMocks.pushSyncBatch.mock.calls[0][0] as {
      batchId: string
      clientTime: string
    }
    const retryBatch = syncMocks.pushSyncBatch.mock.calls[1][0] as {
      batchId: string
      clientTime: string
    }
    expect(retryBatch.batchId).toBe(firstBatch.batchId)
    expect(retryBatch.clientTime).toBe(firstBatch.clientTime)

    // 上一批已被服务端确认，后续批次属于新尝试
    const next = localFeeding('99999999-9999-4999-8999-999999999998')
    await seedFeedingOutbox(next)
    await sync.syncNow()
    const nextBatch = syncMocks.pushSyncBatch.mock.calls[2][0] as { batchId: string }
    expect(nextBatch.batchId).not.toBe(firstBatch.batchId)
    expect(await listOutbox()).toHaveLength(0)
  })

  it('同一批次重试复用 clientTime：首次 5xx、重试成功且不标记失败', async () => {
    const record = localFeeding('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
    await seedFeedingOutbox(record)
    const sync = useSyncStore()

    syncMocks.pushSyncBatch.mockRejectedValueOnce(
      new ApiError('INTERNAL_ERROR', 500, '服务端错误'),
    )
    const failed = await sync.syncNow()
    expect(failed.status).toBe('error')
    const deferred = await getOutboxItem(outboxKey('FEEDING_RECORD', record.id))
    expect(deferred?.failed).toBeFalsy()

    // 退避窗口内再次编辑保存同一内容，使该条目重新到期
    await enqueueOutbox({
      entityType: 'FEEDING_RECORD',
      entityId: record.id,
      op: 'UPSERT',
      baseRevision: record.revision,
      data: toFeedingSyncData(record),
    })
    mockApplied()
    const outcome = await sync.syncNow()

    expect(outcome.status).toBe('ok')
    const firstPayload = syncMocks.pushSyncBatch.mock.calls[0][0] as {
      batchId: string
      clientTime: string
    }
    const retryPayload = syncMocks.pushSyncBatch.mock.calls[1][0] as {
      batchId: string
      clientTime: string
    }
    expect(retryPayload.batchId).toBe(firstPayload.batchId)
    expect(retryPayload.clientTime).toBe(firstPayload.clientTime)
    expect(await getOutboxItem(outboxKey('FEEDING_RECORD', record.id))).toBeUndefined()
    expect(sync.failedCount).toBe(0)
  })

  it('退避窗口内 syncNow 不丢计划，batchId/clientTime 保持不变', async () => {
    const record = localFeeding('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')
    await seedFeedingOutbox(record)
    const sync = useSyncStore()

    syncMocks.pushSyncBatch.mockRejectedValueOnce(
      new ApiError('NETWORK_ERROR', 0, '网络不可用'),
    )
    await sync.syncNow()
    const planBefore = await getMeta<{ batchId: string; clientTime: string }>(
      'sync.batchPlan',
    )
    expect(planBefore?.batchId).toBeTruthy()
    const callsAfterFailure = syncMocks.pushSyncBatch.mock.calls.length

    // 退避未到期时新增另一条记录：旧计划不能被挤掉或换 batchId
    const another = localFeeding('cccccccc-cccc-4ccc-8ccc-cccccccccccc')
    await seedFeedingOutbox(another)
    await sync.syncNow()
    expect(syncMocks.pushSyncBatch).toHaveBeenCalledTimes(callsAfterFailure)
    const planAfter = await getMeta<{ batchId: string; clientTime: string }>(
      'sync.batchPlan',
    )
    expect(planAfter?.batchId).toBe(planBefore?.batchId)
    expect(planAfter?.clientTime).toBe(planBefore?.clientTime)

    // 旧条目重新到期后，用原批次原样重放（只含原批次记录）
    await enqueueOutbox({
      entityType: 'FEEDING_RECORD',
      entityId: record.id,
      op: 'UPSERT',
      baseRevision: record.revision,
      data: toFeedingSyncData(record),
    })
    mockApplied()
    await sync.syncNow()

    const replay = syncMocks.pushSyncBatch.mock.calls[callsAfterFailure][0] as {
      batchId: string
      clientTime: string
      changes: Change[]
    }
    expect(replay.batchId).toBe(planBefore?.batchId)
    expect(replay.clientTime).toBe(planBefore?.clientTime)
    expect(replay.changes.map((change) => change.id)).toEqual([record.id])
  })

  it('失败后内容被修改则视为新尝试，换用新 batchId', async () => {
    const record = localFeeding('99999999-9999-4999-8999-999999999999')
    await seedFeedingOutbox(record)
    const sync = useSyncStore()

    syncMocks.pushSyncBatch.mockRejectedValueOnce(
      new ApiError('NETWORK_ERROR', 0, '网络不可用'),
    )
    await sync.syncNow()

    await enqueueOutbox({
      entityType: 'FEEDING_RECORD',
      entityId: record.id,
      op: 'UPSERT',
      baseRevision: record.revision,
      data: { ...toFeedingSyncData(record), amountValue: 150 },
    })
    mockApplied()
    await sync.syncNow()

    const firstBatch = syncMocks.pushSyncBatch.mock.calls[0][0] as { batchId: string }
    const changedBatch = syncMocks.pushSyncBatch.mock.calls[1][0] as { batchId: string }
    expect(changedBatch.batchId).not.toBe(firstBatch.batchId)
  })

  it('DELETE 已同步记录 APPLIED 后移除本地', async () => {
    const record = localFeeding('66666666-6666-4666-8666-666666666666')
    await putFeedingRecordCache(record)
    const feeding = useFeedingStore()
    feeding.mergeRecords([record])
    await seedFeedingOutbox(record, 'DELETE')

    syncMocks.pushSyncBatch.mockResolvedValue({
      batchId: 'batch-4',
      replayed: false,
      processedAt: new Date().toISOString(),
      results: [
        {
          entityType: 'FEEDING_RECORD',
          id: record.id,
          status: 'APPLIED',
          revision: 2,
          record: { ...record, revision: 2, deletedAt: '2026-10-26T00:00:00.000Z' },
        },
      ],
      summary: { applied: 1, duplicate: 0, conflict: 0, rejected: 0 },
    })

    await useSyncStore().syncNow()

    expect(feeding.records.some((entry) => entry.id === record.id)).toBe(false)
    expect(await getFeedingRecordCache(record.id)).toBeUndefined()
    expect(await listOutbox()).toHaveLength(0)
  })

  it('生长记录 tombstone 同样删除本地缓存', async () => {
    const record = localGrowth('77777777-7777-4777-8777-777777777777')
    await putGrowthRecordCache(record)
    const growth = useGrowthStore()
    growth.currentBabyId = 'baby-1'
    growth.mergeRecords([record])
    await enqueueOutbox({
      entityType: 'GROWTH_RECORD',
      entityId: record.id,
      op: 'UPSERT',
      baseRevision: record.revision,
      data: {
        babyId: record.babyId,
        measuredOn: record.measuredOn,
        heightCm: record.heightCm,
        weightKg: record.weightKg,
        headCircumferenceCm: record.headCircumferenceCm,
        note: record.note,
      },
    })

    syncMocks.pushSyncBatch.mockResolvedValue({
      batchId: 'batch-5',
      replayed: false,
      processedAt: new Date().toISOString(),
      results: [
        {
          entityType: 'GROWTH_RECORD',
          id: record.id,
          status: 'DUPLICATE',
          revision: 4,
          record: { ...record, revision: 4, deletedAt: '2026-10-26T00:00:00.000Z' },
        },
      ],
      summary: { applied: 0, duplicate: 1, conflict: 0, rejected: 0 },
    })

    await useSyncStore().syncNow()

    expect(growth.records.some((entry) => entry.id === record.id)).toBe(false)
    expect(await listOutbox()).toHaveLength(0)
  })
})
