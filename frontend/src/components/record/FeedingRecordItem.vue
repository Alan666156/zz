<script setup lang="ts">
import { computed } from 'vue'
import {
  BREAST_SIDE_LABELS,
  FEEDING_TAG_LABELS,
  FEEDING_TYPE_LABELS,
  type FeedingRecord,
} from '@/types/models'
import { formatDuration, formatTimeOfDay } from '@/utils/date'

const props = defineProps<{
  record: FeedingRecord
  pending?: boolean
}>()

const typeLabel = computed(() => FEEDING_TYPE_LABELS[props.record.feedType])
const isPending = computed(() => props.pending ?? props.record.revision === 0)

const detail = computed(() => {
  const record = props.record
  const parts: string[] = []
  if (record.breastSide) {
    parts.push(BREAST_SIDE_LABELS[record.breastSide])
  }
  if (record.amountValue !== null && record.amountUnit) {
    parts.push(`${record.amountValue} ${record.amountUnit === 'ML' ? '毫升' : '克'}`)
  }
  const duration = formatDuration(record.durationSec)
  if (duration) parts.push(duration)
  return parts.join(' · ') || '已记录'
})

const tagList = computed(() =>
  (props.record.tags ?? []).map((tag) => FEEDING_TAG_LABELS[tag]),
)
</script>

<template>
  <article class="record-item" data-testid="feeding-record-item">
    <span class="record-item__time">{{ formatTimeOfDay(record.startedAt) }}</span>
    <span class="record-item__dot" :class="`record-item__dot--${record.feedType.toLowerCase()}`"></span>
    <div class="record-item__body">
      <div class="record-item__title-row">
        <span class="record-item__title">{{ typeLabel }}</span>
        <van-tag
          v-if="isPending"
          data-testid="record-pending"
          color="#fff7e6"
          text-color="#ad6800"
        >
          待同步
        </van-tag>
      </div>
      <p class="record-item__detail">{{ detail }}</p>
      <p v-if="record.note" class="record-item__note">{{ record.note }}</p>
      <div v-if="tagList.length" class="record-item__tags">
        <van-tag v-for="tag in tagList" :key="tag" plain type="primary">{{ tag }}</van-tag>
      </div>
    </div>
  </article>
</template>

<style scoped>
.record-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 12px 2px;
  border-bottom: 1px solid #f2f3f5;
}

.record-item:last-child {
  border-bottom: 0;
}

.record-item__time {
  width: 44px;
  flex-shrink: 0;
  padding-top: 1px;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  color: var(--app-text-secondary);
}

.record-item__dot {
  width: 9px;
  height: 9px;
  flex-shrink: 0;
  margin-top: 5px;
  border-radius: 50%;
  background: var(--app-primary);
}

.record-item__dot--formula {
  background: #ffb74d;
}

.record-item__dot--mixed {
  background: #ba68c8;
}

.record-item__dot--solid {
  background: #4db6ac;
}

.record-item__body {
  min-width: 0;
  flex: 1;
}

.record-item__title-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.record-item__title {
  font-size: 14px;
  font-weight: 600;
}

.record-item__detail {
  margin: 3px 0 0;
  font-size: 12px;
  color: var(--app-text-secondary);
}

.record-item__note {
  margin: 5px 0 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--app-text);
  word-break: break-word;
}

.record-item__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 6px;
}
</style>
