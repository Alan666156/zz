<script setup lang="ts">
import BreastTimerSheet from './BreastTimerSheet.vue'
import FormulaSheet from './FormulaSheet.vue'
import type { BreastSide } from '@/types/models'

withDefaults(
  defineProps<{
    durationSec: number
    side: BreastSide
    amount: number | null
    autoStart?: boolean
  }>(),
  { autoStart: true },
)

const emit = defineEmits<{
  (event: 'update:durationSec', value: number): void
  (event: 'update:side', value: BreastSide): void
  (event: 'update:amount', value: number | null): void
  (event: 'update:running', value: boolean): void
  (event: 'started', value: string): void
  (event: 'finish', payload: { durationSec: number; endedAt: string }): void
}>()
</script>

<template>
  <div class="mixed">
    <BreastTimerSheet
      :duration-sec="durationSec"
      :side="side"
      :auto-start="autoStart"
      @update:duration-sec="emit('update:durationSec', $event)"
      @update:side="emit('update:side', $event)"
      @update:running="emit('update:running', $event)"
      @started="emit('started', $event)"
      @finish="emit('finish', $event)"
    />
    <div class="mixed__divider"></div>
    <FormulaSheet :amount="amount" @update:amount="emit('update:amount', $event)" />
  </div>
</template>

<style scoped>
.mixed__divider {
  height: 1px;
  margin: 8px 16px 4px;
  background: #f2f3f5;
}
</style>
