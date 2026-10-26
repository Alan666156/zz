<script setup lang="ts">
import { FEEDING_TYPE_LABELS, type FeedingType } from '@/types/models'

defineProps<{
  modelValue: FeedingType
}>()

const emit = defineEmits<{
  (event: 'update:modelValue', value: FeedingType): void
}>()

const options = (Object.keys(FEEDING_TYPE_LABELS) as FeedingType[]).map((value) => ({
  value,
  label: FEEDING_TYPE_LABELS[value],
}))
</script>

<template>
  <div class="type-switch" role="tablist" aria-label="喂养类型">
    <button
      v-for="option in options"
      :key="option.value"
      type="button"
      role="tab"
      class="type-switch__item"
      :class="{ 'type-switch__item--active': option.value === modelValue }"
      :aria-selected="option.value === modelValue"
      @click="emit('update:modelValue', option.value)"
    >
      {{ option.label }}
    </button>
  </div>
</template>

<style scoped>
.type-switch {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 6px;
  padding: 4px;
  border-radius: 12px;
  background: #f4f5f7;
}

.type-switch__item {
  padding: 9px 4px;
  border: 0;
  border-radius: 9px;
  background: transparent;
  font: inherit;
  font-size: 14px;
  color: var(--app-text-secondary);
}

.type-switch__item--active {
  background: #fff;
  color: var(--app-primary-dark);
  font-weight: 600;
  box-shadow: 0 1px 4px rgba(20, 20, 40, 0.08);
}
</style>
