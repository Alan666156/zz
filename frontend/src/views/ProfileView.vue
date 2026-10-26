<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import ExportSheet from '@/components/export/ExportSheet.vue'
import { DATA_LOSS_WARNING, STORAGE_UNAVAILABLE_WARNING } from '@/constants/copy'
import { navigateSafely } from '@/router/route-load-error'
import { useBabyStore } from '@/stores/baby'
import { useDeviceStore } from '@/stores/device'
import { useSyncStore } from '@/stores/sync'
import { useUiStore } from '@/stores/ui'
import { GENDER_LABELS, MAX_BABIES, type Baby } from '@/types/models'
import { calcBabyAge, formatDateTime } from '@/utils/date'

const router = useRouter()
const babyStore = useBabyStore()
const deviceStore = useDeviceStore()
const syncStore = useSyncStore()
const ui = useUiStore()

deviceStore.bootstrap()
void syncStore.refreshPending()

const deleteVisible = ref(false)
const deleteTarget = ref<Baby | null>(null)
const exportVisible = ref(false)

const pendingBabyCount = computed(
  () => babyStore.babies.filter((baby) => baby.revision === 0).length,
)
const deviceShort = computed(() => deviceStore.deviceId.slice(0, 8) || '--------')
const activeBaby = computed(() => babyStore.activeBaby ?? null)
const lastSyncedLabel = computed(() =>
  syncStore.lastSyncedAt ? formatDateTime(syncStore.lastSyncedAt) : '—',
)

async function manualSync(): Promise<void> {
  const outcome = await syncStore.syncNow()
  if (outcome.status === 'offline') {
    ui.toast('当前离线，联网后自动同步')
  } else if (outcome.status === 'busy') {
    ui.toast('同步进行中，请稍候')
  } else if (outcome.status === 'error') {
    ui.toast(outcome.message ?? '同步失败，请稍后重试')
  } else if (outcome.applied + outcome.duplicate > 0) {
    ui.toast(`同步完成，已同步 ${outcome.applied + outcome.duplicate} 条`)
  } else {
    ui.toast(outcome.pending > 0 ? '仍有记录待同步' : '没有待同步记录')
  }
}

function openExport(): void {
  if (!activeBaby.value) {
    ui.toast('请先创建宝宝档案')
    return
  }
  exportVisible.value = true
}

function openAdd(): void {
  if (!babyStore.canAddMore) {
    ui.toast(`最多只能添加 ${MAX_BABIES} 个宝宝`)
    return
  }
  void navigateSafely(router, { name: 'baby-new' })
}

function openEdit(baby: Baby): void {
  void navigateSafely(router, { name: 'baby-edit', params: { id: baby.id } })
}

function openDelete(baby: Baby): void {
  deleteTarget.value = baby
  deleteVisible.value = true
}

async function setDefault(baby: Baby): Promise<void> {
  if (baby.isDefault) return
  try {
    await babyStore.setDefault(baby.id)
    ui.toast('已设为默认宝宝')
  } catch (error) {
    ui.toast(error instanceof Error ? error.message : '设置失败')
  }
}

async function confirmDelete(): Promise<void> {
  const target = deleteTarget.value
  if (!target) return
  try {
    await babyStore.removeBaby(target.id)
    ui.toast('已删除')
  } catch (error) {
    ui.toast(error instanceof Error ? error.message : '删除失败')
  } finally {
    deleteTarget.value = null
  }
}

function handleConfirmDelete(): void {
  deleteVisible.value = false
  void confirmDelete()
}
</script>

