<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import BreastTimerSheet from './BreastTimerSheet.vue'
import FeedingTypeSheet from './FeedingTypeSheet.vue'
import FormulaSheet from './FormulaSheet.vue'
import MixedSheet from './MixedSheet.vue'
import SolidSheet from './SolidSheet.vue'
import TagSelector from './TagSelector.vue'
import { useFeedingRecorder } from '@/composables/useFeedingRecorder'
import { useUiStore } from '@/stores/ui'
import type {
  BreastSide,
  FeedingRecord,
  FeedingRecordInput,
  FeedingTag,
  FeedingType,
} from '@/types/models'
import { toOffsetISOString } from '@/utils/date'
import { validateFeedingInput } from '@/utils/feeding'

const props = withDefaults(
  defineProps<{
    show: boolean
    babyId: string
    defaultSide?: BreastSide
    lastAmount?: number | null
  }>(),
  {
    defaultSide: 'LEFT',
    lastAmount: null,
  },
)

const emit = defineEmits<{
  (event: 'update:show', value: boolean): void
  (event: 'saved', record: FeedingRecord): void
}>()

const recorder = useFeedingRecorder()
const ui = useUiStore()

const feedType = ref<FeedingType>('BREAST')
const side = ref<BreastSide>(props.defaultSide)
const amount = ref<number | null>(null)
const durationSec = ref(0)
const startedAt = ref<string | null>(null)
const note = ref('')
const tags = ref<FeedingTag[]>([])
const errorText = ref('')
const saving = ref(false)

const isTimed = computed(() => feedType.value === 'BREAST' || feedType.value === 'MIXED')

watch(
  () => props.show,
  (visible) => {
    if (!visible) return
    feedType.value = 'BREAST'
    side.value = props.defaultSide
    amount.value = null
    durationSec.value = 0
    startedAt.value = null
    note.value = ''
    tags.value = []
    errorText.value = ''
    saving.value = false
  },
)

watch(feedType, (next, previous) => {
  errorText.value = ''
  if (next !== 'BREAST' && next !== 'MIXED') {
    durationSec.value = 0
    startedAt.value = null
  }
  if (next === 'FORMULA' || next === 'MIXED') {
    if (amount.value === null && props.lastAmount !== null) {
      amount.value = props.lastAmount
    }
  }
  if (next === 'SOLID' && previous !== 'SOLID') {
    amount.value = null
  }
  if (next === 'BREAST' && previous !== 'BREAST' && previous !== 'MIXED') {
    amount.value = null
  }
})

function buildInput(endedAt?: string | null): FeedingRecordInput | null {
  errorText.value = ''
  const now = new Date()
  const input: FeedingRecordInput = {
    feedType: feedType.value,
    startedAt: isTimed.value ? startedAt.value ?? toOffsetISOString(now) : toOffsetISOString(now),
    note: note.value.trim() || null,
    tags: tags.value.length > 0 ? [...tags.value] : null,
  }

  if (feedType.value === 'BREAST') {
    input.breastSide = side.value
    input.amountValue = null
    input.amountUnit = null
    input.durationSec = durationSec.value
    input.endedAt = endedAt ?? toOffsetISOString(now)
  } else if (feedType.value === 'MIXED') {
    input.breastSide = side.value
    input.durationSec = durationSec.value
    input.amountValue = amount.value
    input.amountUnit = 'ML'
    input.endedAt = endedAt ?? toOffsetISOString(now)
  } else if (feedType.value === 'FORMULA') {
    input.breastSide = null
    input.amountValue = amount.value
    input.amountUnit = 'ML'
    input.durationSec = null
    input.endedAt = null
  } else {
    input.breastSide = null
    input.amountValue = amount.value
    input.amountUnit = amount.value === null ? null : 'G'
    input.durationSec = null
    input.endedAt = null
  }

  const validationError = validateFeedingInput(input)
  if (validationError) {
    errorText.value = validationError
    return null
  }
  return input
}

async function handleSave(endedAt?: string | null): Promise<void> {
  if (!props.babyId) {
    errorText.value = '请先选择宝宝'
    return
  }
  if (saving.value) return
  const input = buildInput(endedAt)
  if (!input) return

  saving.value = true
  try {
    const record = await recorder.save(input, props.babyId)
    emit('saved', record)
    emit('update:show', false)
    ui.toast('已记录')
  } catch (error) {
    errorText.value = error instanceof Error ? error.message : '保存失败，请重试'
  } finally {
    saving.value = false
  }
}

function handleFinish(payload: { durationSec: number; endedAt: string }): void {
  durationSec.value = payload.durationSec
  if (!startedAt.value) {
    const endMs = Date.parse(payload.endedAt)
    const startMs = Number.isNaN(endMs) ? Date.now() : endMs - payload.durationSec * 1000
    startedAt.value = toOffsetISOString(new Date(startMs))
  }
  void handleSave(payload.endedAt)
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
    <div v-if="show" class="quick-record">
      <h3 class="quick-record__title">快速记录</h3>

      <FeedingTypeSheet v-model="feedType" />

      <div class="quick-record__form">
        <BreastTimerSheet
          v-if="feedType === 'BREAST'"
          v-model:duration-sec="durationSec"
          v-model:side="side"
          :auto-start="true"
          @started="startedAt = $event"
          @finish="handleFinish"
        />

        <MixedSheet
          v-else-if="feedType === 'MIXED'"
          v-model:duration-sec="durationSec"
          v-model:side="side"
          v-model:amount="amount"
          :auto-start="true"
          @started="startedAt = $event"
          @finish="handleFinish"
        />

        <FormulaSheet v-else-if="feedType === 'FORMULA'" v-model:amount="amount" />

        <SolidSheet v-else v-model:amount="amount" />
      </div>

      <div class="quick-record__extra">
        <van-field
          v-model="note"
          label="备注"
          type="textarea"
          rows="2"
          autosize
          maxlength="200"
          show-word-limit
          placeholder="可选，例如：中途有点吐奶"
        />
        <TagSelector v-model:tags="tags" />
      </div>

      <p v-if="errorText" class="quick-record__error">{{ errorText }}</p>

      <div v-if="!isTimed" class="quick-record__submit">
        <van-button type="primary" block round :loading="saving" @click="handleSave()">
          保存记录
        </van-button>
      </div>

      <div class="quick-record__bottom-space safe-bottom"></div>
    </div>
  </van-popup>
</template>

<style scoped>
.quick-record {
  max-height: 92vh;
  overflow-y: auto;
  padding: 18px 14px 0;
}

.quick-record__title {
  margin: 0 4px 14px;
  font-size: 17px;
  font-weight: 600;
}

.quick-record__form {
  padding: 8px 2px 0;
}

.quick-record__extra {
  margin-top: 10px;
  border-top: 1px solid #f2f3f5;
  padding-top: 4px;
}

.quick-record__error {
  margin: 12px 16px 0;
  font-size: 13px;
  color: var(--app-danger);
}

.quick-record__submit {
  padding: 18px 4px 0;
}

.quick-record__bottom-space {
  height: 16px;
}
</style>
