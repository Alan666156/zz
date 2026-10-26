<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import DateNavigator from '@/components/record/DateNavigator.vue'
import FeedingEditSheet from '@/components/record/FeedingEditSheet.vue'
import FeedingTimeline from '@/components/record/FeedingTimeline.vue'
import { useBabyStore } from '@/stores/baby'
import { useFeedingStore } from '@/stores/feeding'
import { useUiStore } from '@/stores/ui'
import type { FeedingRecord } from '@/types/models'
import { todayLocalDate } from '@/utils/date'

const PAGE_SIZE = 20

const babyStore = useBabyStore()
const feedingStore = useFeedingStore()
const ui = useUiStore()

const today = todayLocalDate()
const selectedDate = ref(today)
const editVisible = ref(false)
const editTarget = ref<FeedingRecord | null>(null)
const deleteVisible = ref(false)
const deleteTarget = ref<FeedingRecord | null>(null)

const activeBaby = computed(() => babyStore.activeBaby)
const minDate = computed(() => activeBaby.value?.birthDate ?? today)
const hasError = computed(() => Boolean(feedingStore.lastError))

function clampDate(date: string): string {
  if (date < minDate.value) return minDate.value
  if (date > today) return today
  return date
}

function handleDateChange(date: string): void {
  selectedDate.value = clampDate(date)
}

async function loadPage(reset = true): Promise<void> {
  const baby = activeBaby.value
  if (!baby) return
  if (reset) {
    await feedingStore.loadDayPage(baby.id, selectedDate.value, 1, PAGE_SIZE, false)
  } else {
    await feedingStore.loadMore()
  }
}

function openEdit(record: FeedingRecord): void {
  editTarget.value = record
  editVisible.value = true
}

function openDelete(record: FeedingRecord): void {
  deleteTarget.value = record
  deleteVisible.value = true
}

async function confirmDelete(): Promise<void> {
  const target = deleteTarget.value
  if (!target) return
  try {
    const outcome = await feedingStore.deleteRecord(target)
    if (outcome.status === 'synced') {
      ui.toast('已删除')
    } else if (outcome.status === 'pending') {
      ui.toast(outcome.message ?? '已删除，联网后同步')
    } else if (outcome.status === 'conflict') {
      ui.toast(outcome.message ?? '该记录已在其他端更新')
    } else {
      ui.toast(outcome.message ?? '删除失败')
      await loadPage()
    }
  } catch (error) {
    ui.toast(error instanceof Error ? error.message : '删除失败')
  } finally {
    deleteTarget.value = null
  }
}

function handleConfirmDelete(): void {
  deleteVisible.value = false
  void confirmDelete()
}

function handleOnline(): void {
  void loadPage()
}

function handleOffline(): void {
  // 离线状态由 sync store / OfflineBanner 统一展示
}

watch(
  () => activeBaby.value?.id,
  () => {
    const unchanged = selectedDate.value === today
    selectedDate.value = today
    editVisible.value = false
    deleteVisible.value = false
    if (unchanged) void loadPage()
  },
  { immediate: true },
)

watch(selectedDate, () => {
  void loadPage()
})

onMounted(() => {
  babyStore.ensureActive()
  window.addEventListener('online', handleOnline)
  window.addEventListener('offline', handleOffline)
})

onBeforeUnmount(() => {
  window.removeEventListener('online', handleOnline)
  window.removeEventListener('offline', handleOffline)
})
</script>

<template>
  <div class="page records" data-testid="records-page">
    <DateNavigator
      :date="selectedDate"
      :min-date="minDate"
      :max-date="today"
      :today="today"
      @update:date="handleDateChange"
    />

    <div v-if="hasError" class="records__error card" data-testid="records-error">
      <span>{{ feedingStore.lastError }}</span>
      <van-button size="mini" plain type="primary" @click="loadPage()">重试</van-button>
    </div>

    <div
      v-if="feedingStore.loading && feedingStore.sortedRecords.length === 0"
      class="records__loading card"
      data-testid="records-loading"
    >
      加载中…
    </div>

    <template v-else>
      <FeedingTimeline
        :records="feedingStore.sortedRecords"
        :loading="feedingStore.loading"
        :pending-ids="feedingStore.pendingIds"
        title="当日记录"
        empty-title="这一天没有记录"
        empty-description="可以切换日期查看，或回到首页快速记录。"
      >
        <template #actions="{ record }">
          <div class="records__actions">
            <button
              type="button"
              class="records__action"
              data-testid="record-edit"
              @click="openEdit(record)"
            >
              编辑
            </button>
            <button
              type="button"
              class="records__action records__action--danger"
              data-testid="record-delete"
              @click="openDelete(record)"
            >
              删除
            </button>
          </div>
        </template>
      </FeedingTimeline>

      <div v-if="feedingStore.hasNext" class="records__more">
        <van-button
          block
          round
          plain
          type="primary"
          :loading="feedingStore.loadingMore"
          data-testid="records-load-more"
          @click="loadPage(false)"
        >
          加载更多
        </van-button>
      </div>
      <p v-if="feedingStore.total > 0" class="records__total text-secondary">
        已显示 {{ feedingStore.sortedRecords.length }} / {{ feedingStore.total }} 条
      </p>
    </template>

    <FeedingEditSheet v-model:show="editVisible" :record="editTarget" />

    <van-dialog
      v-model:show="deleteVisible"
      title="删除记录"
      message="删除后无法恢复，确认删除这条喂养记录吗？"
      show-cancel-button
      @confirm="handleConfirmDelete"
    >
      <template #footer>
        <div class="dialog-actions">
          <van-button
            class="dialog-actions__btn"
            size="large"
            data-testid="cancel-delete"
            @click="deleteVisible = false"
          >
            取消
          </van-button>
          <van-button
            class="dialog-actions__btn"
            size="large"
            type="danger"
            data-testid="confirm-delete"
            @click="handleConfirmDelete"
          >
            删除
          </van-button>
        </div>
      </template>
    </van-dialog>
  </div>
</template>

<style scoped>
.records {
  padding-top: 10px;
}

.records__error {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-top: 10px;
  font-size: 12px;
  color: #ad6800;
}

.records__loading {
  margin-top: 10px;
  padding: 34px 12px;
  font-size: 13px;
  color: var(--app-text-secondary);
  text-align: center;
}

.records__actions {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-top: 8px;
}

.records__action {
  padding: 2px 4px;
  border: 0;
  background: transparent;
  font: inherit;
  font-size: 12px;
  color: var(--app-primary-dark);
}

.records__action--danger {
  color: var(--app-danger);
}

.records__more {
  margin-top: 12px;
}

.records__total {
  margin: 10px 0 0;
  font-size: 11px;
  text-align: center;
}

/* 自定义 footer 才能给删除按钮挂 testid，Vant 默认按钮无 attrs 入口 */
.dialog-actions {
  display: flex;
  gap: 8px;
  padding: 0 16px 16px;
}

.dialog-actions__btn {
  flex: 1;
}
</style>
