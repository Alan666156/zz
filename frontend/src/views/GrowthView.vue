<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import GrowthChart from '@/components/chart/GrowthChart.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import GrowthForm from '@/components/growth/GrowthForm.vue'
import { useBabyStore } from '@/stores/baby'
import { useGrowthStore } from '@/stores/growth'
import { useUiStore } from '@/stores/ui'
import type { GrowthMetric, GrowthRecord } from '@/types/models'
import {
  buildGrowthTrend,
  formatGrowthMetric,
  latestGrowthValue,
} from '@/utils/growth'

const babyStore = useBabyStore()
const growthStore = useGrowthStore()
const ui = useUiStore()

const metric = ref<GrowthMetric>('height')
const formVisible = ref(false)
const editTarget = ref<GrowthRecord | null>(null)
const deleteVisible = ref(false)
const deleteTarget = ref<GrowthRecord | null>(null)

const metricOptions: Array<{ value: GrowthMetric; label: string }> = [
  { value: 'height', label: '身高' },
  { value: 'weight', label: '体重' },
  { value: 'head', label: '头围' },
]

const activeBaby = computed(() => babyStore.activeBaby)
const records = computed(() => growthStore.sortedRecords)
const trendPoints = computed(() => buildGrowthTrend(growthStore.records))
const latestHeight = computed(() => latestGrowthValue(growthStore.records, 'height'))
const latestWeight = computed(() => latestGrowthValue(growthStore.records, 'weight'))
const latestHead = computed(() => latestGrowthValue(growthStore.records, 'head'))
const latestDate = computed(() => growthStore.latest?.measuredOn ?? '')

async function load(): Promise<void> {
  const baby = activeBaby.value
  if (!baby) return
  await growthStore.load(baby.id)
}

babyStore.ensureActive()

watch(
  () => activeBaby.value?.id,
  () => {
    void load()
  },
  { immediate: true },
)

function openCreate(): void {
  editTarget.value = null
  formVisible.value = true
}

function openEdit(record: GrowthRecord): void {
  editTarget.value = record
  formVisible.value = true
}

function openDelete(record: GrowthRecord): void {
  deleteTarget.value = record
  deleteVisible.value = true
}

function isPending(record: GrowthRecord): boolean {
  return growthStore.pendingIds.includes(record.id)
}

