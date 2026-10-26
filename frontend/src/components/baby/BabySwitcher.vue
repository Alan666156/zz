<script setup lang="ts">
import { computed } from 'vue'
import type { Baby } from '@/types/models'
import { calcBabyAge } from '@/utils/date'

const props = defineProps<{
  show: boolean
  babies: Baby[]
  activeId: string | null
  canAddMore: boolean
}>()

const emit = defineEmits<{
  (event: 'update:show', value: boolean): void
  (event: 'select', id: string): void
  (event: 'add'): void
}>()

const sorted = computed(() =>
  [...props.babies].sort((a, b) => {
    if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1
    return a.createdAt.localeCompare(b.createdAt)
  }),
)

function close(): void {
  emit('update:show', false)
}

function select(id: string): void {
  emit('select', id)
  close()
}

function add(): void {
  emit('add')
  close()
}
</script>

<template>
  <van-action-sheet
    :show="show"
    title="切换宝宝"
    cancel-text="取消"
    close-on-click-overlay
    @update:show="emit('update:show', $event)"
  >
    <div class="switcher">
      <button
        v-for="baby in sorted"
        :key="baby.id"
        type="button"
        class="switcher__item"
        :class="{ 'switcher__item--active': baby.id === activeId }"
        data-testid="baby-switcher-item"
        @click="select(baby.id)"
      >
        <span class="switcher__main">
          <span class="switcher__name">{{ baby.name }}</span>
          <span class="switcher__meta">
            {{ calcBabyAge(baby.birthDate).label }}
            <template v-if="baby.isDefault"> · 默认</template>
          </span>
        </span>
        <van-icon v-if="baby.id === activeId" name="success" color="#ff8a65" />
      </button>

      <div v-if="canAddMore" class="switcher__add">
        <van-button
          block
          plain
          type="primary"
          round
          data-testid="baby-switcher-add"
          @click="add"
        >
          添加宝宝
        </van-button>
      </div>
      <p v-else class="switcher__hint text-secondary">最多 5 个宝宝</p>
    </div>
  </van-action-sheet>
</template>

<style scoped>
.switcher {
  padding: 8px 16px calc(20px + env(safe-area-inset-bottom));
}

.switcher__item {
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: space-between;
  padding: 14px 4px;
  border: 0;
  border-bottom: 1px solid #f2f3f5;
  background: transparent;
  text-align: left;
  font: inherit;
  color: inherit;
}

.switcher__item--active {
  color: var(--app-primary-dark);
}

.switcher__main {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.switcher__name {
  font-size: 16px;
  font-weight: 500;
}

.switcher__meta {
  font-size: 12px;
  color: var(--app-text-secondary);
}

.switcher__add {
  margin-top: 16px;
}

.switcher__hint {
  margin: 16px 0 0;
  text-align: center;
  font-size: 12px;
}
</style>
