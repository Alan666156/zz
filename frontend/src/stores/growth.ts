import { defineStore } from 'pinia'
import { ApiError, isRetryableApiError } from '@/api/client'
import {
  createGrowthRecordRequest,
  deleteGrowthRecordRequest,
  listGrowthRecords,
  patchGrowthRecordRequest,
} from '@/api/growth'
import {
  deleteGrowthRecordCache,
  getGrowthRecordsByBaby,
  putGrowthRecordCache,
} from '@/db'
import {
  enqueueOutbox,
  listOutbox,
  outboxKey,
  pendingOutboxOps,
  removeOutbox,
} from '@/db/outbox'
import type { GrowthRecord, GrowthRecordInput } from '@/types/models'
import {
  latestGrowthRecord,
  sortGrowthRecordsDesc,
  toGrowthSyncData,
  validateGrowthInput,
} from '@/utils/growth'
import { requestSync } from '@/utils/sync-events'
import { uuidV4 } from '@/utils/uuid'

export type GrowthMutationStatus = 'synced' | 'pending' | 'conflict' | 'failed'

export interface GrowthMutationOutcome {
  status: GrowthMutationStatus
  record?: GrowthRecord
  message?: string
}

function byId(records: GrowthRecord[]): GrowthRecord[] {
  const map = new Map<string, GrowthRecord>()
  for (const record of records) {
    map.set(record.id, record)
  }
  return [...map.values()]
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

/** 在线 GET/PATCH/POST 已软删除记录 → 404（契约 Q-05/Q-06） */
function isNotFoundError(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 404 || error.code === 'NOT_FOUND')
}

/** 409 CONFLICT 的 data.current 是服务端最新记录 */
function conflictCurrent(error: unknown): GrowthRecord | null {
  if (!(error instanceof ApiError) || error.code !== 'CONFLICT') return null
  const data = error.data as { current?: GrowthRecord | null } | null | undefined
  return data?.current ?? null
}

function buildLocalGrowthRecord(
  input: GrowthRecordInput,
  babyId: string,
  now: Date = new Date(),
): GrowthRecord {
  const timestamp = now.toISOString()
  return {
    id: input.id ?? uuidV4(),
    babyId,
    measuredOn: input.measuredOn,
    heightCm: input.heightCm ?? null,
    weightKg: input.weightKg ?? null,
    headCircumferenceCm: input.headCircumferenceCm ?? null,
    note: input.note?.trim() ? input.note.trim() : null,
    revision: 0,
    createdAt: timestamp,
    updatedAt: timestamp,
    deletedAt: null,
  }
}

function buildUpdatedGrowthRecord(
  record: GrowthRecord,
  input: GrowthRecordInput,
  now: Date = new Date(),
): GrowthRecord {
  return {
    ...record,
    measuredOn: input.measuredOn,
    heightCm: input.heightCm ?? null,
    weightKg: input.weightKg ?? null,
    headCircumferenceCm: input.headCircumferenceCm ?? null,
    note: input.note?.trim() ? input.note.trim() : null,
    updatedAt: now.toISOString(),
  }
}

function patchPayload(record: GrowthRecord): Record<string, unknown> {
  return {
    baseRevision: record.revision,
    measuredOn: record.measuredOn,
    heightCm: record.heightCm,
    weightKg: record.weightKg,
    headCircumferenceCm: record.headCircumferenceCm,
    note: record.note,
  }
}

