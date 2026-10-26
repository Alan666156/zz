<script setup lang="ts">
defineProps<{
  online: boolean
  pendingCount?: number
}>()
</script>

<template>
  <div
    v-if="!online || (pendingCount ?? 0) > 0"
    class="offline-banner"
    data-testid="offline-banner"
  >
    <template v-if="!online">当前离线，记录会先保存在本机，联网后自动同步</template>
    <template v-else>有 {{ pendingCount }} 条记录待同步</template>
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
