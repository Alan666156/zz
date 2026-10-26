<script setup lang="ts">
import EmptyState from '@/components/common/EmptyState.vue'
import FeedingRecordItem from './FeedingRecordItem.vue'
import type { FeedingRecord } from '@/types/models'

withDefaults(
  defineProps<{
    records: FeedingRecord[]
    loading?: boolean
    pendingIds?: string[]
    title?: string
    emptyTitle?: string
    emptyDescription?: string
  }>(),
  {
    loading: false,
    pendingIds: () => [],
    title: '今日记录',
    emptyTitle: '今天还没有记录',
    emptyDescription: '点击右下角的 +，快速记录一次喂养。',
  },
)
</script>

<template>
  <section class="timeline" data-testid="feeding-timeline">
    <div class="section-title flex-between">
      <span>{{ title }}</span>
      <span class="timeline__count text-secondary">{{ records.length }} 条</span>
    </div>

    <div v-if="loading && records.length === 0" class="card timeline__loading">加载中…</div>

    <EmptyState
      v-else-if="records.length === 0"
      class="card"
      :title="emptyTitle"
      :description="emptyDescription"
    />

    <div v-else class="card timeline__list">
      <div v-for="record in records" :key="record.id" class="timeline__row">
        <FeedingRecordItem
          :record="record"
          :pending="pendingIds.includes(record.id)"
        />
        <slot name="actions" :record="record"></slot>
      </div>
    </div>
  </section>
</template>

<style scoped>
.timeline__count {
  font-size: 12px;
  font-weight: 400;
}

.timeline__loading {
  font-size: 13px;
  color: var(--app-text-secondary);
  text-align: center;
}

.timeline__list {
  padding-top: 2px;
  padding-bottom: 2px;
}

.timeline__row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.timeline__row :deep(.record-item) {
  min-width: 0;
  flex: 1;
}
</style>
