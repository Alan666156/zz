<script setup lang="ts">
import { useOfflineSync } from '@/composables/useOfflineSync'
import { useUiStore } from '@/stores/ui'

const ui = useUiStore()
useOfflineSync()
</script>

<template>
  <router-view />
  <van-toast v-model:show="ui.toastVisible" :message="ui.toastMessage" data-testid="app-toast" />
</template>
