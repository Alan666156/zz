<script setup lang="ts">
defineProps<{
  title: string
  description?: string
  actionText?: string
}>()

defineEmits<{
  (event: 'action'): void
}>()
</script>

<template>
  <div class="empty-state">
    <div class="empty-state__icon" aria-hidden="true"></div>
    <p class="empty-state__title">{{ title }}</p>
    <p v-if="description" class="empty-state__desc">{{ description }}</p>
    <van-button
      v-if="actionText"
      class="empty-state__action"
      type="primary"
      size="small"
      round
      @click="$emit('action')"
    >
      {{ actionText }}
    </van-button>
  </div>
</template>

<style scoped>
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
  text-align: center;
}

.empty-state__icon {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: #f1f2f5;
  margin-bottom: 14px;
}

.empty-state__title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--app-text);
}

.empty-state__desc {
  margin: 8px 0 0;
  font-size: 13px;
  line-height: 1.6;
  color: var(--app-text-secondary);
  max-width: 260px;
}

.empty-state__action {
  margin-top: 16px;
}
</style>
