<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { ApiError } from '@/api/client'
import {
  createFeedingExport,
  isExportLinkExpired,
  resolveExportDownloadUrl,
  triggerExportDownload,
  type FeedingExportTicket,
} from '@/api/export'
import {
  EXPORT_CLIPBOARD_UNAVAILABLE_COPY,
  EXPORT_FAILURE_COPY,
  EXPORT_FALLBACK_COPY,
  EXPORT_LINK_EXPIRED_COPY,
  EXPORT_RATE_LIMIT_COPY,
  EXPORT_TOO_LARGE_COPY,
} from '@/constants/copy'
import { useUiStore } from '@/stores/ui'
import type { Baby } from '@/types/models'
import {
  addDaysToDateString,
  parseLocalDate,
  todayLocalDate,
} from '@/utils/date'

const props = defineProps<{
  show: boolean
  baby: Baby | null
}>()

const emit = defineEmits<{
  (event: 'update:show', value: boolean): void
}>()

const MAX_EXPORT_DAYS = 366
const DEFAULT_RANGE_DAYS = 7

const ui = useUiStore()

const from = ref('')
const to = ref('')
const loading = ref(false)
const errorText = ref('')
const ticket = ref<FeedingExportTicket | null>(null)
const copied = ref(false)
const nowMs = ref(Date.now())
let expiryTimer: ReturnType<typeof setInterval> | null = null

/** 签名链接 TTL 由服务端 expiresAt 决定（Q-16，300 秒） */
const linkExpired = computed(() =>
  ticket.value ? isExportLinkExpired(ticket.value.expiresAt, nowMs.value) : false,
)

function stopExpiryTimer(): void {
  if (expiryTimer) clearInterval(expiryTimer)
  expiryTimer = null
}

function startExpiryTimer(): void {
  stopExpiryTimer()
  nowMs.value = Date.now()
  // 只需在 TTL 边界附近刷新，5 秒粒度足够
  expiryTimer = setInterval(() => {
    nowMs.value = Date.now()
  }, 5_000)
}

watch(ticket, (value) => {
  if (value) startExpiryTimer()
  else stopExpiryTimer()
})

onBeforeUnmount(stopExpiryTimer)

const maxDate = todayLocalDate()
const downloadUrl = computed(() =>
  ticket.value ? resolveExportDownloadUrl(ticket.value.downloadUrl) : '',
)
const spanDays = computed(() => {
  if (!from.value || !to.value) return 0
  const diff = parseLocalDate(to.value).getTime() - parseLocalDate(from.value).getTime()
  return Math.max(0, Math.round(diff / 86_400_000) + 1)
})

function defaultFrom(baby: Baby | null): string {
  const today = todayLocalDate()
  const weekAgo = addDaysToDateString(today, -(DEFAULT_RANGE_DAYS - 1))
  if (baby && baby.birthDate > weekAgo) {
    return baby.birthDate > today ? today : baby.birthDate
  }
  return weekAgo
}

function reset(): void {
  from.value = defaultFrom(props.baby)
  to.value = maxDate
  loading.value = false
  errorText.value = ''
  ticket.value = null
  copied.value = false
}

watch(
  () => [props.show, props.baby?.id] as const,
  ([visible]) => {
    if (visible) reset()
  },
  { immediate: true },
)

function validateRange(): string | null {
  if (!from.value || !to.value) return '请选择导出日期范围'
  if (from.value > to.value) return '开始日期不能晚于结束日期'
  if (spanDays.value > MAX_EXPORT_DAYS) return `导出跨度不能超过 ${MAX_EXPORT_DAYS} 天`
  return null
}

function exportErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === 'EXPORT_TOO_LARGE') {
      const data = error.data as { rowCount?: number; maxRows?: number } | null | undefined
      if (data?.rowCount && data?.maxRows) {
        return `导出数据过多（${data.rowCount} 行，最多 ${data.maxRows} 行），请缩小日期范围。`
      }
      return EXPORT_TOO_LARGE_COPY
    }
    if (error.status === 429) return EXPORT_RATE_LIMIT_COPY
    if (error.code === 'VALIDATION_ERROR' && error.message) return error.message
  }
  return EXPORT_FAILURE_COPY
}

async function handleSubmit(): Promise<void> {
  if (!props.baby || loading.value) return
  const rangeError = validateRange()
  if (rangeError) {
    errorText.value = rangeError
    return
  }
  loading.value = true
  errorText.value = ''
  ticket.value = null
  copied.value = false
  try {
    const result = await createFeedingExport({
      babyId: props.baby.id,
      from: from.value,
      to: to.value,
    })
    ticket.value = result
    triggerExportDownload(result.downloadUrl)
    ui.toast(result.rowCount > 0 ? `已生成 ${result.rowCount} 条记录` : '该范围没有记录，已生成表头')
  } catch (error) {
    errorText.value = exportErrorMessage(error)
  } finally {
    loading.value = false
  }
}

