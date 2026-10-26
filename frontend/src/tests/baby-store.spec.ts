import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { ApiError } from '@/api/client'
import { getBabiesCache, putBabyCache } from '@/db'
import { enqueueOutbox, getOutboxItem, listOutbox, outboxKey } from '@/db/outbox'
import { useBabyStore } from '@/stores/baby'
import type { Baby } from '@/types/models'

const apiMocks = vi.hoisted(() => ({
  fetchBabies: vi.fn(),
  createBabyRequest: vi.fn(),
  patchBabyRequest: vi.fn(),
  deleteBabyRequest: vi.fn(),
}))

vi.mock('@/api/babies', () => apiMocks)

function makeBaby(partial: Partial<Baby> = {}): Baby {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    name: '小满',
    gender: 'FEMALE',
    birthDate: '2026-03-01',
    isDefault: true,
    revision: 1,
    createdAt: '2026-10-26T00:00:00.000Z',
    updatedAt: '2026-10-26T00:00:00.000Z',
    deletedAt: null,
    ...partial,
  }
}

describe('baby store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    apiMocks.createBabyRequest.mockReset()
    apiMocks.patchBabyRequest.mockReset()
    apiMocks.deleteBabyRequest.mockReset()
    apiMocks.fetchBabies.mockReset()
    apiMocks.fetchBabies.mockRejectedValue(new ApiError('NETWORK_ERROR', 0, 'offline'))
  })

  it('离线创建：本地落库 + outbox + 默认宝宝', async () => {
    apiMocks.createBabyRequest.mockRejectedValue(new ApiError('NETWORK_ERROR', 0, 'offline'))
    const store = useBabyStore()

    const baby = await store.createBaby({
      name: ' 小满 ',
      gender: 'FEMALE',
      birthDate: '2026-03-01',
    })

    expect(baby.name).toBe('小满')
    expect(baby.revision).toBe(0)
    expect(baby.isDefault).toBe(true)
    expect(store.babies).toHaveLength(1)
    expect(store.activeBabyId).toBe(baby.id)

    const cached = await getBabiesCache()
    expect(cached).toHaveLength(1)
    expect(cached[0].id).toBe(baby.id)

    const outbox = await listOutbox()
    expect(outbox).toHaveLength(1)
    expect(outbox[0].entityType).toBe('BABY')
    expect(outbox[0].baseRevision).toBe(0)
    expect(outbox[0].data).toMatchObject({ name: '小满' })
  })

  it('第二个宝宝默认非默认，最多 5 个', async () => {
    apiMocks.createBabyRequest.mockRejectedValue(new ApiError('NETWORK_ERROR', 0, 'offline'))
    const store = useBabyStore()
    await store.createBaby({ name: '大宝', birthDate: '2024-01-01' })
    const second = await store.createBaby({ name: '二宝', birthDate: '2026-01-01' })
    expect(second.isDefault).toBe(false)

    store.babies = Array.from({ length: 5 }, (_, index) =>
      makeBaby({ id: `baby-${index}`, name: `宝宝${index}`, isDefault: index === 0 }),
    )
    await expect(store.createBaby({ name: '六宝', birthDate: '2026-01-01' })).rejects.toThrow(
      '最多只能添加 5 个宝宝',
    )
  })

  it('待同步宝宝的编辑折叠 outbox，删除撤销队列', async () => {
    apiMocks.createBabyRequest.mockRejectedValue(new ApiError('NETWORK_ERROR', 0, 'offline'))
    const store = useBabyStore()
    const baby = await store.createBaby({ name: '小满', birthDate: '2026-03-01' })

    await store.updateBaby(baby.id, { name: '小满满' })
    expect(store.babies[0].name).toBe('小满满')
    const queued = await getOutboxItem(outboxKey('BABY', baby.id))
    expect(queued?.data).toMatchObject({ name: '小满满' })
    expect(await listOutbox()).toHaveLength(1)

    await store.removeBaby(baby.id)
    expect(store.babies).toHaveLength(0)
    expect(await getOutboxItem(outboxKey('BABY', baby.id))).toBeUndefined()
    expect(await listOutbox()).toHaveLength(0)
  })

  it('4xx 创建失败回滚本地状态且不入队', async () => {
    apiMocks.createBabyRequest.mockRejectedValue(
      new ApiError('VALIDATION_ERROR', 400, '昵称不合法'),
    )
    const store = useBabyStore()
    await expect(store.createBaby({ name: '小满', birthDate: '2026-03-01' })).rejects.toThrow(
      '昵称不合法',
    )
    expect(store.babies).toHaveLength(0)
    expect(await listOutbox()).toHaveLength(0)
    expect(await getBabiesCache()).toHaveLength(0)
  })

  it('启动时读取 IndexedDB 缓存', async () => {
    await putBabyCache(makeBaby())
    const store = useBabyStore()
    await store.load()
    expect(store.loaded).toBe(true)
    expect(store.babies).toHaveLength(1)
    expect(store.activeBaby?.name).toBe('小满')
  })

  it('切换默认宝宝', async () => {
    const babyA = makeBaby({ id: 'a', name: 'A', isDefault: true })
    const babyB = makeBaby({ id: 'b', name: 'B', isDefault: false })
    apiMocks.patchBabyRequest.mockResolvedValue({ ...babyB, isDefault: true, revision: 2 })
    const store = useBabyStore()
    store.babies = [babyA, babyB]

    await store.setDefault('b')
    expect(store.babies.find((baby) => baby.id === 'b')?.isDefault).toBe(true)
    expect(store.babies.find((baby) => baby.id === 'a')?.isDefault).toBe(false)
  })

  it('pending 编辑不被服务端旧值覆盖', async () => {
    const local = makeBaby({ id: 'a', name: '本地新名', revision: 1 })
    const store = useBabyStore()
    store.babies = [local]
    await enqueueOutbox({
      entityType: 'BABY',
      entityId: local.id,
      op: 'UPSERT',
      baseRevision: 1,
      data: {
        name: local.name,
        gender: local.gender,
        birthDate: local.birthDate,
        isDefault: local.isDefault,
      },
    })
    apiMocks.fetchBabies.mockResolvedValue([
      makeBaby({ id: 'a', name: '服务端旧名', revision: 1 }),
    ])

    await store.refreshFromServer()

    expect(store.babies[0].name).toBe('本地新名')
    expect((await getBabiesCache())[0].name).toBe('本地新名')
  })

  it('pending DELETE 不被服务端列表复活', async () => {
    const store = useBabyStore()
    store.babies = []
    await enqueueOutbox({
      entityType: 'BABY',
      entityId: 'a',
      op: 'DELETE',
      baseRevision: 1,
    })
    apiMocks.fetchBabies.mockResolvedValue([makeBaby({ id: 'a' })])

    await store.refreshFromServer()

    expect(store.babies).toHaveLength(0)
    expect(await getBabiesCache()).toHaveLength(0)
  })
})
