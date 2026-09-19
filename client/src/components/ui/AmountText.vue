<template>
  <span class="amount-text" :class="{ strike: strike }">¥{{ formatted }}</span>
</template>

<script setup>
// 金额展示：安全橙强调 + 等宽数字（区别于危险红）
import { computed } from 'vue'
const props = defineProps({
  value: { type: [Number, String], default: 0 },
  strike: { type: Boolean, default: false }
})
const formatted = computed(() => Number(props.value || 0).toLocaleString())
</script>

<style scoped>
.amount-text{ color:var(--accent-600);font-weight:700;font-variant-numeric:tabular-nums; }
.amount-text.strike{ text-decoration:line-through;color:var(--ink-400);font-weight:500; }
</style>
