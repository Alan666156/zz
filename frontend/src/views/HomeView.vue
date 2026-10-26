<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import BabyCard from '@/components/baby/BabyCard.vue'
import BabySwitcher from '@/components/baby/BabySwitcher.vue'
import OfflineBanner from '@/components/common/OfflineBanner.vue'
import DailySummaryCard from '@/components/record/DailySummaryCard.vue'
import FeedingTimeline from '@/components/record/FeedingTimeline.vue'
import QuickRecordFab from '@/components/record/QuickRecordFab.vue'
import QuickRecordSheet from '@/components/record/QuickRecordSheet.vue'
import { useBabyStore } from '@/stores/baby'
import { useFeedingStore } from '@/stores/feeding'
import type { BreastSide, FeedingRecord, FeedingType } from '@/types/models'
import { todayLocalDate } from '@/utils/date'
import { getStorageItem, removeStorageItem, setStorageItem } from '@/utils/storage'

const LAST_SIDE_KEY = 'zz.bf.lastBreastSide'
const LAST_AMOUNT_KEY = 'zz.bf.lastFormulaAmount'
const LAST_FEED_TYPE_KEY = 'zz.bf.lastFeedType'
const LEGACY_LAST_SIDE_KEY = 'zz.lastBreastSide'
const LEGACY_LAST_AMOUNT_KEY = 'zz.lastFormulaAmount'

const router = useRouter()
const babyStore = useBabyStore()
const feedingStore = useFeedingStore()

const online = ref(typeof navigator === 'undefined' ? true : navigator.onLine !== false)
const showSwitcher = ref(false)
const showRecord = ref(false)

/** 迁移旧版本地偏好 key */
function readMigrated(key: string, legacyKey: string): string | null {
  const current = getStorageItem(key)
  if (current !== null) {
    removeStorageItem(legacyKey)
    return current
  }
  const legacy = getStorageItem(legacyKey)
  if (legacy !== null) {
    setStorageItem(key, legacy)
    removeStorageItem(legacyKey)
    return legacy
  }
  return null
}

function parseSide(value: string | null): BreastSide {
  return value === 'LEFT' || value === 'RIGHT' || value === 'BOTH' ? value : 'LEFT'
}

function parseAmount(value: string | null): number | null {
  if (!value) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function parseFeedType(value: string | null): FeedingType {
  return value === 'BREAST' || value === 'FORMULA' || value === 'MIXED' || value === 'SOLID'
    ? value
    : 'BREAST'
}

const lastSide = ref<BreastSide>(
  parseSide(readMigrated(LAST_SIDE_KEY, LEGACY_LAST_SIDE_KEY)),
)
const lastAmount = ref<number | null>(
  parseAmount(readMigrated(LAST_AMOUNT_KEY, LEGACY_LAST_AMOUNT_KEY)),
)
const lastFeedType = ref<FeedingType>(parseFeedType(getStorageItem(LAST_FEED_TYPE_KEY)))

const activeBaby = computed(() => babyStore.activeBaby)
const pendingTotal = computed(
  () =>
    feedingStore.pendingCount +
    babyStore.babies.filter((baby) => baby.revision === 0).length,
)

async function refreshToday(): Promise<void> {
  const baby = activeBaby.value
  if (!baby) return
  await feedingStore.loadDay(baby.id, todayLocalDate())
}

watch(
  () => activeBaby.value?.id,
  (id) => {
    if (id) void refreshToday()
  },
  { immediate: true },
)

function handleOnline(): void {
  online.value = true
  void refreshToday()
}

function handleOffline(): void {
  online.value = false
}

function handleSaved(record: FeedingRecord): void {
  lastFeedType.value = record.feedType
  setStorageItem(LAST_FEED_TYPE_KEY, record.feedType)
  if (record.breastSide) {
    lastSide.value = record.breastSide
    setStorageItem(LAST_SIDE_KEY, record.breastSide)
  }
  if (record.amountUnit === 'ML' && record.amountValue !== null) {
    lastAmount.value = record.amountValue
    setStorageItem(LAST_AMOUNT_KEY, String(record.amountValue))
  }
}

function handleTypeChange(feedType: FeedingType): void {
  lastFeedType.value = feedType
  setStorageItem(LAST_FEED_TYPE_KEY, feedType)
}

function openAddBaby(): void {
  void router.push({ name: 'baby-new' })
}

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
  <div class="page home">
    <OfflineBanner :online="online" :pending-count="pendingTotal" />

    <template v-if="activeBaby">
      <BabyCard :baby="activeBaby" active @click="showSwitcher = true" />
      <DailySummaryCard :summary="feedingStore.todaySummary" :loading="feedingStore.loading" />
      <FeedingTimeline
        :records="feedingStore.sortedRecords"
        :loading="feedingStore.loading"
        :pending-ids="feedingStore.pendingIds"
      />
      <QuickRecordFab @click="showRecord = true" />
    </template>

    <div v-else class="home__empty card">
      <p class="home__empty-title">还没有宝宝档案</p>
      <van-button type="primary" round @click="openAddBaby">添加宝宝</van-button>
    </div>

    <BabySwitcher
      v-model:show="showSwitcher"
      :babies="babyStore.babies"
      :active-id="babyStore.activeBabyId"
      :can-add-more="babyStore.canAddMore"
      @select="babyStore.setActiveBaby"
      @add="openAddBaby"
    />

    <QuickRecordSheet
      v-if="activeBaby"
      v-model:show="showRecord"
      :baby-id="activeBaby.id"
      :default-side="lastSide"
      :default-feed-type="lastFeedType"
      :last-amount="lastAmount"
      @saved="handleSaved"
      @type-change="handleTypeChange"
    />
  </div>
</template>

<style scoped>
.home {
  padding-top: 10px;
}

.home__empty {
  margin-top: 24px;
  text-align: center;
}

.home__empty-title {
  margin: 0 0 14px;
  font-size: 15px;
  font-weight: 600;
}
</style>
