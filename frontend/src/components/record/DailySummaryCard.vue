<script setup lang="ts">
import { computed } from 'vue'
import type { DailySummary } from '@/types/models'
import { formatDuration, formatTimeOfDay } from '@/utils/date'

const props = withDefaults(
  defineProps<{
    summary: DailySummary
    loading?: boolean
  }>(),
  { loading: false },
)

const lastFeedingText = computed(() => {
  if (!props.summary.lastFeedingAt) return '今天还没有记录'
  return `最近一次 ${formatTimeOfDay(props.summary.lastFeedingAt)}`
})

const breastDurationText = computed(
  () => formatDuration(props.summary.totalBreastDurationSec) || '0 分钟',
)
</script>

<template>
  <section class="summary card">
    <div class="summary__head flex-between">
      <span class="summary__title">今日摘要</span>
      <span class="summary__last text-secondary">{{ loading ? '同步中…' : lastFeedingText }}</span>
    </div>

    <div class="summary__grid">
      <div class="summary__item">
        <span class="summary__value">{{ summary.feedingCount }}</span>
        <span class="summary__label">喂养次数</span>
      </div>
      <div class="summary__item">
        <span class="summary__value">{{ summary.totalAmountMl }}</span>
        <span class="summary__label">奶量 (ml)</span>
      </div>
      <div class="summary__item">
        <span class="summary__value">{{ summary.totalSolidG }}</span>
        <span class="summary__label">辅食 (g)</span>
      </div>
      <div class="summary__item">
        <span class="summary__value summary__value--text">{{ breastDurationText }}</span>
        <span class="summary__label">母乳时长</span>
      </div>
    </div>
  </section>
</template>

<style scoped>
.summary {
  margin-top: 12px;
}

.summary__head {
  margin-bottom: 12px;
}

.summary__title {
  font-size: 15px;
  font-weight: 600;
}

.summary__last {
  font-size: 11px;
}

.summary__grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 6px;
}

.summary__item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 8px 2px;
  border-radius: 10px;
  background: #fafafa;
}

.summary__value {
  font-size: 19px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--app-primary-dark);
}

.summary__value--text {
  font-size: 13px;
  line-height: 1.6;
  text-align: center;
}

.summary__label {
  font-size: 11px;
  color: var(--app-text-secondary);
}
</style>
