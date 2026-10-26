<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useGrowthStore } from '@/stores/growth'
import { useUiStore } from '@/stores/ui'
import type { GrowthRecord } from '@/types/models'
import { addDaysToDateString, todayLocalDate } from '@/utils/date'
import {
  GROWTH_NOTE_MAX,
  validateGrowthForm,
  type GrowthFieldErrors,
  type GrowthFormValues,
} from '@/utils/growth'

const props = defineProps<{
  show: boolean
  babyId: string
  birthDate: string
  record: GrowthRecord | null
}>()

const emit = defineEmits<{
  (event: 'update:show', value: boolean): void
  (event: 'saved'): void
}>()

const growthStore = useGrowthStore()
const ui = useUiStore()

const measuredOn = ref('')
const heightCm = ref('')
const weightKg = ref('')
const headCircumferenceCm = ref('')
const note = ref('')
const errors = reactive<GrowthFieldErrors>({
  measuredOn: '',
  heightCm: '',
  weightKg: '',
  headCircumferenceCm: '',
  note: '',
  metrics: '',
})
const errorText = ref('')
const saving = ref(false)

// Q-11：允许 +1 天时区容差
const maxDate = addDaysToDateString(todayLocalDate(), 1)
const title = computed(() => (props.record ? '编辑生长记录' : '新增生长记录'))
const hasAnyMetric = computed(
  () =>
    heightCm.value.trim() !== '' ||
    weightKg.value.trim() !== '' ||
    headCircumferenceCm.value.trim() !== '',
)

function resetErrors(): void {
  errors.measuredOn = ''
  errors.heightCm = ''
  errors.weightKg = ''
  errors.headCircumferenceCm = ''
  errors.note = ''
  errors.metrics = ''
  errorText.value = ''
}

watch(
  () => [props.show, props.record] as const,
  ([visible, record]) => {
    if (!visible) return
    measuredOn.value = record?.measuredOn ?? todayLocalDate()
    heightCm.value = record?.heightCm === null || record?.heightCm === undefined
      ? ''
      : String(record.heightCm)
    weightKg.value = record?.weightKg === null || record?.weightKg === undefined
      ? ''
      : String(record.weightKg)
    headCircumferenceCm.value =
      record?.headCircumferenceCm === null || record?.headCircumferenceCm === undefined
        ? ''
        : String(record.headCircumferenceCm)
    note.value = record?.note ?? ''
    saving.value = false
    resetErrors()
  },
  { immediate: true },
)

watch([heightCm, weightKg, headCircumferenceCm], () => {
  if (errors.metrics && hasAnyMetric.value) errors.metrics = ''
})

function currentValues(): GrowthFormValues {
  return {
    measuredOn: measuredOn.value,
    heightCm: heightCm.value,
    weightKg: weightKg.value,
    headCircumferenceCm: headCircumferenceCm.value,
    note: note.value,
  }
}

async function handleSave(): Promise<void> {
  if (saving.value || !hasAnyMetric.value) return
  resetErrors()
  const result = validateGrowthForm(currentValues(), props.birthDate)
  if (!result.input) {
    Object.assign(errors, result.errors)
    errorText.value = result.errors.metrics
    return
  }

  saving.value = true
  try {
    const outcome = props.record
      ? await growthStore.updateRecord(props.record, result.input, props.birthDate)
      : await growthStore.createRecord(result.input, props.babyId, props.birthDate)
    emit('saved')
    emit('update:show', false)
    ui.toast(outcome.status === 'synced' ? '已保存' : outcome.message ?? '已保存，稍后同步')
  } catch (error) {
    errorText.value = error instanceof Error ? error.message : '保存失败，请重试'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <van-popup
    :show="show"
    position="bottom"
    round
    closeable
    :style="{ maxHeight: '92vh' }"
    @update:show="emit('update:show', $event)"
  >
    <div v-if="show" class="growth-form" data-testid="growth-form">
      <h3 class="growth-form__title">{{ title }}</h3>

      <van-cell-group inset class="growth-form__group">
        <van-field label="测量日期" :error-message="errors.measuredOn">
          <template #input>
            <input
              v-model="measuredOn"
              type="date"
              class="growth-form__date"
              :max="maxDate"
              :min="birthDate"
              data-testid="growth-form-date"
            />
          </template>
        </van-field>

        <van-field label="身高" :error-message="errors.heightCm">
          <template #input>
            <div class="growth-form__number">
              <input
                v-model="heightCm"
                type="text"
                inputmode="decimal"
                autocomplete="off"
                placeholder="例如 68.5"
                data-testid="growth-form-height"
              />
              <span class="growth-form__unit">cm</span>
            </div>
          </template>
        </van-field>

        <van-field label="体重" :error-message="errors.weightKg">
          <template #input>
            <div class="growth-form__number">
              <input
                v-model="weightKg"
                type="text"
                inputmode="decimal"
                autocomplete="off"
                placeholder="例如 8.12"
                data-testid="growth-form-weight"
              />
              <span class="growth-form__unit">kg</span>
            </div>
          </template>
        </van-field>

        <van-field label="头围" :error-message="errors.headCircumferenceCm">
          <template #input>
            <div class="growth-form__number">
              <input
                v-model="headCircumferenceCm"
                type="text"
                inputmode="decimal"
                autocomplete="off"
                placeholder="例如 43.0"
                data-testid="growth-form-head"
              />
              <span class="growth-form__unit">cm</span>
            </div>
          </template>
        </van-field>

        <van-field label="备注" :error-message="errors.note">
          <template #input>
            <textarea
              v-model="note"
              class="growth-form__note"
              rows="2"
              :maxlength="GROWTH_NOTE_MAX"
              placeholder="选填，例如：社区体检"
              data-testid="growth-form-note"
            ></textarea>
          </template>
        </van-field>
      </van-cell-group>

      <p class="growth-form__hint text-secondary">
        身高、体重、头围至少填写一项。
      </p>
      <p v-if="errors.metrics || errorText" class="growth-form__error" data-testid="growth-form-error">
        {{ errors.metrics || errorText }}
      </p>

      <van-button
        type="primary"
        block
        round
        :loading="saving"
        :disabled="!hasAnyMetric"
        data-testid="growth-form-save"
        @click="handleSave"
      >
        保存
      </van-button>
    </div>
  </van-popup>
</template>

<style scoped>
.growth-form {
  padding: 20px 16px calc(20px + env(safe-area-inset-bottom));
}

.growth-form__title {
  margin: 0 0 16px;
  padding: 0 8px;
  font-size: 18px;
  font-weight: 600;
}

.growth-form__group {
  margin: 0;
  overflow: hidden;
}

.growth-form__date,
.growth-form__note {
  width: 100%;
  border: 0;
  outline: none;
  background: transparent;
  font: inherit;
  color: inherit;
}

.growth-form__note {
  resize: none;
  line-height: 1.5;
}

.growth-form__number {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 8px;
}

.growth-form__number input {
  width: 100%;
  border: 0;
  outline: none;
  background: transparent;
  font: inherit;
  color: inherit;
}

.growth-form__unit {
  flex: none;
  font-size: 13px;
  color: var(--app-text-secondary);
}

.growth-form__hint {
  margin: 12px 8px 0;
  font-size: 12px;
  line-height: 1.5;
}

.growth-form__error {
  margin: 8px 8px 0;
  font-size: 12px;
  color: #ee0a24;
}

.growth-form :deep(.van-button) {
  margin-top: 16px;
}
</style>
