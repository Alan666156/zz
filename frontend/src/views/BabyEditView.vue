<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import BabyForm from '@/components/baby/BabyForm.vue'
import { navigateSafely } from '@/router/route-load-error'
import { useBabyStore } from '@/stores/baby'
import { useUiStore } from '@/stores/ui'
import type { Gender } from '@/types/models'

interface Payload {
  name: string
  gender: Gender
  birthDate: string
  isDefault: boolean
}

const route = useRoute()
const router = useRouter()
const babyStore = useBabyStore()
const ui = useUiStore()

const isNew = computed(() => route.name === 'baby-new')
const babyId = computed(() => (typeof route.params.id === 'string' ? route.params.id : ''))
const current = computed(() =>
  babyId.value ? babyStore.babies.find((baby) => baby.id === babyId.value) ?? null : null,
)

const loading = ref(false)
const errorText = ref('')

onMounted(async () => {
  if (!babyStore.loaded) {
    await babyStore.load()
  }
  if (isNew.value && !babyStore.canAddMore) {
    ui.toast('最多只能添加 5 个宝宝')
    await navigateSafely(router, { name: 'profile' }, { replace: true })
    return
  }
  if (!isNew.value && !current.value) {
    ui.toast('宝宝不存在或已删除')
    await navigateSafely(router, { name: 'profile' }, { replace: true })
  }
})

async function handleSubmit(payload: Payload): Promise<void> {
  loading.value = true
  errorText.value = ''
  try {
    if (isNew.value) {
      await babyStore.createBaby(payload)
      ui.toast('宝宝已添加')
    } else if (current.value) {
      await babyStore.updateBaby(current.value.id, payload)
      ui.toast('已保存')
    }
    await navigateSafely(router, { name: 'profile' }, { replace: true })
  } catch (error) {
    errorText.value = error instanceof Error ? error.message : '保存失败，请稍后重试'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="baby-edit">
    <van-nav-bar
      :title="isNew ? '添加宝宝' : '编辑宝宝'"
      left-text="返回"
      left-arrow
      @click-left="router.back()"
    />
    <div class="baby-edit__body">
      <BabyForm
        :initial="current"
        :loading="loading"
        :submit-text="isNew ? '添加宝宝' : '保存修改'"
        @submit="handleSubmit"
      />
      <p v-if="errorText" class="baby-edit__error">{{ errorText }}</p>
      <p v-if="!isNew" class="baby-edit__hint text-secondary">
        修改出生日期会影响月龄展示，请确认无误。
      </p>
    </div>
  </div>
</template>

<style scoped>
.baby-edit {
  min-height: 100vh;
  background: var(--app-bg);
}

.baby-edit__body {
  padding: 18px 14px calc(24px + env(safe-area-inset-bottom));
}

.baby-edit__error {
  margin: 14px 4px 0;
  font-size: 13px;
  color: var(--app-danger);
}

.baby-edit__hint {
  margin: 14px 4px 0;
  font-size: 12px;
  line-height: 1.6;
}
</style>
