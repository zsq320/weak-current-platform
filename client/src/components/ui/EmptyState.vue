<template>
  <div class="empty-state">
    <div class="icon">{{ icon }}</div>
    <div class="text">{{ text }}</div>
    <div class="action" v-if="$slots.default"><slot /></div>
  </div>
</template>

<script setup>
// 统一空状态：场景图标 + 一句话说明 + 可选主操作按钮
defineProps({
  icon: { type: String, default: '📭' },
  text: { type: String, default: '暂无数据' }
})
</script>

<style scoped>
.empty-state{ text-align:center;padding:40px 16px; }
.icon{ font-size:40px;margin-bottom:10px;opacity:.85; }
.text{ color:#94A3B8;font-size:13.5px; }
.action{ margin-top:14px; }
</style>
