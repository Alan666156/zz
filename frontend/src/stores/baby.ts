import { defineStore } from 'pinia'
import { ApiError, isRetryableApiError } from '@/api/client'
import {
  createBabyRequest,
  deleteBabyRequest,
  fetchBabies,
  patchBabyRequest,
} from '@/api/babies'
import {
  deleteBabyCache,
  deleteFeedingRecordsByBaby,
  deleteGrowthRecordsByBaby,
  getBabiesCache,
  putBabiesCache,
  replaceBabiesCache,
} from '@/db'
import { enqueueOutbox, outboxKey, pendingOutboxOps, removeOutbox } from '@/db/outbox'
import { MAX_BABIES, type Baby, type BabyInput } from '@/types/models'
import { getStorageItem, removeStorageItem, setStorageItem } from '@/utils/storage'
import { requestSync } from '@/utils/sync-events'
import { uuidV4 } from '@/utils/uuid'
import { validateBabyName, validateBirthDate } from '@/utils/validation'

/** Q-15 固定 key */
export const ACTIVE_BABY_KEY = 'zz.bf.activeBabyId'
const LEGACY_ACTIVE_BABY_KEY = 'zz.activeBabyId'

/** 迁移旧版 key，避免升级后忘记当前宝宝 */
function readStoredActiveBabyId(): string | null {
  const current = getStorageItem(ACTIVE_BABY_KEY)
  if (current) {
    removeStorageItem(LEGACY_ACTIVE_BABY_KEY)
    return current
  }
  const legacy = getStorageItem(LEGACY_ACTIVE_BABY_KEY)
  if (legacy) {
    setStorageItem(ACTIVE_BABY_KEY, legacy)
    removeStorageItem(LEGACY_ACTIVE_BABY_KEY)
    return legacy
  }
  return null
}

function cloneBabies(list: Baby[]): Baby[] {
  return list.map((baby) => ({ ...baby }))
}

function sortBabies(list: Baby[]): Baby[] {
  return list
    .filter((baby) => !baby.deletedAt)
    .sort((a, b) => {
      if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1
      return a.createdAt.localeCompare(b.createdAt)
    })
}

