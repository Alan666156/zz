import { defineStore } from 'pinia'

let hideTimer: ReturnType<typeof setTimeout> | null = null

export const useUiStore = defineStore('ui', {
  state: () => ({
    toastVisible: false,
    toastMessage: '',
    /** Q-24：路由 chunk 加载失败的模态框 */
    routeLoadErrorVisible: false,
    routeLoadErrorOffline: false,
    routeLoadErrorTarget: null as string | null,
  }),
  actions: {
    toast(message: string, duration = 1600): void {
      this.toastMessage = message
      this.toastVisible = true
      if (hideTimer) {
        clearTimeout(hideTimer)
      }
      hideTimer = setTimeout(() => {
        this.toastVisible = false
        hideTimer = null
      }, duration)
    },

    showRouteLoadError(options: { offline: boolean; target: string | null }): void {
      this.routeLoadErrorOffline = options.offline
      this.routeLoadErrorTarget = options.target
      this.routeLoadErrorVisible = true
    },

    dismissRouteLoadError(): void {
      this.routeLoadErrorVisible = false
    },
  },
})
