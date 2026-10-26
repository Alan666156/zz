<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import type { Baby, Gender } from '@/types/models'
import { babyBirthDateBounds, validateBabyName, validateBirthDate } from '@/utils/validation'

interface BabyFormPayload {
  name: string
  gender: Gender
  birthDate: string
  isDefault: boolean
}

const props = withDefaults(
  defineProps<{
    initial?: Baby | null
    submitText?: string
    loading?: boolean
    allowEmptyName?: boolean
    showDefault?: boolean
  }>(),
  {
    initial: null,
    submitText: '保存',
    loading: false,
    allowEmptyName: false,
    showDefault: true,
  },
)

const emit = defineEmits<{
  (event: 'submit', payload: BabyFormPayload): void
}>()

const name = ref(props.initial?.name ?? '')
const gender = ref<Gender>(props.initial?.gender ?? 'UNKNOWN')
const birthDate = ref(props.initial?.birthDate ?? '')
const isDefault = ref(props.initial?.isDefault ?? false)
const errors = reactive({ name: '', birthDate: '' })
const bounds = computed(() => babyBirthDateBounds())

watch(
  () => props.initial,
  (value) => {
    name.value = value?.name ?? ''
    gender.value = value?.gender ?? 'UNKNOWN'
    birthDate.value = value?.birthDate ?? ''
    isDefault.value = value?.isDefault ?? false
    errors.name = ''
    errors.birthDate = ''
  },
)

watch(name, () => {
  if (errors.name) errors.name = validateBabyName(name.value, props.allowEmptyName) ?? ''
})

watch(birthDate, () => {
  if (errors.birthDate) errors.birthDate = validateBirthDate(birthDate.value) ?? ''
})

function validate(): boolean {
  errors.name = validateBabyName(name.value, props.allowEmptyName) ?? ''
  errors.birthDate = validateBirthDate(birthDate.value) ?? ''
  return !errors.name && !errors.birthDate
}

function handleSubmit(): void {
  if (!validate()) return
  emit('submit', {
    name: name.value.trim() || (props.allowEmptyName ? '宝宝' : ''),
    gender: gender.value,
    birthDate: birthDate.value,
    isDefault: isDefault.value,
  })
}

defineExpose({ validate })
</script>

<template>
  <div class="baby-form">
    <van-cell-group inset class="baby-form__group">
      <van-field
        v-model="name"
        label="昵称"
        placeholder="例如：小满"
        maxlength="40"
        clearable
        :error-message="errors.name"
      />

      <van-field label="性别">
        <template #input>
          <van-radio-group v-model="gender" direction="horizontal">
            <van-radio name="MALE">男宝</van-radio>
            <van-radio name="FEMALE">女宝</van-radio>
            <van-radio name="UNKNOWN">暂不设置</van-radio>
          </van-radio-group>
        </template>
      </van-field>

      <van-field label="出生日期" :error-message="errors.birthDate">
        <template #input>
          <input
            v-model="birthDate"
            class="baby-form__date"
            type="date"
            :min="bounds.min"
            :max="bounds.max"
          />
        </template>
      </van-field>

      <van-cell v-if="showDefault" title="设为默认宝宝">
        <template #right-icon>
          <van-switch v-model="isDefault" size="20px" />
        </template>
      </van-cell>
    </van-cell-group>

    <van-button
      class="baby-form__submit"
      type="primary"
      block
      round
      :loading="loading"
      @click="handleSubmit"
    >
      {{ submitText }}
    </van-button>
  </div>
</template>

<style scoped>
.baby-form__group {
  margin: 0;
  overflow: hidden;
}

.baby-form__date {
  width: 100%;
  border: 0;
  outline: none;
  background: transparent;
  font: inherit;
  color: inherit;
}

.baby-form__submit {
  margin-top: 22px;
}
</style>
