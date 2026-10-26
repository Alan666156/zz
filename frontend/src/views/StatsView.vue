<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import TrendChart from '@/components/chart/TrendChart.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import { useBabyStore } from '@/stores/baby'
import { useStatsStore, type StatsRange } from '@/stores/stats'
import type { StatsMetric } from '@/types/models'
import { formatDuration } from '@/utils/date'
import { formatAmount } from '@/utils/stats'

const babyStore = useBabyStore()
const statsStore = useStatsStore()

const range = ref<StatsRange>(7)
const metric = ref<StatsMetric>('count')

const metricOptions: Array<{ value: StatsMetric; label: string }> = [
  { value: 'count', label: '次数' },
  { value: 'amount', label: '总奶量' },
  { value: 'duration', label: '总时长' },
]

const activeBaby = computed(() => babyStore.activeBaby)
const totalDurationText = computed(
  () => formatDuration(statsStore.totals.totalDurationSec) || '0 分钟',
)

async function load(): Promise<void> {
  const baby = activeBaby.value
  if (!baby) return
  await statsStore.load(baby.id, range.value)
}

function setRange(value: StatsRange): void {
  if (range.value === value) return
  range.value = value
}

watch(
  () => activeBaby.value?.id,
  () => {
    void load()
  },
  { immediate: true },
)

watch(range, () => {
  void load()
})

babyStore.ensureActive()
</script>

<template>
  <div class="page stats" data-testid="stats-page">
    <section class="stats__hero card">
      <div>
        <p class="stats__title">统计</p>
        <p class="stats__desc">
          {{ activeBaby ? `${activeBaby.name} 的喂养趋势` : '还没有宝宝档案' }}
        </p>
      </div>
      <div class="stats__range" role="group" aria-label="统计范围">
        <button
          type="button"
          class="stats__range-item"
          :class="{ 'stats__range-item--active': range === 7 }"
          :aria-pressed="range === 7"
          data-testid="stats-range-7"
          @click="setRange(7)"
        >
          7 天
        </button>
        <button
          type="button"
          class="stats__range-item"
          :class="{ 'stats__range-item--active': range === 30 }"
          :aria-pressed="range === 30"
          data-testid="stats-range-30"
          @click="setRange(30)"
        >
          30 天
        </button>
      </div>
    </section>

    <div v-if="statsStore.offline" class="stats__offline">
      <van-tag data-testid="stats-offline" color="#fff7e6" text-color="#ad6800">
        离线数据
      </van-tag>
      <span class="text-secondary">统计由本机缓存计算</span>
    </div>

    <section class="stats__summary card" data-testid="stats-summary">
      <div class="stats__summary-item">
        <span class="stats__summary-value">{{ statsStore.totals.feedingCount }}</span>
        <span class="stats__summary-label">喂养次数</span>
      </div>
      <div class="stats__summary-item">
        <span class="stats__summary-value">{{ formatAmount(statsStore.totals.totalAmountMl) }}</span>
        <span class="stats__summary-label">总奶量 (ml)</span>
      </div>
      <div class="stats__summary-item">
        <span class="stats__summary-value stats__summary-value--text">
          {{ totalDurationText }}
        </span>
        <span class="stats__summary-label">总时长</span>
      </div>
      <div class="stats__summary-item">
        <span class="stats__summary-value">{{ statsStore.totals.avgFeedingCount }}</span>
        <span class="stats__summary-label">日均次数</span>
      </div>
    </section>

    <div class="stats__metric-switch" role="tablist" aria-label="统计指标">
      <button
        v-for="option in metricOptions"
        :key="option.value"
        type="button"
        role="tab"
        class="stats__metric-item"
        :class="{ 'stats__metric-item--active': metric === option.value }"
        :aria-selected="metric === option.value"
        :data-testid="`stats-metric-${option.value}`"
        @click="metric = option.value"
      >
        {{ option.label }}
      </button>
    </div>

    <section class="card stats__chart-card">
      <div v-if="statsStore.loading" class="stats__loading">加载中…</div>
      <div v-else-if="!activeBaby" class="stats__empty" data-testid="stats-empty">
        <EmptyState title="还没有宝宝档案" description="先添加宝宝，才能查看喂养统计。" />
      </div>
      <div v-else-if="!statsStore.hasData" class="stats__empty" data-testid="stats-empty">
        <EmptyState
          title="暂无统计数据"
          description="记录几次喂养后，这里会显示趋势图。"
        />
      </div>
      <TrendChart v-else :points="statsStore.points" :metric="metric" />
    </section>

    <p v-if="statsStore.offline && statsStore.lastError" class="stats__note text-secondary">
      {{ statsStore.lastError }}
    </p>
    <p v-else-if="statsStore.lastError && statsStore.hasData" class="stats__note text-secondary">
      {{ statsStore.lastError }}
    </p>
  </div>
</template>

<style scoped>
.stats {
  padding-top: 10px;
}

.stats__hero {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.stats__title {
  margin: 0;
  font-size: 22px;
  font-weight: 700;
}

.stats__desc {
  margin: 6px 0 0;
  font-size: 12px;
  color: var(--app-text-secondary);
}

.stats__range {
  display: flex;
  padding: 3px;
  border-radius: 10px;
  background: #f4f5f7;
}

.stats__range-item {
  padding: 7px 12px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  font: inherit;
  font-size: 12px;
  color: var(--app-text-secondary);
}

.stats__range-item--active {
  background: #fff;
  color: var(--app-primary-dark);
  font-weight: 600;
  box-shadow: 0 1px 4px rgba(20, 20, 40, 0.08);
}

.stats__offline {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 10px;
  font-size: 12px;
}

.stats__summary {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 6px;
  margin-top: 12px;
}

.stats__summary-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 10px 2px;
  border-radius: 10px;
  background: #fafafa;
}

.stats__summary-value {
  font-size: 18px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--app-primary-dark);
}

.stats__summary-value--text {
  font-size: 12px;
  line-height: 1.7;
  text-align: center;
}

.stats__summary-label {
  font-size: 11px;
  color: var(--app-text-secondary);
}

.stats__metric-switch {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
  margin-top: 12px;
  padding: 4px;
  border-radius: 12px;
  background: #f4f5f7;
}

.stats__metric-item {
  padding: 9px 4px;
  border: 0;
  border-radius: 9px;
  background: transparent;
  font: inherit;
  font-size: 14px;
  color: var(--app-text-secondary);
}

.stats__metric-item--active {
  background: #fff;
  color: var(--app-primary-dark);
  font-weight: 600;
  box-shadow: 0 1px 4px rgba(20, 20, 40, 0.08);
}

.stats__chart-card {
  margin-top: 10px;
  padding: 8px 4px 4px;
}

.stats__loading {
  padding: 60px 12px;
  font-size: 13px;
  color: var(--app-text-secondary);
  text-align: center;
}

.stats__empty :deep(.empty-state) {
  padding: 28px 16px;
}

.stats__note {
  margin: 10px 4px 0;
  font-size: 11px;
  line-height: 1.5;
  text-align: center;
}
</style>
