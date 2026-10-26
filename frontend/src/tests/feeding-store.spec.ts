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
}))

vi.mock('@/api/feeding', () => apiMocks)

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
    apiMocks.listFeedingRecords.mockRejectedValue(new ApiError('NETWORK_ERROR', 0, 'offline'))
  })

  it('网络请求挂起时，本地保存仍立即完成（≤3 秒）', async () => {
    apiMocks.createFeedingRecordRequest.mockReturnValue(new Promise(() => undefined))
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

  it('在线同步成功后更新 revision 并清空 outbox', async () => {
    apiMocks.createFeedingRecordRequest.mockImplementation(
      async (input: FeedingRecordInput & { id: string; babyId: string }) => {
        const local = buildLocalFeedingRecord(input, input.babyId)
        return { created: true, record: { ...local, id: input.id, revision: 1 } }
      },
    )
    const store = useFeedingStore()
    store.currentBabyId = 'baby-1'
    store.currentDate = todayLocalDate()

    const recorder = useFeedingRecorder()
    await recorder.save(formulaInput(), 'baby-1')
    await new Promise((resolve) => setTimeout(resolve, 20))

    expect(store.records[0].revision).toBe(1)
    expect(await listOutbox()).toHaveLength(0)
    expect(store.lastError).toBeNull()
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
