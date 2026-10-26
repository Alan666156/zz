<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import BabyForm from '@/components/baby/BabyForm.vue'
import { useBabyStore } from '@/stores/baby'
import { useDeviceStore } from '@/stores/device'
import { useUiStore } from '@/stores/ui'

interface Payload {
  name: string
  gender: 'MALE' | 'FEMALE' | 'UNKNOWN'
  birthDate: string
  isDefault: boolean
}

const router = useRouter()
const babyStore = useBabyStore()
const deviceStore = useDeviceStore()
const ui = useUiStore()

const loading = ref(false)
const errorText = ref('')

async function handleSubmit(payload: Payload): Promise<void> {
  loading.value = true
  errorText.value = ''
  try {
    deviceStore.bootstrap()
    const baby = await babyStore.createBaby({
      name: payload.name || '宝宝',
      gender: payload.gender,
      birthDate: payload.birthDate,
      isDefault: true,
    })
    if (baby.revision === 0) {
      ui.toast('已保存到本机，联网后自动同步')
    } else {
      ui.toast('欢迎使用')
    }
    await router.replace({ name: 'home' })
  } catch (error) {
    errorText.value = error instanceof Error ? error.message : '创建失败，请稍后重试'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="onboarding">
    <div class="onboarding__hero">
      <div class="onboarding__badge">喂养记录</div>
      <h1 class="onboarding__title">记录宝宝的每一餐</h1>
      <p class="onboarding__desc">
        无需注册，数据保存在本机并同步到当前设备。先创建一个宝宝档案开始使用。
      </p>
    </div>

    <div class="onboarding__form card">
      <BabyForm
        :loading="loading"
        :allow-empty-name="true"
        :show-default="false"
        submit-text="开始使用"
        @submit="handleSubmit"
      />
      <p v-if="errorText" class="onboarding__error">{{ errorText }}</p>
      <p class="onboarding__hint text-secondary">
        昵称可留空，默认使用“宝宝”；之后可在“我的”中修改。清除浏览器数据会导致本机记录丢失。
      </p>
    </div>
  </div>
</template>

<style scoped>
.onboarding {
  min-height: 100vh;
  padding: 36px 18px calc(32px + env(safe-area-inset-bottom));
  background:
    radial-gradient(circle at 18% 8%, rgba(255, 138, 101, 0.18), transparent 45%),
    var(--app-bg);
}

.onboarding__hero {
  padding: 0 6px 24px;
}

.onboarding__badge {
  display: inline-block;
  padding: 4px 10px;
  border-radius: 999px;
  background: rgba(255, 138, 101, 0.14);
  color: var(--app-primary-dark);
  font-size: 12px;
  font-weight: 600;
}

.onboarding__title {
  margin: 14px 0 8px;
  font-size: 26px;
  line-height: 1.3;
  letter-spacing: 0.5px;
}

.onboarding__desc {
  margin: 0;
  font-size: 14px;
  line-height: 1.7;
  color: var(--app-text-secondary);
}

.onboarding__form {
  padding: 18px 0 20px;
}

.onboarding__form :deep(.baby-form) {
  padding: 0 14px;
}

.onboarding__error {
  margin: 12px 18px 0;
  font-size: 13px;
  color: var(--app-danger);
}

.onboarding__hint {
  margin: 14px 18px 0;
  font-size: 12px;
  line-height: 1.6;
}
</style>
