import { defineStore } from 'pinia'

let hideTimer: ReturnType<typeof setTimeout> | null = null

export const useUiStore = defineStore('ui', {
  state: () => ({
    toastVisible: false,
    toastMessage: '',
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
  },
})
