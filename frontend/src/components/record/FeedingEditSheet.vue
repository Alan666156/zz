<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import FeedingTypeSheet from './FeedingTypeSheet.vue'
import FormulaSheet from './FormulaSheet.vue'
import SolidSheet from './SolidSheet.vue'
import TagSelector from './TagSelector.vue'
import { useFeedingStore, type FeedingMutationOutcome } from '@/stores/feeding'
import { useUiStore } from '@/stores/ui'
import {
  BREAST_SIDE_LABELS,
  type BreastSide,
  type FeedingRecord,
  type FeedingRecordInput,
  type FeedingTag,
  type FeedingType,
} from '@/types/models'
import { toOffsetISOString } from '@/utils/date'
import { validateFeedingInput } from '@/utils/feeding'

const props = defineProps<{
  show: boolean
  record: FeedingRecord | null
}>()

const emit = defineEmits<{
  (event: 'update:show', value: boolean): void
  (event: 'saved', outcome: FeedingMutationOutcome): void
}>()

const feedingStore = useFeedingStore()
const ui = useUiStore()

const feedType = ref<FeedingType>('BREAST')
const side = ref<BreastSide>('LEFT')
const amount = ref<number | null>(null)
const durationSec = ref(60)
const note = ref('')
const tags = ref<FeedingTag[]>([])
const errorText = ref('')
const saving = ref(false)

const isTimed = computed(() => feedType.value === 'BREAST' || feedType.value === 'MIXED')
const showAmount = computed(
  () => feedType.value === 'FORMULA' || feedType.value === 'MIXED' || feedType.value === 'SOLID',
)
const amountIsSolid = computed(() => feedType.value === 'SOLID')

const sides: Array<{ value: BreastSide; label: string }> = [
  { value: 'LEFT', label: BREAST_SIDE_LABELS.LEFT },
  { value: 'RIGHT', label: BREAST_SIDE_LABELS.RIGHT },
  { value: 'BOTH', label: BREAST_SIDE_LABELS.BOTH },
]

const durationPresets = [300, 600, 900, 1200]

watch(
  () => [props.show, props.record] as const,
  ([visible, record]) => {
    if (!visible || !record) return
    feedType.value = record.feedType
    side.value = record.breastSide ?? 'LEFT'
    amount.value = record.amountValue
    durationSec.value = record.durationSec && record.durationSec > 0 ? record.durationSec : 60
    note.value = record.note ?? ''
    tags.value = record.tags ? [...record.tags] : []
    errorText.value = ''
    saving.value = false
  },
  { immediate: true },
)

watch(feedType, (next) => {
  errorText.value = ''
  if (next === 'BREAST') {
    amount.value = null
    durationSec.value = durationSec.value > 0 ? durationSec.value : 60
  } else if (next === 'FORMULA' || next === 'SOLID') {
    durationSec.value = 0
    if (next === 'SOLID' && amount.value !== null) {
      amount.value = null
    }
  } else if (next === 'MIXED') {
    durationSec.value = durationSec.value > 0 ? durationSec.value : 60
    side.value = side.value || 'LEFT'
  }
})

function onDurationInput(value: string): void {
  const parsed = Number(value)
  durationSec.value = Number.isFinite(parsed) && parsed >= 0 ? parsed : 0
}

function buildInput(): FeedingRecordInput | null {
  const record = props.record
  if (!record) return null
  errorText.value = ''
  const amountValue = showAmount.value ? amount.value : null
  const input: FeedingRecordInput = {
    feedType: feedType.value,
    breastSide: isTimed.value ? side.value : null,
    amountValue,
    amountUnit:
      feedType.value === 'FORMULA' || feedType.value === 'MIXED'
        ? 'ML'
        : feedType.value === 'SOLID' && amountValue !== null
          ? 'G'
          : null,
    durationSec: isTimed.value ? durationSec.value : null,
    startedAt: record.startedAt,
    endedAt: null,
    note: note.value.trim() || null,
    tags: tags.value.length > 0 ? [...tags.value] : null,
  }

  if (isTimed.value) {
    const startMs = Date.parse(record.startedAt)
    input.endedAt = Number.isNaN(startMs)
      ? record.endedAt
      : toOffsetISOString(new Date(startMs + durationSec.value * 1000))
  }

  const validationError = validateFeedingInput(input)
  if (validationError) {
    errorText.value = validationError
    return null
  }
  return input
}

