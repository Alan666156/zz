<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import {
  ROUTE_LOAD_ERROR_CANCEL,
  ROUTE_LOAD_ERROR_GENERIC,
  ROUTE_LOAD_ERROR_OFFLINE,
  ROUTE_LOAD_ERROR_RETRY,
  ROUTE_LOAD_ERROR_TITLE,
} from '@/constants/copy'
import { navigateSafely } from '@/router/route-load-error'
import { useUiStore } from '@/stores/ui'

const router = useRouter()
const ui = useUiStore()

const message = computed(() =>
  ui.routeLoadErrorOffline ? ROUTE_LOAD_ERROR_OFFLINE : ROUTE_LOAD_ERROR_GENERIC,
)

function cancel(): void {
  ui.dismissRouteLoadError()
}

function retry(): void {
  const target = ui.routeLoadErrorTarget
  ui.dismissRouteLoadError()
  if (!target) return
  // 失败会再次触发同一个对话框；非 chunk 错误交给全局错误处理
  void navigateSafely(router, target).catch((error) => {
    console.error('[router] navigation error', error)
  })
}
</script>

<template>
  <van-popup
    v-if="ui.routeLoadErrorVisible"
    :show="true"
    round
    :close-on-click-overlay="false"
    class="route-load-error"
  >
    <div class="route-load-error__body" role="dialog" aria-modal="true" data-testid="route-load-error">
      <h2 class="route-load-error__title">{{ ROUTE_LOAD_ERROR_TITLE }}</h2>
      <p class="route-load-error__message">{{ message }}</p>
      <div class="route-load-error__actions">
        <van-button block data-testid="route-load-cancel" @click="cancel">
          {{ ROUTE_LOAD_ERROR_CANCEL }}
        </van-button>
        <van-button block type="primary" data-testid="route-load-retry" @click="retry">
          {{ ROUTE_LOAD_ERROR_RETRY }}
        </van-button>
      </div>
    </div>
  </van-popup>
</template>

<style scoped>
.route-load-error {
  width: 80%;
  max-width: 320px;
  overflow: hidden;
}

.route-load-error__body {
  padding: 24px 20px 16px;
  text-align: center;
}

.route-load-error__title {
  margin: 0 0 12px;
  color: #323233;
  font-size: 17px;
  font-weight: 600;
}

.route-load-error__message {
  margin: 0 0 20px;
  color: #646566;
  font-size: 14px;
  line-height: 1.6;
}

.route-load-error__actions {
  display: flex;
  gap: 12px;
}
</style>