function toSyncData(baby: Baby): Record<string, unknown> {
  return {
    name: baby.name,
    gender: baby.gender,
    birthDate: baby.birthDate,
    isDefault: baby.isDefault,
  }
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

export const useBabyStore = defineStore('baby', {
  state: () => ({
    babies: [] as Baby[],
    activeBabyId: readStoredActiveBabyId(),
    loaded: false,
    loading: false,
    refreshing: false,
    lastError: null as string | null,
  }),

  getters: {
    activeBaby(state): Baby | undefined {
      return (
        state.babies.find((baby) => baby.id === state.activeBabyId) ??
        state.babies.find((baby) => baby.isDefault) ??
        state.babies[0]
      )
    },
    canAddMore(state): boolean {
      return state.babies.length < MAX_BABIES
    },
  },

  actions: {
    ensureActive(): void {
      const stored = getStorageItem(ACTIVE_BABY_KEY)
      const matched = this.babies.find((baby) => baby.id === stored)
      if (matched) {
        this.activeBabyId = matched.id
        return
      }
      const preferred = this.babies.find((baby) => baby.isDefault) ?? this.babies[0]
      if (preferred) {
        this.activeBabyId = preferred.id
        setStorageItem(ACTIVE_BABY_KEY, preferred.id)
      } else {
        this.activeBabyId = null
        removeStorageItem(ACTIVE_BABY_KEY)
      }
    },

    setActiveBaby(id: string): void {
      if (!this.babies.some((baby) => baby.id === id)) return
      this.activeBabyId = id
      setStorageItem(ACTIVE_BABY_KEY, id)
    },

    setList(list: Baby[]): void {
      this.babies = sortBabies(list)
      this.ensureActive()
    },

    upsertLocal(baby: Baby): void {
      const next = this.babies.filter((item) => item.id !== baby.id)
      next.push({ ...baby })
      this.babies = sortBabies(
        baby.isDefault
          ? next.map((item) =>
              item.id === baby.id ? { ...item, isDefault: true } : { ...item, isDefault: false },
            )
          : next,
      )
      this.ensureActive()
    },

    /**
     * 缓存优先加载：先读 IndexedDB 立即渲染，再后台拉服务端。
     * 本地无缓存时等待一次服务端请求（首次安装/清缓存场景）。
     */
    async load(force = false): Promise<void> {
      if (this.loading) return
      if (this.loaded && !force) {
        this.ensureActive()
        return
      }
      this.loading = true
      try {
        const cached = (await getBabiesCache()).filter((baby) => !baby.deletedAt)
        if (cached.length) {
          this.setList(cached)
        }
      } catch {
        // IndexedDB 不可用时继续走网络
      }
      this.loading = false
      this.loaded = true
      this.ensureActive()

      const offline = typeof navigator !== 'undefined' && navigator.onLine === false
      if (this.babies.length === 0 && !offline) {
        await this.refreshFromServer()
      } else {
        void this.refreshFromServer()
      }
    },

    async refreshFromServer(): Promise<void> {
      if (this.refreshing) return
      this.refreshing = true
      try {
        const fetched = await fetchBabies()
        // 以 outbox 未完成项为准：pending 编辑用本地值，pending DELETE 不得被服务端复活
        const pendingOps = await pendingOutboxOps('BABY').catch(
          () => new Map<string, 'UPSERT' | 'DELETE'>(),
        )
        const localById = new Map(this.babies.map((local) => [local.id, local]))
        const serverBabies = fetched
          .filter((server) => pendingOps.get(server.id) !== 'DELETE')
          .map((server) =>
            pendingOps.has(server.id) ? localById.get(server.id) ?? server : server,
          )
        const serverIds = new Set(serverBabies.map((server) => server.id))
        // 保留未同步成功的本地宝宝（revision=0 或 outbox 仍有未完成项）
        const pendingLocal = this.babies.filter(
          (local) =>
            !serverIds.has(local.id) &&
            ((pendingOps.has(local.id) && pendingOps.get(local.id) !== 'DELETE') ||
              local.revision === 0),
        )
        const merged = [...serverBabies, ...pendingLocal]
        this.setList(merged)
        await replaceBabiesCache(merged)
        this.lastError = null
      } catch (error) {
        this.lastError = errorMessage(error, '宝宝列表加载失败')
      } finally {
        this.refreshing = false
      }
    },

    async createBaby(input: BabyInput): Promise<Baby> {
      if (this.babies.length >= MAX_BABIES) {
        throw new Error(`最多只能添加 ${MAX_BABIES} 个宝宝`)
      }
      const nameError = validateBabyName(input.name)
      if (nameError) throw new Error(nameError)
      const birthError = validateBirthDate(input.birthDate)
      if (birthError) throw new Error(birthError)

      const now = new Date().toISOString()
      const localBaby: Baby = {
        id: input.id ?? uuidV4(),
        name: input.name.trim(),
        gender: input.gender ?? 'UNKNOWN',
        birthDate: input.birthDate,
        isDefault: this.babies.length === 0 || input.isDefault === true,
        revision: 0,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      }

      const snapshot = cloneBabies(this.babies)
      this.upsertLocal(localBaby)
      await putBabiesCache(this.babies)

      try {
        const result = await createBabyRequest({
          id: localBaby.id,
          name: localBaby.name,
          gender: localBaby.gender,
          birthDate: localBaby.birthDate,
          isDefault: localBaby.isDefault,
        })
        this.upsertLocal(result.baby)
        await putBabiesCache(this.babies)
        await removeOutbox(outboxKey('BABY', localBaby.id))
        this.lastError = null
        return result.baby
      } catch (error) {
        if (!isRetryableApiError(error)) {
          this.babies = snapshot
          this.ensureActive()
          await replaceBabiesCache(snapshot)
          throw error
        }
        await enqueueOutbox({
          entityType: 'BABY',
          entityId: localBaby.id,
          op: 'UPSERT',
          baseRevision: 0,
          data: toSyncData(localBaby),
        })
        this.lastError = errorMessage(error, '网络异常，宝宝已保存到本机')
        requestSync()
        return localBaby
      }
    },

    async updateBaby(id: string, patch: Partial<BabyInput>): Promise<Baby> {
      const current = this.babies.find((baby) => baby.id === id)
      if (!current) throw new Error('宝宝不存在')

      if (patch.name !== undefined) {
        const nameError = validateBabyName(patch.name)
        if (nameError) throw new Error(nameError)
      }
      if (patch.birthDate !== undefined) {
        const birthError = validateBirthDate(patch.birthDate)
        if (birthError) throw new Error(birthError)
      }

      const updated: Baby = {
        ...current,
        name: patch.name !== undefined ? patch.name.trim() : current.name,
        gender: patch.gender ?? current.gender,
        birthDate: patch.birthDate ?? current.birthDate,
        isDefault: patch.isDefault ?? current.isDefault,
        updatedAt: new Date().toISOString(),
      }

      const snapshot = cloneBabies(this.babies)
      this.upsertLocal(updated)
      await putBabiesCache(this.babies)

      // 从未同步成功的宝宝：继续以 baseRevision=0 折叠在 outbox 中
      if (current.revision === 0) {
        await enqueueOutbox({
          entityType: 'BABY',
          entityId: id,
          op: 'UPSERT',
          baseRevision: 0,
          data: toSyncData(updated),
        })
        return updated
      }

      try {
        const payload: Record<string, unknown> = { baseRevision: current.revision }
        if (patch.name !== undefined) payload.name = updated.name
        if (patch.gender !== undefined) payload.gender = updated.gender
        if (patch.birthDate !== undefined) payload.birthDate = updated.birthDate
        if (patch.isDefault !== undefined) payload.isDefault = updated.isDefault
        const serverBaby = await patchBabyRequest(id, payload)
        this.upsertLocal(serverBaby)
        await putBabiesCache(this.babies)
        await removeOutbox(outboxKey('BABY', id))
        this.lastError = null
        // 设为默认时服务端会同时递增旧默认宝宝的 revision，本地只有被 PATCH 的那条是新的；
        // 不重新拉取会导致之后编辑旧默认宝宝 409（FE-06）。
        if (patch.isDefault === true) await this.refreshFromServer()
        return this.babies.find((baby) => baby.id === id) ?? serverBaby
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) {
          // 在线 PATCH 已删除宝宝 → 404，从本机移除（契约 Q-06）
          await this.applySyncedBabyDeletion(id)
          throw new Error('宝宝已不存在，已从本机移除')
        }
        if (!isRetryableApiError(error)) {
          this.babies = snapshot
          this.ensureActive()
          await replaceBabiesCache(snapshot)
          throw error
        }
        await enqueueOutbox({
          entityType: 'BABY',
          entityId: id,
          op: 'UPSERT',
          baseRevision: current.revision,
          data: toSyncData(updated),
        })
        this.lastError = errorMessage(error, '网络异常，修改已保存到本机')
        requestSync()
        return updated
      }
    },

    async setDefault(id: string): Promise<Baby> {
      return this.updateBaby(id, { isDefault: true })
    },

    async removeBaby(id: string): Promise<void> {
      const current = this.babies.find((baby) => baby.id === id)
      if (!current) return
      const snapshot = cloneBabies(this.babies)

      this.babies = this.babies.filter((baby) => baby.id !== id)
      if (current.isDefault) {
        const remaining = [...this.babies].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        const nextDefaultId = remaining[0]?.id
        if (nextDefaultId) {
          this.babies = this.babies.map((baby) =>
            baby.id === nextDefaultId ? { ...baby, isDefault: true } : { ...baby, isDefault: false },
          )
        }
      }
      this.ensureActive()
      await deleteBabyCache(id)
      await deleteFeedingRecordsByBaby(id)
      await deleteGrowthRecordsByBaby(id)
      await replaceBabiesCache(this.babies)

      const key = outboxKey('BABY', id)
      // 本地新建尚未同步：直接撤销，无需通知服务端
      if (current.revision === 0) {
        await removeOutbox(key)
        return
      }

      try {
        await deleteBabyRequest(id, current.revision)
        await removeOutbox(key)
        this.lastError = null
        // 删除默认宝宝时服务端会提升另一个宝宝并递增其 revision，重新拉取对齐（FE-06）
        if (current.isDefault) await this.refreshFromServer()
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) {
          await removeOutbox(key)
          return
        }
        if (!isRetryableApiError(error)) {
          this.babies = snapshot
          this.ensureActive()
          await replaceBabiesCache(snapshot)
          throw error
        }
        await enqueueOutbox({
          entityType: 'BABY',
          entityId: id,
          op: 'DELETE',
          baseRevision: current.revision,
        })
        this.lastError = errorMessage(error, '网络异常，删除将在联网后同步')
        requestSync()
      }
    },

    /** sync 结果覆盖本地宝宝（APPLIED / DUPLICATE / CONFLICT_SERVER_WINS） */
    async applySyncedBaby(baby: Baby): Promise<void> {
      if (baby.deletedAt) {
        await this.applySyncedBabyDeletion(baby.id)
        return
      }
      this.upsertLocal(baby)
      try {
        await putBabiesCache(this.babies)
      } catch {
        // 缓存失败不影响 Pinia
      }
      // 服务端设默认时会递增旧默认宝宝的 revision；异步全量对齐，避免之后编辑旧默认宝宝 409（FE-06）
      if (baby.isDefault) void this.refreshFromServer()
    },

    /** sync tombstone：宝宝及其记录一并从本地清除，绝不复活 */
    async applySyncedBabyDeletion(id: string): Promise<void> {
      this.babies = this.babies.filter((baby) => baby.id !== id)
      this.ensureActive()
      try {
        await deleteBabyCache(id)
      } catch {
        // 忽略
      }
      try {
        await deleteFeedingRecordsByBaby(id)
      } catch {
        // 忽略
      }
      try {
        await deleteGrowthRecordsByBaby(id)
      } catch {
        // 忽略
      }
      try {
        await replaceBabiesCache(this.babies)
      } catch {
        // 忽略
      }
    },
  },
})