function ensureLinkUsable(): boolean {
  if (linkExpired.value) {
    errorText.value = EXPORT_LINK_EXPIRED_COPY
    return false
  }
  return true
}

function downloadAgain(): void {
  if (!ticket.value) return
  if (!ensureLinkUsable()) return
  triggerExportDownload(ticket.value.downloadUrl)
}

async function copyLink(): Promise<void> {
  if (!downloadUrl.value) return
  // 过期链接复制后同样打不开，直接提示重新导出
  if (!ensureLinkUsable()) return
  try {
    const clipboard = typeof navigator === 'undefined' ? undefined : navigator.clipboard
    if (!clipboard || typeof clipboard.writeText !== 'function') {
      ui.toast(EXPORT_CLIPBOARD_UNAVAILABLE_COPY)
      return
    }
    await clipboard.writeText(downloadUrl.value)
    copied.value = true
    ui.toast('链接已复制')
  } catch {
    ui.toast(EXPORT_CLIPBOARD_UNAVAILABLE_COPY)
  }
}
</script>

<template>
  <van-popup
    :show="show"
    position="bottom"
    round
    data-testid="export-dialog"
    @update:show="emit('update:show', $event)"
  >
    <div class="export-sheet">
      <h3 class="export-sheet__title">导出喂养记录</h3>
      <p class="export-sheet__desc text-secondary">
        {{ baby ? `宝宝：${baby.name}` : '请先创建宝宝档案' }}
      </p>

      <div class="export-sheet__range">
        <label class="export-sheet__field">
          <span>开始日期</span>
          <input
            v-model="from"
            type="date"
            :min="baby?.birthDate"
            :max="to || maxDate"
            data-testid="export-range-start"
          />
        </label>
        <label class="export-sheet__field">
          <span>结束日期</span>
          <input
            v-model="to"
            type="date"
            :min="from || baby?.birthDate"
            :max="maxDate"
            data-testid="export-range-end"
          />
        </label>
      </div>

      <p v-if="spanDays > 0" class="export-sheet__hint text-secondary">
        共 {{ spanDays }} 天（最多 {{ MAX_EXPORT_DAYS }} 天）
      </p>
      <p v-if="errorText" class="export-sheet__error" data-testid="export-error">
        {{ errorText }}
      </p>

      <van-button
        type="primary"
        block
        round
        :loading="loading"
        :disabled="!baby"
        data-testid="export-submit"
        @click="handleSubmit"
      >
        生成导出链接
      </van-button>

      <div v-if="ticket" class="export-sheet__result" data-testid="export-result">
        <p class="export-sheet__row-count" data-testid="export-row-count">
          {{
            ticket.rowCount > 0
              ? `共 ${ticket.rowCount} 条记录`
              : '该范围没有记录，将下载仅含表头的 CSV'
          }}
        </p>
        <p v-if="linkExpired" class="export-sheet__error" data-testid="export-link-expired">
          {{ EXPORT_LINK_EXPIRED_COPY }}
        </p>
        <p v-else class="export-sheet__hint text-secondary">链接 5 分钟内有效。</p>
        <input
          class="export-sheet__link"
          :value="downloadUrl"
          readonly
          data-testid="export-link"
        />
        <div class="export-sheet__actions">
          <van-button size="small" plain type="primary" data-testid="export-download-again" @click="downloadAgain">
            重新下载
          </van-button>
          <van-button size="small" plain data-testid="export-copy-link" @click="copyLink">
            {{ copied ? '已复制' : '复制链接' }}
          </van-button>
        </div>
        <p class="export-sheet__fallback" data-testid="export-fallback-copy">
          {{ EXPORT_FALLBACK_COPY }}
        </p>
      </div>
    </div>
  </van-popup>
</template>

<style scoped>
.export-sheet {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 20px 16px calc(24px + env(safe-area-inset-bottom));
}

.export-sheet__title {
  margin: 0;
  font-size: 18px;
}

.export-sheet__desc {
  margin: 0;
  font-size: 13px;
}

.export-sheet__range {
  display: flex;
  gap: 10px;
}

.export-sheet__field {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 6px;
  font-size: 12px;
  color: var(--app-text-secondary);
}

.export-sheet__field input {
  padding: 8px 10px;
  border: 1px solid #ebedf0;
  border-radius: 8px;
  font: inherit;
  color: inherit;
}

.export-sheet__hint {
  margin: 0;
  font-size: 12px;
}

.export-sheet__error {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: #ee0a24;
}

.export-sheet__result {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-top: 8px;
  border-top: 1px solid #f2f3f5;
}

.export-sheet__row-count {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
}

.export-sheet__link {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid #ebedf0;
  border-radius: 8px;
  font-size: 12px;
  color: var(--app-text-secondary);
  background: #fafafa;
}

.export-sheet__actions {
  display: flex;
  gap: 10px;
}

.export-sheet__fallback {
  margin: 0;
  font-size: 12px;
  line-height: 1.6;
  color: #ad6800;
}
</style>
