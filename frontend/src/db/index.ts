import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type {
  Baby,
  FeedingRecord,
  GrowthRecord,
  MetaEntry,
  OutboxItem,
} from '@/types/models'

export const DB_NAME = 'zz-baby-feeding'
export const DB_VERSION = 1

export interface ZzDb extends DBSchema {
  outbox: {
    key: string
    value: OutboxItem
    indexes: { nextRetryAt: string; createdAt: string }
  }
  babies: {
    key: string
    value: Baby
  }
  feedingRecords: {
    key: string
    value: FeedingRecord
    indexes: { byBabyDate: [string, string]; byBaby: string }
  }
  growthRecords: {
    key: string
    value: GrowthRecord
    indexes: { byBabyDate: [string, string]; byBaby: string }
  }
  meta: {
    key: string
    value: MetaEntry
  }
}

/**
 * Pinia state 是 Vue reactive proxy，直接写入 IndexedDB 会抛 DataCloneError。
 * 统一在持久层边界转为普通对象。
 */
function toPlain<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

let dbPromise: Promise<IDBPDatabase<ZzDb>> | null = null

export function getDb(): Promise<IDBPDatabase<ZzDb>> {
  if (!dbPromise) {
    dbPromise = openDB<ZzDb>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('outbox')) {
          const store = db.createObjectStore('outbox', { keyPath: 'key' })
          store.createIndex('nextRetryAt', 'nextRetryAt')
          store.createIndex('createdAt', 'createdAt')
        }
        if (!db.objectStoreNames.contains('babies')) {
          db.createObjectStore('babies', { keyPath: 'id' })
        }
        if (!db.objectStoreNames.contains('feedingRecords')) {
          const store = db.createObjectStore('feedingRecords', { keyPath: 'id' })
          store.createIndex('byBabyDate', ['babyId', 'recordDate'])
          store.createIndex('byBaby', 'babyId')
        }
        if (!db.objectStoreNames.contains('growthRecords')) {
          const store = db.createObjectStore('growthRecords', { keyPath: 'id' })
          store.createIndex('byBabyDate', ['babyId', 'measuredOn'])
          store.createIndex('byBaby', 'babyId')
        }
        if (!db.objectStoreNames.contains('meta')) {
          db.createObjectStore('meta', { keyPath: 'key' })
        }
      },
    })
  }
  return dbPromise
}

export async function closeDb(): Promise<void> {
  if (!dbPromise) return
  const db = await dbPromise
  db.close()
  dbPromise = null
}

export async function putBabyCache(baby: Baby): Promise<void> {
  const db = await getDb()
  await db.put('babies', toPlain(baby))
}

export async function putBabiesCache(babies: Baby[]): Promise<void> {
  const db = await getDb()
  const tx = db.transaction('babies', 'readwrite')
  await Promise.all(babies.map((baby) => tx.store.put(toPlain(baby))))
  await tx.done
}

export async function getBabiesCache(): Promise<Baby[]> {
  const db = await getDb()
  return db.getAll('babies')
}

/** 用服务端快照替换本地宝宝缓存（保留调用方传入的本地待同步项） */
export async function replaceBabiesCache(babies: Baby[]): Promise<void> {
  const db = await getDb()
  const tx = db.transaction('babies', 'readwrite')
  await tx.store.clear()
  await Promise.all(babies.map((baby) => tx.store.put(toPlain(baby))))
  await tx.done
}

export async function deleteBabyCache(id: string): Promise<void> {
  const db = await getDb()
  await db.delete('babies', id)
}

export async function putFeedingRecordCache(record: FeedingRecord): Promise<void> {
  const db = await getDb()
  await db.put('feedingRecords', toPlain(record))
}

export async function putFeedingRecordsCache(records: FeedingRecord[]): Promise<void> {
  const db = await getDb()
  const tx = db.transaction('feedingRecords', 'readwrite')
  await Promise.all(records.map((record) => tx.store.put(toPlain(record))))
  await tx.done
}

export async function getFeedingRecordsByBabyDate(
  babyId: string,
  recordDate: string,
): Promise<FeedingRecord[]> {
  const db = await getDb()
  return db.getAllFromIndex('feedingRecords', 'byBabyDate', [babyId, recordDate])
}

/** 统计离线计算用：闭区间取本地缓存喂养记录 */
export async function getFeedingRecordsByBabyRange(
  babyId: string,
  from: string,
  to: string,
): Promise<FeedingRecord[]> {
  const db = await getDb()
  return db.getAllFromIndex(
    'feedingRecords',
    'byBabyDate',
    IDBKeyRange.bound([babyId, from], [babyId, to]),
  )
}

export async function getFeedingRecordCache(id: string): Promise<FeedingRecord | undefined> {
  const db = await getDb()
  return db.get('feedingRecords', id)
}

export async function deleteFeedingRecordCache(id: string): Promise<void> {
  const db = await getDb()
  await db.delete('feedingRecords', id)
}

export async function deleteFeedingRecordsByBaby(babyId: string): Promise<void> {
  const db = await getDb()
  const tx = db.transaction('feedingRecords', 'readwrite')
  const index = tx.store.index('byBaby')
  let cursor = await index.openCursor(babyId)
  while (cursor) {
    await cursor.delete()
    cursor = await cursor.continue()
  }
  await tx.done
}

export async function putGrowthRecordCache(record: GrowthRecord): Promise<void> {
  const db = await getDb()
  await db.put('growthRecords', toPlain(record))
}

export async function getGrowthRecordCache(id: string): Promise<GrowthRecord | undefined> {
  const db = await getDb()
  return db.get('growthRecords', id)
}

export async function deleteGrowthRecordCache(id: string): Promise<void> {
  const db = await getDb()
  await db.delete('growthRecords', id)
}

export async function deleteGrowthRecordsByBaby(babyId: string): Promise<void> {
  const db = await getDb()
  const tx = db.transaction('growthRecords', 'readwrite')
  const index = tx.store.index('byBaby')
  let cursor = await index.openCursor(babyId)
  while (cursor) {
    await cursor.delete()
    cursor = await cursor.continue()
  }
  await tx.done
}

export async function getGrowthRecordsByBaby(babyId: string): Promise<GrowthRecord[]> {
  const db = await getDb()
  return db.getAllFromIndex('growthRecords', 'byBaby', babyId)
}

export async function getGrowthRecordsByBabyRange(
  babyId: string,
  from: string,
  to: string,
): Promise<GrowthRecord[]> {
  const db = await getDb()
  return db.getAllFromIndex(
    'growthRecords',
    'byBabyDate',
    IDBKeyRange.bound([babyId, from], [babyId, to]),
  )
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  const db = await getDb()
  await db.put('meta', toPlain({ key, value, updatedAt: new Date().toISOString() }))
}

export async function getMeta<T>(key: string): Promise<T | undefined> {
  const db = await getDb()
  const entry = await db.get('meta', key)
  return entry?.value as T | undefined
}

/** 测试/调试用：清空所有本地数据（不删库，避免连接阻塞） */
export async function clearAllData(): Promise<void> {
  const db = await getDb()
  const stores = ['outbox', 'babies', 'feedingRecords', 'growthRecords', 'meta'] as const
  const tx = db.transaction(stores, 'readwrite')
  await Promise.all(stores.map((name) => tx.objectStore(name).clear()))
  await tx.done
}
