import { describe, expect, it } from 'vitest'
import {
  countOutbox,
  enqueueOutbox,
  getOutboxItem,
  listOutbox,
  outboxKey,
} from '@/db/outbox'

describe('outbox', () => {
  it('同一记录多次编辑折叠为一条 UPSERT 并保留首次 baseRevision', async () => {
    const entityId = '11111111-1111-4111-8111-111111111111'
    await enqueueOutbox({
      entityType: 'BABY',
      entityId,
      op: 'UPSERT',
      baseRevision: 0,
      data: { name: 'A' },
      now: new Date('2026-10-26T00:00:00Z'),
    })
    await enqueueOutbox({
      entityType: 'BABY',
      entityId,
      op: 'UPSERT',
      baseRevision: 0,
      data: { name: 'B' },
      now: new Date('2026-10-26T00:01:00Z'),
    })

    const items = await listOutbox()
    expect(items).toHaveLength(1)
    expect(items[0].data).toEqual({ name: 'B' })
    expect(items[0].baseRevision).toBe(0)
    expect(items[0].createdAt).toBe('2026-10-26T00:00:00.000Z')
  })

  it('未同步的新建记录删除时直接撤销队列', async () => {
    const entityId = '22222222-2222-4222-8222-222222222222'
    await enqueueOutbox({
      entityType: 'FEEDING_RECORD',
      entityId,
      op: 'UPSERT',
      baseRevision: 0,
      data: { feedType: 'BREAST' },
    })
    const result = await enqueueOutbox({
      entityType: 'FEEDING_RECORD',
      entityId,
      op: 'DELETE',
      baseRevision: 0,
    })
    expect(result).toBe('cancelled')
    expect(await getOutboxItem(outboxKey('FEEDING_RECORD', entityId))).toBeUndefined()
  })

  it('已同步记录删除保留 DELETE 与原 revision', async () => {
    const entityId = '33333333-3333-4333-8333-333333333333'
    await enqueueOutbox({
      entityType: 'GROWTH_RECORD',
      entityId,
      op: 'UPSERT',
      baseRevision: 2,
      data: { heightCm: 68 },
    })
    await enqueueOutbox({
      entityType: 'GROWTH_RECORD',
      entityId,
      op: 'DELETE',
      baseRevision: 2,
    })
    const item = await getOutboxItem(outboxKey('GROWTH_RECORD', entityId))
    expect(item?.op).toBe('DELETE')
    expect(item?.baseRevision).toBe(2)
  })

  it('列表按 BABY 优先、createdAt 升序', async () => {
    await enqueueOutbox({
      entityType: 'FEEDING_RECORD',
      entityId: 'a',
      op: 'UPSERT',
      baseRevision: 0,
      now: new Date('2026-10-26T00:00:00Z'),
    })
    await enqueueOutbox({
      entityType: 'BABY',
      entityId: 'b',
      op: 'UPSERT',
      baseRevision: 0,
      now: new Date('2026-10-26T00:02:00Z'),
    })
    await enqueueOutbox({
      entityType: 'FEEDING_RECORD',
      entityId: 'c',
      op: 'UPSERT',
      baseRevision: 0,
      now: new Date('2026-10-26T00:01:00Z'),
    })

    const items = await listOutbox()
    expect(items.map((item) => item.entityId)).toEqual(['b', 'a', 'c'])
    expect(await countOutbox('FEEDING_RECORD')).toBe(2)
  })
})
