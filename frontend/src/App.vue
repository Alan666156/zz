<script setup lang="ts">
import { useUiStore } from '@/stores/ui'

const ui = useUiStore()
</script>

<template>
  <router-view />
  <van-toast v-model:show="ui.toastVisible" :message="ui.toastMessage" />
</template>
