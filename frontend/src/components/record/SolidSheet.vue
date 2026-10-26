<script setup lang="ts">
defineProps<{
  amount: number | null
}>()

const emit = defineEmits<{
  (event: 'update:amount', value: number | null): void
}>()

const quickValues = [10, 20, 30, 50]

function handleInput(value: string): void {
  if (value === '') {
    emit('update:amount', null)
    return
  }
  const parsed = Number(value)
  emit('update:amount', Number.isFinite(parsed) ? parsed : null)
}
</script>

<template>
  <div class="amount">
    <van-field
      :model-value="amount === null ? '' : String(amount)"
      type="number"
      label="辅食量"
      data-testid="solid-amount-input"
      placeholder="可不填"
      clearable
      @update:model-value="handleInput"
    >
      <template #extra>
        <span class="amount__unit">g</span>
      </template>
    </van-field>
    <div class="amount__quick">
      <button
        v-for="value in quickValues"
        :key="value"
        type="button"
        class="amount__chip"
        :class="{ 'amount__chip--active': amount === value }"
        @click="emit('update:amount', value)"
      >
        {{ value }}
      </button>
    </div>
    <p class="amount__hint text-secondary">辅食量可不填，最多 2000 g</p>
  </div>
</template>

<style scoped>
.amount {
  padding-top: 4px;
}

.amount__unit {
  color: var(--app-text-secondary);
  font-size: 13px;
}

.amount__quick {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 12px 16px 0;
}

.amount__chip {
  min-width: 54px;
  padding: 7px 10px;
  border: 1px solid #ebedf0;
  border-radius: 999px;
  background: #fff;
  font: inherit;
  font-size: 13px;
  color: var(--app-text-secondary);
}

.amount__chip--active {
  border-color: var(--app-primary);
  background: rgba(255, 138, 101, 0.09);
  color: var(--app-primary-dark);
}

.amount__hint {
  margin: 10px 16px 0;
  font-size: 12px;
}
</style>
