<script setup lang="ts">
import { onMounted } from 'vue'
import RouteLoadErrorDialog from '@/components/common/RouteLoadErrorDialog.vue'
import { useOfflineSync } from '@/composables/useOfflineSync'
import { scheduleTabPrefetch } from '@/router/prefetch'
import { useUiStore } from '@/stores/ui'

const ui = useUiStore()
useOfflineSync()

onMounted(() => {
  // Q-24 P2：等 load 后再 idle 预取其余 Tab chunk，不阻塞首屏与今日数据请求
  const run = (): void => scheduleTabPrefetch()
  if (document.readyState === 'complete') {
    run()
  } else {
    window.addEventListener('load', run, { once: true })
  }
})
</script>

<template>
  <router-view />
  <RouteLoadErrorDialog />
  <van-toast v-model:show="ui.toastVisible" :message="ui.toastMessage" data-testid="app-toast" />
</template>