<template>
  <div class="page">
    <section class="profile-hero card">
      <div>
        <p class="profile-hero__title">我的</p>
        <p class="profile-hero__desc">
          匿名设备模式，无需注册。当前设备共 {{ babyStore.babies.length }} 个宝宝。
        </p>
      </div>
    </section>

    <div class="section-title flex-between">
      <span>宝宝档案</span>
      <span class="text-secondary profile-count">
        {{ babyStore.babies.length }}/{{ MAX_BABIES }}
      </span>
    </div>

    <section class="baby-list">
      <article
        v-for="baby in babyStore.babies"
        :key="baby.id"
        class="baby-row card"
        data-testid="profile-baby-row"
      >
        <button type="button" class="baby-row__main" @click="openEdit(baby)">
          <span class="baby-row__name">
            {{ baby.name }}
            <van-tag v-if="baby.isDefault" type="primary" plain>默认</van-tag>
            <van-tag v-if="baby.revision === 0" color="#fff7e6" text-color="#ad6800">待同步</van-tag>
          </span>
          <span class="baby-row__meta">
            {{ GENDER_LABELS[baby.gender] }} · {{ calcBabyAge(baby.birthDate).label }} ·
            {{ baby.birthDate }}
          </span>
        </button>
        <div class="baby-row__actions">
          <van-button
            v-if="!baby.isDefault"
            size="mini"
            plain
            type="primary"
            data-testid="profile-set-default"
            @click="setDefault(baby)"
          >
            设默认
          </van-button>
          <van-button
            size="mini"
            plain
            data-testid="profile-edit-baby"
            @click="openEdit(baby)"
          >
            编辑
          </van-button>
          <van-button
            size="mini"
            plain
            type="danger"
            data-testid="profile-delete-baby"
            @click="openDelete(baby)"
          >
            删除
          </van-button>
        </div>
      </article>

      <van-button
        class="baby-list__add"
        block
        round
        plain
        type="primary"
        :disabled="!babyStore.canAddMore"
        data-testid="profile-add-baby"
        @click="openAdd"
      >
        {{ babyStore.canAddMore ? '添加宝宝' : '已达 5 个宝宝上限' }}
      </van-button>
    </section>

    <div class="section-title">同步状态</div>
    <section class="card device-card" data-testid="profile-sync-status">
      <div class="device-card__row">
        <span class="text-secondary">网络</span>
        <span class="device-card__value">{{ syncStore.online ? '在线' : '离线' }}</span>
      </div>
      <div class="device-card__row">
        <span class="text-secondary">待同步</span>
        <span class="device-card__value">{{ syncStore.pendingCount }} 条</span>
      </div>
      <div v-if="syncStore.failedCount > 0" class="device-card__row">
        <span class="text-secondary">同步失败</span>
        <span class="device-card__value device-card__value--danger">
          {{ syncStore.failedCount }} 条
        </span>
      </div>
      <div class="device-card__row">
        <span class="text-secondary">上次同步</span>
        <span class="device-card__value">{{ lastSyncedLabel }}</span>
      </div>
      <p v-if="syncStore.lastError" class="device-card__warning">{{ syncStore.lastError }}</p>
      <p v-if="syncStore.failedCount > 0" class="device-card__note text-secondary">
        同步失败的记录已保留在本机，请打开对应记录修改后重新保存以再次同步。
      </p>
      <van-button
        block
        round
        plain
        type="primary"
        size="small"
        :loading="syncStore.syncing"
        data-testid="profile-sync-now"
        @click="manualSync"
      >
        立即同步
      </van-button>
    </section>

    <div class="section-title">数据导出</div>
    <section class="card device-card">
      <p class="device-card__note text-secondary">
        导出当前宝宝的喂养记录为 CSV（UTF-8 BOM，Excel 可直接打开）。导出为只读操作，不影响本机数据。
      </p>
      <van-button
        block
        round
        type="primary"
        size="small"
        :disabled="!activeBaby"
        data-testid="profile-export"
        @click="openExport"
      >
        导出喂养记录
      </van-button>
      <p class="device-card__note text-secondary">下载链接由服务端签发，5 分钟内有效。</p>
    </section>

    <div class="section-title">设备与数据</div>
    <section class="card device-card">
      <div class="device-card__row">
        <span class="text-secondary">设备 ID</span>
        <span class="device-card__value">{{ deviceShort }}…</span>
      </div>
      <div class="device-card__row">
        <span class="text-secondary">待同步宝宝</span>
        <span class="device-card__value">{{ pendingBabyCount }}</span>
      </div>
      <div class="device-card__row">
        <span class="text-secondary">版本</span>
        <span class="device-card__value">1.0.0</span>
      </div>
      <p v-if="!deviceStore.storageAvailable" class="device-card__warning">
        {{ STORAGE_UNAVAILABLE_WARNING }}
      </p>
      <p class="device-card__note text-secondary" data-testid="profile-data-warning">
        {{ DATA_LOSS_WARNING }}
      </p>
    </section>

    <ExportSheet v-model:show="exportVisible" :baby="activeBaby" />

    <van-dialog
      v-model:show="deleteVisible"
      title="删除宝宝"
      message="删除后，该宝宝的喂养与生长记录也会一并删除，且无法恢复。"
      show-cancel-button
      @confirm="handleConfirmDelete"
    >
      <template #footer>
        <div class="dialog-actions">
          <van-button
            class="dialog-actions__btn"
            size="large"
            data-testid="cancel-delete"
            @click="deleteVisible = false"
          >
            取消
          </van-button>
          <van-button
            class="dialog-actions__btn"
            size="large"
            type="danger"
            data-testid="confirm-delete"
            @click="handleConfirmDelete"
          >
            删除
          </van-button>
        </div>
      </template>
    </van-dialog>
  </div>
</template>

<style scoped>
.profile-hero {
  background: linear-gradient(135deg, #fff2ec 0%, #ffffff 80%);
}

.profile-hero__title {
  margin: 0;
  font-size: 22px;
  font-weight: 700;
}

.profile-hero__desc {
  margin: 8px 0 0;
  font-size: 13px;
  line-height: 1.6;
  color: var(--app-text-secondary);
}

.profile-count {
  font-size: 12px;
  font-weight: 400;
}

.baby-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.baby-row {
  padding: 12px 14px;
}

.baby-row__main {
  display: flex;
  width: 100%;
  flex-direction: column;
  gap: 5px;
  padding: 0;
  border: 0;
  background: transparent;
  text-align: left;
  font: inherit;
  color: inherit;
}

.baby-row__name {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 16px;
  font-weight: 600;
}

.baby-row__meta {
  font-size: 12px;
  color: var(--app-text-secondary);
}

.baby-row__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 10px;
}

.baby-list__add {
  margin-top: 4px;
}

.device-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.device-card__row {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
}

.device-card__value {
  font-weight: 500;
}

.device-card__value--danger {
  color: #ee0a24;
}

.device-card__warning {
  margin: 4px 0 0;
  font-size: 12px;
  line-height: 1.6;
  color: #ad6800;
}

.device-card__note {
  margin: 4px 0 0;
  font-size: 12px;
  line-height: 1.6;
}

/* 自定义 footer 才能给删除按钮挂 testid，Vant 默认按钮无 attrs 入口 */
.dialog-actions {
  display: flex;
  gap: 8px;
  padding: 0 16px 16px;
}

.dialog-actions__btn {
  flex: 1;
}
</style>
