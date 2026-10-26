<script setup lang="ts">
defineEmits<{
  (event: 'click'): void
}>()
</script>

<template>
  <button class="quick-fab" type="button" aria-label="快速记录喂养" @click="$emit('click')">
    <span class="quick-fab__plus" aria-hidden="true">+</span>
  </button>
</template>

<style scoped>
.quick-fab {
  position: fixed;
  right: 18px;
  bottom: calc(66px + env(safe-area-inset-bottom));
  z-index: 20;
  display: flex;
  width: 56px;
  height: 56px;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 50%;
  background: linear-gradient(135deg, #ffa07a, #ff7a52);
  box-shadow: 0 6px 16px rgba(255, 122, 82, 0.38);
  color: #fff;
  font: inherit;
}

.quick-fab:active {
  transform: scale(0.96);
}

.quick-fab__plus {
  margin-top: -2px;
  font-size: 32px;
  font-weight: 300;
  line-height: 1;
}
</style>
