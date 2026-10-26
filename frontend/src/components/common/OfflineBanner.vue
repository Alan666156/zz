<script setup lang="ts">
import { computed } from 'vue'
import {
  offlineBannerOfflineText,
  offlinePendingText,
  syncFailedText,
  syncingText,
} from '@/constants/copy'
import { useSyncStore } from '@/stores/sync'

const sync = useSyncStore()

const visible = computed(
  () => !sync.online || sync.syncing || sync.pendingCount > 0,
)

const text = computed(() => {
  if (!sync.online) return offlineBannerOfflineText(sync.pendingCount)
  if (sync.syncing) return syncingText(sync.pendingCount)
  if (sync.failedCount > 0) return syncFailedText(sync.failedCount)
  return offlinePendingText(sync.pendingCount)
})
</script>

<template>
  <div v-if="visible" class="offline-banner" data-testid="offline-banner">
    {{ text }}
  </div>
</template>

<style scoped>
.offline-banner {
  margin-bottom: 10px;
  padding: 8px 12px;
  border-radius: 10px;
  background: #fff7e6;
  color: #ad6800;
  font-size: 12px;
  line-height: 1.5;
}
</style>
