<template>
  <span class="amount-text" :class="{ strike: strike }">¥{{ formatted }}</span>
</template>

<script setup>
// 金额展示：红色强调 + 等宽数字
import { computed } from 'vue'
const props = defineProps({
  value: { type: [Number, String], default: 0 },
  strike: { type: Boolean, default: false }
})
const formatted = computed(() => Number(props.value || 0).toLocaleString())
</script>

<style scoped>
.amount-text{ color:#DC2626;font-weight:700;font-variant-numeric:tabular-nums; }
</style>
