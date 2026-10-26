<script setup lang="ts">
import { computed, ref } from 'vue'
import { addDaysToDateString, parseLocalDate, toLocalDateString } from '@/utils/date'

const props = defineProps<{
  date: string
  minDate: string
  maxDate: string
  today: string
}>()

const emit = defineEmits<{
  (event: 'update:date', value: string): void
}>()

const showCalendar = ref(false)

const calendarMin = computed(() => parseLocalDate(props.minDate))
const calendarMax = computed(() => parseLocalDate(props.maxDate))
const calendarValue = computed(() => parseLocalDate(props.date))

const canPrev = computed(() => props.date > props.minDate)
const canNext = computed(() => props.date < props.maxDate)

const weekLabels = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

const dateLabel = computed(() => {
  if (props.date === props.today) return '今天'
  if (props.date === addDaysToDateString(props.today, -1)) return '昨天'
  const date = parseLocalDate(props.date)
  const month = date.getMonth() + 1
  const day = date.getDate()
  return `${month} 月 ${day} 日 ${weekLabels[date.getDay()]}`
})

function go(days: number): void {
  const next = addDaysToDateString(props.date, days)
  if (next < props.minDate || next > props.maxDate) return
  emit('update:date', next)
}

function onConfirm(value: Date | Date[]): void {
  const selected = Array.isArray(value) ? value[0] : value
  if (selected) {
    emit('update:date', toLocalDateString(selected))
  }
  showCalendar.value = false
}
</script>

<template>
  <section class="date-nav card" data-testid="records-date-nav">
    <button
      type="button"
      class="date-nav__arrow"
      :disabled="!canPrev"
      aria-label="前一天"
      data-testid="records-date-prev"
      @click="go(-1)"
    >
      ‹
    </button>

    <button
      type="button"
      class="date-nav__current"
      data-testid="records-date-calendar"
      @click="showCalendar = true"
    >
      <span data-testid="records-date-label">{{ dateLabel }}</span>
      <span class="date-nav__hint">{{ date }}</span>
    </button>

    <button
      type="button"
      class="date-nav__arrow"
      :disabled="!canNext"
      aria-label="后一天"
      data-testid="records-date-next"
      @click="go(1)"
    >
      ›
    </button>

    <van-popup v-model:show="showCalendar" position="bottom" round>
      <van-calendar
        :min-date="calendarMin"
        :max-date="calendarMax"
        :default-date="calendarValue"
        :show-confirm="true"
        color="#ff7a52"
        @confirm="onConfirm"
      />
    </van-popup>
  </section>
</template>

<style scoped>
.date-nav {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
}

.date-nav__arrow {
  width: 34px;
  height: 34px;
  flex-shrink: 0;
  border: 0;
  border-radius: 50%;
  background: #f6f7f9;
  color: var(--app-text);
  font-size: 22px;
  line-height: 1;
}

.date-nav__arrow:disabled {
  color: #c8c9cc;
  background: #fafafa;
}

.date-nav__current {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 0;
  border: 0;
  background: transparent;
  font: inherit;
  color: inherit;
}

.date-nav__hint {
  font-size: 11px;
  color: var(--app-text-secondary);
}
</style>