async function confirmDelete(): Promise<void> {
  const target = deleteTarget.value
  if (!target) return
  try {
    const outcome = await growthStore.deleteRecord(target)
    if (outcome.status === 'synced') {
      ui.toast('已删除')
    } else {
      ui.toast(outcome.message ?? '删除待同步')
    }
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
  <div class="page growth" data-testid="growth-page">
    <section class="growth__hero card">
      <div>
        <p class="growth__title">生长</p>
        <p class="growth__desc">
          {{ activeBaby ? `${activeBaby.name} 的身高、体重与头围` : '还没有宝宝档案' }}
        </p>
      </div>
      <van-button
        type="primary"
        size="small"
        round
        data-testid="growth-add"
        @click="openCreate"
      >
        记录
      </van-button>
    </section>

    <div v-if="growthStore.offline" class="growth__offline">
      <van-tag data-testid="growth-offline" color="#fff7e6" text-color="#ad6800">
        离线数据
      </van-tag>
      <span class="text-secondary">当前显示本地缓存</span>
    </div>

    <section class="growth__latest card" data-testid="growth-latest">
      <div class="growth__latest-head">
        <span class="growth__latest-title">最新记录</span>
        <span class="growth__latest-date text-secondary">
          <template v-if="latestDate">
            测量于 <span data-testid="growth-latest-date">{{ latestDate }}</span>
          </template>
          <template v-else>还没有测量记录</template>
        </span>
      </div>
      <div class="growth__latest-grid">
        <div class="growth__latest-item">
          <span class="growth__latest-label">身高</span>
          <span class="growth__latest-value" data-testid="growth-latest-height">
            {{ formatGrowthMetric(latestHeight, 'height') }}
          </span>
        </div>
        <div class="growth__latest-item">
          <span class="growth__latest-label">体重</span>
          <span class="growth__latest-value" data-testid="growth-latest-weight">
            {{ formatGrowthMetric(latestWeight, 'weight') }}
          </span>
        </div>
        <div class="growth__latest-item">
          <span class="growth__latest-label">头围</span>
          <span class="growth__latest-value" data-testid="growth-latest-head">
            {{ formatGrowthMetric(latestHead, 'head') }}
          </span>
        </div>
      </div>
    </section>

    <div class="growth__metric-switch" role="tablist" aria-label="生长指标">
      <button
        v-for="option in metricOptions"
        :key="option.value"
        type="button"
        role="tab"
        class="growth__metric-item"
        :class="{ 'growth__metric-item--active': metric === option.value }"
        :aria-selected="metric === option.value"
        :data-testid="`growth-metric-${option.value}`"
        @click="metric = option.value"
      >
        {{ option.label }}
      </button>
    </div>

    <section class="card growth__chart-card">
      <div v-if="growthStore.loading && !growthStore.hasData" class="growth__loading">
        加载中…
      </div>
      <div v-else-if="!activeBaby" class="growth__empty" data-testid="growth-empty">
        <EmptyState title="还没有宝宝档案" description="先添加宝宝，才能记录生长数据。" />
      </div>
      <div v-else-if="!growthStore.hasData" class="growth__empty" data-testid="growth-empty">
        <EmptyState
          title="还没有生长记录"
          description="记录第一次身高、体重或头围，查看宝宝自己的变化趋势。"
          action-text="记录生长数据"
          @action="openCreate"
        />
      </div>
      <GrowthChart v-else :points="trendPoints" :metric="metric" />
    </section>

    <div class="section-title flex-between">
      <span>历史记录</span>
      <button
        v-if="growthStore.hasData"
        type="button"
        class="growth__add-link"
        data-testid="growth-add-inline"
        @click="openCreate"
      >
        + 新增
      </button>
    </div>

    <p v-if="growthStore.lastError" class="growth__error" data-testid="growth-error">
      {{ growthStore.lastError }}
      <button type="button" class="growth__retry" @click="load">重试</button>
    </p>

    <section class="growth__list" data-testid="growth-record-list">
      <article v-for="record in records" :key="record.id" class="growth__row card">
        <div class="growth__row-head">
          <div class="growth__row-date">
            {{ record.measuredOn }}
            <van-tag
              v-if="isPending(record)"
              data-testid="growth-pending"
              color="#fff7e6"
              text-color="#ad6800"
            >
              待同步
            </van-tag>
          </div>
          <div class="growth__row-actions">
            <button
              type="button"
              class="growth__action"
              data-testid="growth-edit"
              @click="openEdit(record)"
            >
              编辑
            </button>
            <button
              type="button"
              class="growth__action growth__action--danger"
              data-testid="growth-delete"
              @click="openDelete(record)"
            >
              删除
            </button>
          </div>
        </div>
        <div class="growth__row-values">
          <span v-if="record.heightCm !== null" data-testid="growth-record-height">
            身高 {{ formatGrowthMetric(record.heightCm, 'height') }}
          </span>
          <span v-if="record.weightKg !== null" data-testid="growth-record-weight">
            体重 {{ formatGrowthMetric(record.weightKg, 'weight') }}
          </span>
          <span v-if="record.headCircumferenceCm !== null" data-testid="growth-record-head">
            头围 {{ formatGrowthMetric(record.headCircumferenceCm, 'head') }}
          </span>
        </div>
        <p v-if="record.note" class="growth__row-note text-secondary">{{ record.note }}</p>
      </article>
    </section>

    <GrowthForm
      v-if="activeBaby"
      v-model:show="formVisible"
      :baby-id="activeBaby.id"
      :birth-date="activeBaby.birthDate"
      :record="editTarget"
    />

    <van-dialog
      v-model:show="deleteVisible"
      title="删除生长记录"
      message="删除后无法恢复，确定删除这条生长记录吗？"
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
.growth {
  padding-top: 10px;
}

.growth__hero {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.growth__title {
  margin: 0;
  font-size: 22px;
  font-weight: 700;
}

.growth__desc {
  margin: 6px 0 0;
  font-size: 12px;
  color: var(--app-text-secondary);
}

.growth__offline {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 10px;
  font-size: 12px;
}

.growth__latest {
  margin-top: 12px;
}

.growth__latest-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.growth__latest-title {
  font-size: 15px;
  font-weight: 600;
}

.growth__latest-date {
  font-size: 11px;
}

.growth__latest-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  margin-top: 12px;
}

.growth__latest-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
  padding: 11px 4px;
  border-radius: 10px;
  background: #fafafa;
}

.growth__latest-label {
  font-size: 11px;
  color: var(--app-text-secondary);
}

.growth__latest-value {
  font-size: 15px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--app-primary-dark);
  white-space: nowrap;
}

.growth__metric-switch {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
  margin-top: 12px;
  padding: 4px;
  border-radius: 12px;
  background: #f4f5f7;
}

.growth__metric-item {
  padding: 9px 4px;
  border: 0;
  border-radius: 9px;
  background: transparent;
  font: inherit;
  font-size: 14px;
  color: var(--app-text-secondary);
}

.growth__metric-item--active {
  background: #fff;
  color: var(--app-primary-dark);
  font-weight: 600;
  box-shadow: 0 1px 4px rgba(20, 20, 40, 0.08);
}

.growth__chart-card {
  margin-top: 10px;
  padding: 8px 4px 4px;
}

.growth__loading {
  padding: 60px 12px;
  font-size: 13px;
  color: var(--app-text-secondary);
  text-align: center;
}

.growth__empty :deep(.empty-state) {
  padding: 26px 16px;
}

.growth__add-link {
  padding: 0;
  border: 0;
  background: transparent;
  font: inherit;
  font-size: 12px;
  color: var(--app-primary-dark);
}

.growth__error {
  margin: 0 4px 10px;
  font-size: 12px;
  color: #ee0a24;
}

.growth__retry {
  margin-left: 8px;
  padding: 0;
  border: 0;
  background: transparent;
  font: inherit;
  font-size: 12px;
  color: var(--app-primary-dark);
  text-decoration: underline;
}

.growth__list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.growth__row {
  padding: 12px 14px;
}

.growth__row-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.growth__row-date {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  font-weight: 600;
}

.growth__row-actions {
  display: flex;
  gap: 10px;
}

.growth__action {
  padding: 0;
  border: 0;
  background: transparent;
  font: inherit;
  font-size: 12px;
  color: var(--app-primary-dark);
}

.growth__action--danger {
  color: #ee0a24;
}

.growth__row-values {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 14px;
  margin-top: 8px;
  font-size: 13px;
  color: var(--app-text);
}

.growth__row-note {
  margin: 7px 0 0;
  font-size: 12px;
  line-height: 1.5;
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
