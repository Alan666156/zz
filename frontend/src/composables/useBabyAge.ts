import { computed, toValue, type MaybeRefOrGetter } from 'vue'
import { calcBabyAge } from '@/utils/date'

export function useBabyAge(birthDate: MaybeRefOrGetter<string | null | undefined>) {
  const age = computed(() => {
    const value = toValue(birthDate)
    return value ? calcBabyAge(value) : null
  })

  const ageLabel = computed(() => age.value?.label ?? '')

  return { age, ageLabel }
}
