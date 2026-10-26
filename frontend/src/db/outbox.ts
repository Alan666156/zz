import { getDb } from './index'
import type { OutboxItem, SyncEntityType, SyncOp } from '@/types/models'

export function outboxKey(entityType: SyncEntityType, entityId: string): string {
  return `${entityType}:${entityId}`
}

/** Vue reactive proxy 不能直接写入 IndexedDB */
function toPlain<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

interface EnqueueInput {
  entityType: SyncEntityType
  entityId: string
  op: SyncOp
  baseRevision: number
  data?: Record<string, unknown>
  now?: Date
}

export type EnqueueResult = 'queued' | 'cancelled'

/**
 * 入队/折叠规则（契约 5.4）：
 * - 同一记录多次编辑折叠为一条 UPSERT，baseRevision 保持第一次入队的值；
 * - 新建（baseRevision=0）尚未同步就删除：直接撤销 outbox，不通知服务端；
 * - 已同步记录删除：保留一条 DELETE。
 */
export async function enqueueOutbox(input: EnqueueInput): Promise<EnqueueResult> {
  const db = await getDb()
  const key = outboxKey(input.entityType, input.entityId)
  const existing = await db.get('outbox', key)
  const nowIso = (input.now ?? new Date()).toISOString()

  if (input.op === 'DELETE') {
    if (existing && existing.baseRevision === 0) {
      await db.delete('outbox', key)
      return 'cancelled'
    }
    await db.put(
      'outbox',
      toPlain({
        key,
        entityType: input.entityType,
        entityId: input.entityId,
        op: 'DELETE',
        baseRevision: existing ? existing.baseRevision : input.baseRevision,
        createdAt: existing?.createdAt ?? nowIso,
        nextRetryAt: nowIso,
        attemptCount: existing?.attemptCount ?? 0,
      }),
    )
    return 'queued'
  }

  if (existing) {
    const merged: OutboxItem = {
      ...existing,
      op: 'UPSERT',
      data: input.data,
      nextRetryAt: nowIso,
    }
    await db.put('outbox', toPlain(merged))
    return 'queued'
  }

  await db.put(
    'outbox',
    toPlain({
      key,
      entityType: input.entityType,
      entityId: input.entityId,
      op: 'UPSERT',
      baseRevision: input.baseRevision,
      data: input.data,
      createdAt: nowIso,
      nextRetryAt: nowIso,
      attemptCount: 0,
    }),
  )
  return 'queued'
}

export async function getOutboxItem(key: string): Promise<OutboxItem | undefined> {
  const db = await getDb()
  return db.get('outbox', key)
}

export async function removeOutbox(key: string): Promise<void> {
  const db = await getDb()
  await db.delete('outbox', key)
}

const ENTITY_PRIORITY: Record<SyncEntityType, number> = {
  BABY: 0,
  FEEDING_RECORD: 1,
  GROWTH_RECORD: 2,
}

/** 同步顺序：BABY 优先，其次 createdAt 升序 */
export async function listOutbox(): Promise<OutboxItem[]> {
  const db = await getDb()
  const items = await db.getAll('outbox')
  return items.sort((a, b) => {
    const priority = ENTITY_PRIORITY[a.entityType] - ENTITY_PRIORITY[b.entityType]
    if (priority !== 0) return priority
    return a.createdAt.localeCompare(b.createdAt)
  })
}

export async function countOutbox(entityType?: SyncEntityType): Promise<number> {
  const db = await getDb()
  const items = await db.getAll('outbox')
  if (!entityType) return items.length
  return items.filter((item) => item.entityType === entityType).length
}
