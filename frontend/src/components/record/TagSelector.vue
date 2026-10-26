<script setup lang="ts">
import { FEEDING_TAGS, FEEDING_TAG_LABELS, type FeedingTag } from '@/types/models'

const props = defineProps<{
  tags: FeedingTag[]
}>()

const emit = defineEmits<{
  (event: 'update:tags', value: FeedingTag[]): void
}>()

function toggle(tag: FeedingTag): void {
  const exists = props.tags.includes(tag)
  emit('update:tags', exists ? props.tags.filter((item) => item !== tag) : [...props.tags, tag])
}
</script>

<template>
  <div class="tags">
    <span class="tags__label text-secondary">标签</span>
    <div class="tags__list">
      <button
        v-for="tag in FEEDING_TAGS"
        :key="tag"
        type="button"
        class="tags__item"
        :class="{ 'tags__item--active': tags.includes(tag) }"
        :aria-pressed="tags.includes(tag)"
        :data-testid="`feeding-tag-${tag.toLowerCase()}`"
        @click="toggle(tag)"
      >
        {{ FEEDING_TAG_LABELS[tag] }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.tags {
  padding: 10px 16px 0;
}

.tags__label {
  display: block;
  margin-bottom: 8px;
  font-size: 13px;
}

.tags__list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.tags__item {
  padding: 6px 12px;
  border: 1px solid #ebedf0;
  border-radius: 999px;
  background: #fff;
  font: inherit;
  font-size: 13px;
  color: var(--app-text-secondary);
}

.tags__item--active {
  border-color: var(--app-primary);
  background: rgba(255, 138, 101, 0.09);
  color: var(--app-primary-dark);
}
</style>