export const useGrowthStore = defineStore('growth', {
  state: () => ({
    records: [] as GrowthRecord[],
    currentBabyId: null as string | null,
    loading: false,
    offline: false,
    pendingCount: 0,
    pendingIds: [] as string[],
    loadSeq: 0,
    lastError: null as string | null,
    /** 本机缓存写入失败：记录仅保留在 Pinia，刷新后可能丢失（FE-08） */
    cacheDegraded: false,
  }),

  getters: {
    sortedRecords(state): GrowthRecord[] {
      return sortGrowthRecordsDesc(state.records)
    },
    latest(state): GrowthRecord | null {
      return latestGrowthRecord(state.records)
    },
    hasData(state): boolean {
      return state.records.some((record) => !record.deletedAt)
    },
  },

  actions: {
    mergeRecords(list: GrowthRecord[]): void {
      this.records = sortGrowthRecordsDesc(byId(list))
    },

    async refreshPendingCount(): Promise<void> {
      try {
        const items = await listOutbox()
        const growthItems = items.filter((item) => item.entityType === 'GROWTH_RECORD')
        this.pendingCount = growthItems.length
        this.pendingIds = growthItems.map((item) => item.entityId)
      } catch {
        this.pendingCount = 0
        this.pendingIds = []
      }
    },

    /** 缓存写失败可降级为仅内存，但必须显式标记，不能静默吞掉（FE-08） */
    async persistRecordCache(record: GrowthRecord): Promise<void> {
      try {
        await putGrowthRecordCache(record)
        this.cacheDegraded = false
      } catch {
        this.cacheDegraded = true
        this.lastError = '本机缓存不可用，记录仅在当前页面保留'
      }
    },

    async dropRecordCache(id: string): Promise<void> {
      try {
        await deleteGrowthRecordCache(id)
        this.cacheDegraded = false
      } catch {
        this.cacheDegraded = true
      }
    },

    /**
     * 缓存优先：先展示 IndexedDB，再拉服务端最新 100 条。
     * 服务端失败时保留缓存，并标记当前为离线数据。
     */
    async load(babyId: string): Promise<void> {
      if (!babyId) return
      const seq = this.loadSeq + 1
      this.loadSeq = seq
      this.currentBabyId = babyId
      this.loading = true
      this.offline = false

      const pendingSnapshot = this.records.filter(
        (record) => record.babyId === babyId && record.revision === 0,
      )
      let cached: GrowthRecord[] = []
      try {
        cached = (await getGrowthRecordsByBaby(babyId)).filter((record) => !record.deletedAt)
      } catch {
        cached = []
      }
      if (seq !== this.loadSeq) return
      this.mergeRecords([...cached, ...pendingSnapshot])
      await this.refreshPendingCount()
      if (seq !== this.loadSeq) return

      try {
        const result = await listGrowthRecords({ babyId, page: 1, size: 100 })
        if (seq !== this.loadSeq) return
        // 以 outbox 未完成项为准：pending 编辑用本地值，pending DELETE 不得被服务端复活
        const pendingOps = await pendingOutboxOps('GROWTH_RECORD').catch(
          () => new Map<string, 'UPSERT' | 'DELETE'>(),
        )
        if (seq !== this.loadSeq) return
        const localAll = [...cached, ...pendingSnapshot]
        const localById = new Map(localAll.map((record) => [record.id, record]))
        const serverItems = result.items
          .filter((record) => !record.deletedAt && pendingOps.get(record.id) !== 'DELETE')
          .map((record) =>
            pendingOps.has(record.id) ? localById.get(record.id) ?? record : record,
          )
        const serverIds = new Set(serverItems.map((record) => record.id))
        const pendingLocal = localAll.filter(
          (record) =>
            !serverIds.has(record.id) &&
            ((pendingOps.has(record.id) && pendingOps.get(record.id) !== 'DELETE') ||
              record.revision === 0),
        )
        const merged = [...serverItems, ...pendingLocal]
        this.mergeRecords(merged)
        this.offline = false
        this.lastError = null
        for (const record of merged) {
          try {
            await putGrowthRecordCache(record)
            this.cacheDegraded = false
          } catch {
            // 展示不受影响，但缓存已降级，必须显式标记（FE-08）
            this.cacheDegraded = true
          }
        }
      } catch (error) {
        if (seq !== this.loadSeq) return
        this.mergeRecords([...cached, ...pendingSnapshot])
        this.offline = cached.length > 0
        this.lastError = errorMessage(error, '生长记录加载失败，当前显示本地缓存')
      } finally {
        if (seq === this.loadSeq) {
          this.loading = false
          await this.refreshPendingCount()
        }
      }
    },

    async createRecord(
      input: GrowthRecordInput,
      babyId: string,
      birthDate: string,
    ): Promise<GrowthMutationOutcome> {
      const validationError = validateGrowthInput(input, birthDate)
      if (validationError) throw new Error(validationError)

      const record = buildLocalGrowthRecord(input, babyId)
      await this.persistRecordCache(record)
      try {
        await enqueueOutbox({
          entityType: 'GROWTH_RECORD',
          entityId: record.id,
          op: 'UPSERT',
          baseRevision: 0,
          data: toGrowthSyncData(record),
          babyId: record.babyId,
        })
      } catch {
        // 队列写不进去 = 无法保证刷新后仍在，必须回滚并让调用方提示保存失败（FE-08）
        await deleteGrowthRecordCache(record.id).catch(() => undefined)
        this.cacheDegraded = true
        throw new Error('保存失败，请检查浏览器存储空间后重试')
      }
      if (record.babyId === this.currentBabyId) {
        this.mergeRecords([record, ...this.records])
      }
      await this.refreshPendingCount()

      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        requestSync()
        return { status: 'pending', record, message: '离线，记录待同步' }
      }
      return this.syncRecord(record)
    },

    /**
     * 编辑：本地立即生效并折叠 outbox。
     * 409 冲突按契约使用 data.current 覆盖本地。
     */
    async updateRecord(
      record: GrowthRecord,
      input: GrowthRecordInput,
      birthDate: string,
    ): Promise<GrowthMutationOutcome> {
      const validationError = validateGrowthInput(input, birthDate)
      if (validationError) throw new Error(validationError)

      const updated = buildUpdatedGrowthRecord(record, input)
      await this.persistRecordCache(updated)
      try {
        await enqueueOutbox({
          entityType: 'GROWTH_RECORD',
          entityId: updated.id,
          op: 'UPSERT',
          baseRevision: record.revision,
          data: toGrowthSyncData(updated),
          babyId: updated.babyId,
        })
      } catch {
        // 回滚缓存与 Pinia，不能让用户以为修改已保存（FE-08）
        await putGrowthRecordCache(record).catch(() => {
          this.cacheDegraded = true
        })
        throw new Error('保存失败，请检查浏览器存储空间后重试')
      }
      this.mergeRecords([...this.records, updated])
      await this.refreshPendingCount()

      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        requestSync()
        return { status: 'pending', record: updated, message: '离线，修改待同步' }
      }
      if (record.revision === 0) {
        return this.syncRecord(updated)
      }

      try {
        const server = await patchGrowthRecordRequest(record.id, patchPayload(updated))
        await this.applyServerRecord(server)
        this.lastError = null
        return { status: 'synced', record: server }
      } catch (error) {
        const current = conflictCurrent(error)
        if (current) {
          await this.applyServerRecord(current)
          return {
            status: 'conflict',
            record: current,
            message: '该记录已在其他端更新',
          }
        }
        if (isNotFoundError(error)) {
          await removeOutbox(outboxKey('GROWTH_RECORD', record.id)).catch(() => undefined)
          await this.applySyncedDeletion(record.id)
          this.lastError = '记录已不存在，已从本机移除'
          return { status: 'conflict', message: this.lastError }
        }
        if (isRetryableApiError(error)) {
          this.lastError = errorMessage(error, '网络不可用，修改待同步')
          requestSync()
          return { status: 'pending', record: updated, message: this.lastError }
        }
        await removeOutbox(outboxKey('GROWTH_RECORD', record.id))
        await this.refreshPendingCount()
        this.lastError = errorMessage(error, '保存失败')
        return { status: 'failed', record: updated, message: this.lastError }
      }
    },

    /** 删除：本地立即隐藏；已同步记录带 baseRevision 通知服务端 */
    async deleteRecord(record: GrowthRecord): Promise<GrowthMutationOutcome> {
      await this.dropRecordCache(record.id)
      this.records = this.records.filter((item) => item.id !== record.id)
      try {
        await enqueueOutbox({
          entityType: 'GROWTH_RECORD',
          entityId: record.id,
          op: 'DELETE',
          baseRevision: record.revision,
          babyId: record.babyId,
        })
      } catch {
        // 回滚缓存与 Pinia，删除没有进入队列就不能假装成功（FE-08）
        await putGrowthRecordCache(record).catch(() => {
          this.cacheDegraded = true
        })
        this.mergeRecords([...this.records, record])
        await this.refreshPendingCount()
        throw new Error('删除失败，请检查浏览器存储空间后重试')
      }
      await this.refreshPendingCount()

      if (record.revision === 0) {
        // 新建未同步记录删除后 outbox 已撤销，通知同步层重算横幅「待同步 N 条」（TE04-11）
        requestSync()
        return { status: 'synced' }
      }
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        requestSync()
        return { status: 'pending', message: '离线，删除待同步' }
      }

      try {
        await deleteGrowthRecordRequest(record.id, record.revision)
        await removeOutbox(outboxKey('GROWTH_RECORD', record.id))
        await this.refreshPendingCount()
        this.lastError = null
        return { status: 'synced' }
      } catch (error) {
        const current = conflictCurrent(error)
        if (current) {
          await this.applyServerRecord(current)
          return { status: 'conflict', record: current, message: '该记录已在其他端更新' }
        }
        if (isNotFoundError(error)) {
          await removeOutbox(outboxKey('GROWTH_RECORD', record.id))
          await this.refreshPendingCount()
          return { status: 'synced' }
        }
        if (isRetryableApiError(error)) {
          this.lastError = errorMessage(error, '网络不可用，删除待同步')
          requestSync()
          return { status: 'pending', message: this.lastError }
        }
        await removeOutbox(outboxKey('GROWTH_RECORD', record.id))
        await this.refreshPendingCount()
        this.lastError = errorMessage(error, '删除失败')
        return { status: 'failed', message: this.lastError }
      }
    },

    async applyServerRecord(record: GrowthRecord): Promise<void> {
      try {
        await putGrowthRecordCache(record)
      } catch {
        // 服务端已成功，缓存失败降级为仅内存，但必须显式标记（FE-08）
        this.cacheDegraded = true
      }
      if (record.babyId === this.currentBabyId) {
        this.mergeRecords([...this.records, record])
      }
      try {
        await removeOutbox(outboxKey('GROWTH_RECORD', record.id))
      } catch {
        this.lastError = '本机同步状态更新失败，稍后会自动重试'
      }
      await this.refreshPendingCount()
    },

    /** 单条即时同步（新建/本地待同步编辑） */
    async syncRecord(record: GrowthRecord): Promise<GrowthMutationOutcome> {
      try {
        const result = await createGrowthRecordRequest({
          id: record.id,
          babyId: record.babyId,
          measuredOn: record.measuredOn,
          heightCm: record.heightCm,
          weightKg: record.weightKg,
          headCircumferenceCm: record.headCircumferenceCm,
          note: record.note,
        })
        await this.applyServerRecord(result.record)
        this.lastError = null
        return { status: 'synced', record: result.record }
      } catch (error) {
        if (isNotFoundError(error)) {
          // POST 已删除 id → 404，不复活（契约 Q-05）
          await removeOutbox(outboxKey('GROWTH_RECORD', record.id))
          await this.applySyncedDeletion(record.id)
          this.lastError = '记录已不存在，已从本机移除'
          return { status: 'conflict', record, message: this.lastError }
        }
        if (!isRetryableApiError(error)) {
          await removeOutbox(outboxKey('GROWTH_RECORD', record.id))
          this.lastError = errorMessage(error, '记录同步失败')
          await this.refreshPendingCount()
          return { status: 'failed', record, message: this.lastError }
        }
        this.lastError = errorMessage(error, '网络不可用，记录待同步')
        requestSync()
        await this.refreshPendingCount()
        return { status: 'pending', record, message: this.lastError }
      }
    },

    /** 同步结果直接覆盖本地（APPLIED / DUPLICATE / CONFLICT_SERVER_WINS） */
    async applySyncedRecord(record: GrowthRecord): Promise<void> {
      if (record.deletedAt) {
        await this.applySyncedDeletion(record.id)
        return
      }
      try {
        await putGrowthRecordCache(record)
        this.cacheDegraded = false
      } catch {
        // 缓存失败不影响 Pinia，但必须显式标记（FE-08）
        this.cacheDegraded = true
      }
      const known = this.records.some((item) => item.id === record.id)
      if (known || record.babyId === this.currentBabyId) {
        this.mergeRecords([...this.records, record])
      }
      await this.refreshPendingCount()
    },

    /** tombstone / 在线 404：从缓存与内存中移除，绝不复活 */
    async applySyncedDeletion(id: string): Promise<void> {
      try {
        await deleteGrowthRecordCache(id)
      } catch {
        // 删除失败会让记录在刷新后复活，必须显式标记（FE-08）
        this.cacheDegraded = true
      }
      this.records = this.records.filter((item) => item.id !== id)
      await this.refreshPendingCount()
    },

    removeBabyRecords(babyId: string): void {
      this.records = this.records.filter((item) => item.babyId !== babyId)
    },
  },
})
