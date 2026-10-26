import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { ApiError } from '@/api/client'
import { useFeedingRecorder } from '@/composables/useFeedingRecorder'
import { getFeedingRecordsByBabyDate } from '@/db'
import { listOutbox } from '@/db/outbox'
import { useFeedingStore } from '@/stores/feeding'
import { toOffsetISOString, todayLocalDate } from '@/utils/date'
import { buildLocalFeedingRecord } from '@/utils/feeding'
import type { FeedingRecordInput } from '@/types/models'

const apiMocks = vi.hoisted(() => ({
  listFeedingRecords: vi.fn(),
  createFeedingRecordRequest: vi.fn(),
  patchFeedingRecordRequest: vi.fn(),
  deleteFeedingRecordRequest: vi.fn(),
}))

const syncMocks = vi.hoisted(() => ({
  pushSyncBatch: vi.fn(),
}))

vi.mock('@/api/feeding', () => apiMocks)
vi.mock('@/api/sync', () => syncMocks)

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

describe('feeding store + recorder', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    apiMocks.listFeedingRecords.mockReset()
    apiMocks.createFeedingRecordRequest.mockReset()
    apiMocks.patchFeedingRecordRequest.mockReset()
    apiMocks.deleteFeedingRecordRequest.mockReset()
    apiMocks.listFeedingRecords.mockRejectedValue(new ApiError('NETWORK_ERROR', 0, 'offline'))
    syncMocks.pushSyncBatch.mockReset()
    syncMocks.pushSyncBatch.mockRejectedValue(new ApiError('NETWORK_ERROR', 0, 'offline'))
  })

  it('网络请求挂起时，本地保存仍立即完成（≤3 秒）', async () => {
    syncMocks.pushSyncBatch.mockReturnValue(new Promise(() => undefined))
    const store = useFeedingStore()
    const today = todayLocalDate()
    store.currentBabyId = 'baby-1'
    store.currentDate = today

    const recorder = useFeedingRecorder()
    const startedAt = Date.now()
    const record = await recorder.save(formulaInput(), 'baby-1')
    const elapsed = Date.now() - startedAt

    expect(elapsed).toBeLessThan(3000)
    expect(record.revision).toBe(0)
    expect(record.recordDate).toBe(today)
    expect(store.records).toHaveLength(1)
    expect(store.todaySummary.totalAmountMl).toBe(120)
    expect(await getFeedingRecordsByBabyDate('baby-1', today)).toHaveLength(1)
    expect(await listOutbox()).toHaveLength(1)
  })

  it('在线批量同步成功后更新 revision 并清空 outbox', async () => {
    syncMocks.pushSyncBatch.mockImplementation(
      async (payload: {
        batchId: string
        changes: Array<{
          entityType: string
          id: string
          data?: Record<string, unknown>
        }>
      }) => ({
        batchId: payload.batchId,
        replayed: false,
        processedAt: new Date().toISOString(),
        results: payload.changes.map((change) => {
          const { babyId, ...rest } = change.data ?? {}
          const local = buildLocalFeedingRecord(
            rest as unknown as FeedingRecordInput,
            String(babyId),
          )
          return {
            entityType: change.entityType,
            id: change.id,
            status: 'APPLIED',
            revision: 1,
            record: { ...local, id: change.id, revision: 1 },
          }
        }),
        summary: { applied: 1, duplicate: 0, conflict: 0, rejected: 0 },
      }),
    )
    const store = useFeedingStore()
    store.currentBabyId = 'baby-1'
    store.currentDate = todayLocalDate()

    const recorder = useFeedingRecorder()
    await recorder.save(formulaInput(), 'baby-1')
    await vi.waitFor(() => expect(store.records[0].revision).toBe(1))

    expect(await listOutbox()).toHaveLength(0)
    expect(store.lastError).toBeNull()
  })

  it('编辑已同步记录：本地立即生效并写回服务端', async () => {
    const store = useFeedingStore()
    const today = todayLocalDate()
    store.currentBabyId = 'baby-1'
    store.currentDate = today
    const base = buildLocalFeedingRecord(formulaInput(), 'baby-1')
    const synced = { ...base, revision: 1 }
    store.mergeRecords([synced])
    apiMocks.patchFeedingRecordRequest.mockResolvedValue({
      ...synced,
      amountValue: 150,
      revision: 2,
    })

    const outcome = await store.updateRecord(synced, { ...formulaInput(), amountValue: 150 })

    expect(outcome.status).toBe('synced')
    expect(store.records[0].amountValue).toBe(150)
    expect(store.records[0].revision).toBe(2)
    expect(await listOutbox()).toHaveLength(0)
    expect(apiMocks.patchFeedingRecordRequest).toHaveBeenCalledWith(
      synced.id,
      expect.objectContaining({ baseRevision: 1, amountValue: 150 }),
    )
    // Q-04：PATCH body 不允许出现 babyId（含 null）
    const patchPayload = apiMocks.patchFeedingRecordRequest.mock.calls[0][1]
    expect(patchPayload).not.toHaveProperty('babyId')
  })

  it('编辑冲突 409：用服务端 data.current 覆盖并提示', async () => {
    const store = useFeedingStore()
    const today = todayLocalDate()
    store.currentBabyId = 'baby-1'
    store.currentDate = today
    const base = buildLocalFeedingRecord(formulaInput(), 'baby-1')
    const synced = { ...base, revision: 1 }
    store.mergeRecords([synced])
    const serverCurrent = { ...synced, amountValue: 200, revision: 2 }
    apiMocks.patchFeedingRecordRequest.mockRejectedValue(
      new ApiError('CONFLICT', 409, 'conflict', { current: serverCurrent }),
    )

    const outcome = await store.updateRecord(synced, { ...formulaInput(), amountValue: 150 })

    expect(outcome.status).toBe('conflict')
    expect(outcome.message).toBe('该记录已在其他端更新')
    expect(store.records[0].amountValue).toBe(200)
    expect(store.records[0].revision).toBe(2)
    expect(await listOutbox()).toHaveLength(0)
  })

  it('删除冲突 409：恢复服务端最新记录', async () => {
    const store = useFeedingStore()
    const today = todayLocalDate()
    store.currentBabyId = 'baby-1'
    store.currentDate = today
    const base = buildLocalFeedingRecord(formulaInput(), 'baby-1')
    const synced = { ...base, revision: 1 }
    store.mergeRecords([synced])
    apiMocks.deleteFeedingRecordRequest.mockRejectedValue(
      new ApiError('CONFLICT', 409, 'conflict', { current: { ...synced, revision: 2 } }),
    )

    const outcome = await store.deleteRecord(synced)

    expect(outcome.status).toBe('conflict')
    expect(store.records.map((record) => record.id)).toEqual([synced.id])
    expect(store.records[0].revision).toBe(2)
    expect(await listOutbox()).toHaveLength(0)
  })

  it('删除已同步记录成功后清空本地与 outbox', async () => {
    const store = useFeedingStore()
    const today = todayLocalDate()
    store.currentBabyId = 'baby-1'
    store.currentDate = today
    const base = buildLocalFeedingRecord(formulaInput(), 'baby-1')
    const synced = { ...base, revision: 1 }
    store.mergeRecords([synced])
    apiMocks.deleteFeedingRecordRequest.mockResolvedValue({
      id: synced.id,
      revision: 2,
      deletedAt: new Date().toISOString(),
      alreadyDeleted: false,
    })

    const outcome = await store.deleteRecord(synced)

    expect(outcome.status).toBe('synced')
    expect(store.records).toHaveLength(0)
    expect(await listOutbox()).toHaveLength(0)
  })

  it('loadDay 合并服务端记录与本地待同步记录', async () => {
    const store = useFeedingStore()
    const today = todayLocalDate()
    const pending = await store.createLocal(formulaInput(), 'baby-1')

    apiMocks.listFeedingRecords.mockResolvedValue({
      items: [
        {
          ...buildLocalFeedingRecord(formulaInput(), 'baby-1'),
          id: 'server-record',
          revision: 1,
        },
      ],
      page: 1,
      size: 100,
      total: 1,
      hasNext: false,
    })

    await store.loadDay('baby-1', today)
    expect(store.records.map((record) => record.id).sort()).toEqual(
      [pending.id, 'server-record'].sort(),
    )
  })
})