async function handleSave(): Promise<void> {
  const record = props.record
  if (!record || saving.value) return
  const input = buildInput()
  if (!input) return

  saving.value = true
  try {
    const outcome = await feedingStore.updateRecord(record, input)
    emit('saved', outcome)
    emit('update:show', false)
    if (outcome.status === 'synced') {
      ui.toast('已保存')
    } else {
      ui.toast(outcome.message ?? '已保存，稍后同步')
    }
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
    data-testid="record-edit-sheet"
    @update:show="emit('update:show', $event)"
  >
    <div v-if="show" class="record-edit">
      <h3 class="record-edit__title">编辑记录</h3>

      <FeedingTypeSheet v-model="feedType" />

      <div class="record-edit__form">
        <div v-if="isTimed" class="record-edit__sides" role="group" aria-label="母乳侧别">
          <button
            v-for="option in sides"
            :key="option.value"
            type="button"
            class="record-edit__side"
            :class="{ 'record-edit__side--active': side === option.value }"
            :data-testid="`record-edit-side-${option.value.toLowerCase()}`"
            @click="side = option.value"
          >
            {{ option.label }}
          </button>
        </div>

        <van-field
          v-if="isTimed"
          :model-value="String(durationSec)"
          type="number"
          label="时长（秒）"
          data-testid="record-edit-duration"
          :min="1"
          :max="21600"
          @update:model-value="onDurationInput"
        />
        <div v-if="isTimed" class="record-edit__presets">
          <button
            v-for="preset in durationPresets"
            :key="preset"
            type="button"
            class="record-edit__preset"
            @click="durationSec = preset"
          >
            {{ preset / 60 }} 分钟
          </button>
        </div>

        <div v-if="showAmount" data-testid="record-edit-amount">
          <SolidSheet v-if="amountIsSolid" v-model:amount="amount" />
          <FormulaSheet v-else v-model:amount="amount" />
        </div>
      </div>

      <div class="record-edit__extra">
        <van-field
          v-model="note"
          data-testid="record-edit-note"
          label="备注"
          type="textarea"
          rows="2"
          autosize
          maxlength="200"
          show-word-limit
          placeholder="可选"
        />
        <TagSelector v-model:tags="tags" />
      </div>

      <p v-if="errorText" class="record-edit__error">{{ errorText }}</p>

      <div class="record-edit__submit">
        <van-button
          type="primary"
          block
          round
          :loading="saving"
          data-testid="record-edit-save"
          @click="handleSave"
        >
          保存修改
        </van-button>
      </div>
      <div class="record-edit__bottom safe-bottom"></div>
    </div>
  </van-popup>
</template>

<style scoped>
.record-edit {
  max-height: 92vh;
  overflow-y: auto;
  padding: 18px 14px 0;
}

.record-edit__title {
  margin: 0 4px 14px;
  font-size: 17px;
  font-weight: 600;
}

.record-edit__form {
  padding-top: 10px;
}

.record-edit__sides {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  padding: 6px 16px 2px;
}

.record-edit__side {
  padding: 9px 0;
  border: 1px solid #ebedf0;
  border-radius: 10px;
  background: #fff;
  font: inherit;
  font-size: 14px;
  color: var(--app-text-secondary);
}

.record-edit__side--active {
  border-color: var(--app-primary);
  background: rgba(255, 138, 101, 0.09);
  color: var(--app-primary-dark);
  font-weight: 600;
}

.record-edit__presets {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 8px 16px 10px;
}

.record-edit__preset {
  padding: 6px 12px;
  border: 1px solid #ebedf0;
  border-radius: 999px;
  background: #fff;
  font: inherit;
  font-size: 12px;
  color: var(--app-text-secondary);
}

.record-edit__extra {
  margin-top: 10px;
  border-top: 1px solid #f2f3f5;
  padding-top: 4px;
}

.record-edit__error {
  margin: 12px 16px 0;
  font-size: 13px;
  color: var(--app-danger);
}

.record-edit__submit {
  padding: 18px 4px 0;
}

.record-edit__bottom {
  height: 16px;
}
</style>
