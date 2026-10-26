<script setup lang="ts">
import EmptyState from '@/components/common/EmptyState.vue'
import FeedingRecordItem from './FeedingRecordItem.vue'
import type { FeedingRecord } from '@/types/models'

withDefaults(
  defineProps<{
    records: FeedingRecord[]
    loading?: boolean
  }>(),
  { loading: false },
)
</script>

<template>
  <section class="timeline">
    <div class="section-title flex-between">
      <span>今日记录</span>
      <span class="timeline__count text-secondary">{{ records.length }} 条</span>
    </div>

    <div v-if="loading && records.length === 0" class="card timeline__loading">加载中…</div>

    <EmptyState
      v-else-if="records.length === 0"
      class="card"
      title="今天还没有记录"
      description="点击右下角的 +，快速记录一次喂养。"
    />

    <div v-else class="card timeline__list">
      <FeedingRecordItem v-for="record in records" :key="record.id" :record="record" />
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
</style>
