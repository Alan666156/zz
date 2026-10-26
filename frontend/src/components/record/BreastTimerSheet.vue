<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { BREAST_SIDE_LABELS, type BreastSide } from '@/types/models'
import { formatClock, toOffsetISOString } from '@/utils/date'

const props = withDefaults(
  defineProps<{
    durationSec: number
    side: BreastSide
    autoStart?: boolean
    showSide?: boolean
  }>(),
  {
    autoStart: true,
    showSide: true,
  },
)

const emit = defineEmits<{
  (event: 'update:durationSec', value: number): void
  (event: 'update:side', value: BreastSide): void
  (event: 'update:running', value: boolean): void
  (event: 'started', value: string): void
  (event: 'finish', payload: { durationSec: number; endedAt: string }): void
}>()

const running = ref(false)
const startedAtMs = ref<number | null>(null)
const accumulatedPauseMs = ref(0)
const pauseStartedMs = ref<number | null>(null)
let timerId: ReturnType<typeof setInterval> | null = null

const sides: Array<{ value: BreastSide; label: string }> = [
  { value: 'LEFT', label: BREAST_SIDE_LABELS.LEFT },
  { value: 'RIGHT', label: BREAST_SIDE_LABELS.RIGHT },
  { value: 'BOTH', label: BREAST_SIDE_LABELS.BOTH },
]

const display = computed(() => formatClock(props.durationSec))
const hasStarted = computed(() => startedAtMs.value !== null)
const toggleText = computed(() => {
  if (running.value) return '暂停'
  if (hasStarted.value) return '继续'
  return '开始'
})

function clearTicker(): void {
  if (timerId !== null) {
    clearInterval(timerId)
    timerId = null
  }
}

function computeElapsed(): number {
  if (startedAtMs.value === null) return 0
  const now = Date.now()
  const ongoingPause = pauseStartedMs.value !== null ? now - pauseStartedMs.value : 0
  const elapsed = now - startedAtMs.value - accumulatedPauseMs.value - ongoingPause
  return Math.max(0, Math.floor(elapsed / 1000))
}

function emitDuration(): void {
  emit('update:durationSec', computeElapsed())
}

function startTicker(): void {
  clearTicker()
  timerId = setInterval(emitDuration, 1000)
}

function start(): void {
  if (startedAtMs.value !== null || running.value) return
  startedAtMs.value = Date.now()
  accumulatedPauseMs.value = 0
  pauseStartedMs.value = null
  running.value = true
  emit('update:running', true)
  emit('started', toOffsetISOString(new Date(startedAtMs.value)))
  emit('update:durationSec', 0)
  startTicker()
}

function pause(): void {
  if (!running.value) return
  emitDuration()
  pauseStartedMs.value = Date.now()
  running.value = false
  clearTicker()
  emit('update:running', false)
}

function resume(): void {
  if (running.value || startedAtMs.value === null) return
  if (pauseStartedMs.value !== null) {
    accumulatedPauseMs.value += Date.now() - pauseStartedMs.value
    pauseStartedMs.value = null
  }
  running.value = true
  emit('update:running', true)
  startTicker()
}

function finish(): void {
  const elapsed = computeElapsed()
  clearTicker()
  if (running.value) {
    running.value = false
    emit('update:running', false)
  }
  emit('update:durationSec', elapsed)
  emit('finish', { durationSec: elapsed, endedAt: toOffsetISOString() })
}

function toggle(): void {
  if (running.value) {
    pause()
  } else if (hasStarted.value) {
    resume()
  } else {
    start()
  }
}

function reset(): void {
  clearTicker()
  running.value = false
  startedAtMs.value = null
  accumulatedPauseMs.value = 0
  pauseStartedMs.value = null
  emit('update:durationSec', 0)
  emit('update:running', false)
}

defineExpose({ start, pause, resume, finish, reset })

onMounted(() => {
  if (props.autoStart) start()
})

onBeforeUnmount(clearTicker)
</script>

<template>
  <div class="timer">
    <div
      v-if="showSide"
      class="timer__sides"
      role="group"
      aria-label="母乳侧别"
      data-testid="breast-side-group"
    >
      <button
        v-for="option in sides"
        :key="option.value"
        type="button"
        class="timer__side"
        :class="{ 'timer__side--active': option.value === side }"
        :data-testid="`breast-side-${option.value.toLowerCase()}`"
        @click="emit('update:side', option.value)"
      >
        {{ option.label }}
      </button>
    </div>

    <div class="timer__display" data-test="timer-display" data-testid="breast-timer-display">
      {{ display }}
    </div>
    <p class="timer__status text-secondary">
      {{ running ? '计时中…' : hasStarted ? '已暂停' : '点击开始计时' }}
    </p>

    <div class="timer__actions">
      <van-button
        round
        :type="!hasStarted || running ? 'primary' : 'default'"
        :plain="hasStarted && !running"
        data-testid="breast-timer-toggle"
        @click="toggle"
      >
        {{ toggleText }}
      </van-button>
      <van-button
        v-if="hasStarted"
        round
        type="primary"
        :loading="false"
        data-testid="breast-timer-finish"
        @click="finish"
      >
        结束并保存
      </van-button>
    </div>
  </div>
</template>

<style scoped>
.timer {
  padding: 6px 0 2px;
  text-align: center;
}

.timer__sides {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  margin-bottom: 14px;
}

.timer__side {
  padding: 9px 0;
  border: 1px solid #ebedf0;
  border-radius: 10px;
  background: #fff;
  font: inherit;
  font-size: 14px;
  color: var(--app-text-secondary);
}

.timer__side--active {
  border-color: var(--app-primary);
  background: rgba(255, 138, 101, 0.09);
  color: var(--app-primary-dark);
  font-weight: 600;
}

.timer__display {
  font-variant-numeric: tabular-nums;
  font-size: 46px;
  font-weight: 600;
  letter-spacing: 2px;
  color: var(--app-text);
}

.timer__status {
  margin: 2px 0 16px;
  font-size: 12px;
}

.timer__actions {
  display: flex;
  justify-content: center;
  gap: 12px;
}

.timer__actions :deep(.van-button) {
  min-width: 118px;
}
</style>
