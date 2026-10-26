<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useBabyStore } from '@/stores/baby'
import { useDeviceStore } from '@/stores/device'
import { useUiStore } from '@/stores/ui'
import { GENDER_LABELS, MAX_BABIES, type Baby } from '@/types/models'
import { calcBabyAge } from '@/utils/date'

const router = useRouter()
const babyStore = useBabyStore()
const deviceStore = useDeviceStore()
const ui = useUiStore()

deviceStore.bootstrap()

const deleteVisible = ref(false)
const deleteTarget = ref<Baby | null>(null)

const pendingBabyCount = computed(
  () => babyStore.babies.filter((baby) => baby.revision === 0).length,
)
const deviceShort = computed(() => deviceStore.deviceId.slice(0, 8) || '--------')

function openAdd(): void {
  if (!babyStore.canAddMore) {
    ui.toast(`最多只能添加 ${MAX_BABIES} 个宝宝`)
    return
  }
  void router.push({ name: 'baby-new' })
}

function openEdit(baby: Baby): void {
  void router.push({ name: 'baby-edit', params: { id: baby.id } })
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
        当前浏览器无法持久保存设备 ID（可能是无痕模式）。关闭无痕模式后才能保留数据。
      </p>
      <p class="device-card__note text-secondary" data-testid="profile-data-warning">
        宝宝与记录绑定当前设备 ID。清除浏览器数据、更换浏览器/设备或丢失设备 ID，
        都会导致本机数据无法找回；离线期间尚未同步的记录也会一并丢失。请勿在无痕模式长期使用。
      </p>
    </section>

    <van-dialog
      v-model:show="deleteVisible"
      title="删除宝宝"
      message="删除后，该宝宝的喂养与生长记录也会一并删除，且无法恢复。"
      show-cancel-button
      confirm-button-text="删除"
      confirm-button-color="#ee0a24"
      @confirm="confirmDelete"
    />
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
</style>
