<script setup lang="ts">
import { computed } from 'vue'
import { GENDER_LABELS, type Baby } from '@/types/models'
import { calcBabyAge } from '@/utils/date'

const props = defineProps<{
  baby: Baby
  active?: boolean
}>()

defineEmits<{
  (event: 'click'): void
}>()

const ageLabel = computed(() => calcBabyAge(props.baby.birthDate).label)
const initial = computed(() => Array.from(props.baby.name)[0] ?? '宝')
</script>

<template>
  <button class="baby-card" :class="{ 'baby-card--active': active }" type="button" @click="$emit('click')">
    <span class="baby-card__avatar">{{ initial }}</span>
    <span class="baby-card__main">
      <span class="baby-card__name-row">
        <span class="baby-card__name">{{ baby.name }}</span>
        <van-tag v-if="baby.isDefault" type="primary" plain>默认</van-tag>
        <van-tag v-if="baby.revision === 0" color="#fff7e6" text-color="#ad6800">待同步</van-tag>
      </span>
      <span class="baby-card__meta">
        {{ GENDER_LABELS[baby.gender] }} · {{ ageLabel }}
      </span>
    </span>
    <span class="baby-card__arrow">切换</span>
  </button>
</template>

<style scoped>
.baby-card {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 12px;
  padding: 14px;
  border: 0;
  border-radius: 16px;
  background: linear-gradient(135deg, #fff2ec 0%, #ffffff 72%);
  text-align: left;
  font: inherit;
  color: inherit;
  box-shadow: 0 2px 8px rgba(255, 138, 101, 0.09);
}

.baby-card--active {
  outline: 1px solid rgba(255, 138, 101, 0.35);
}

.baby-card:active {
  opacity: 0.85;
}

.baby-card__avatar {
  display: flex;
  width: 46px;
  height: 46px;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: var(--app-primary);
  color: #fff;
  font-size: 20px;
  font-weight: 600;
}

.baby-card__main {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 4px;
}

.baby-card__name-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.baby-card__name {
  overflow: hidden;
  font-size: 17px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.baby-card__meta {
  font-size: 12px;
  color: var(--app-text-secondary);
}

.baby-card__arrow {
  flex-shrink: 0;
  font-size: 12px;
  color: var(--app-primary-dark);
}
</style>
