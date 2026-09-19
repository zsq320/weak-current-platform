<template>
  <div class="empty-state">
    <div class="icon"><el-icon :size="42"><component :is="icon" /></el-icon></div>
    <div class="text">{{ text }}</div>
    <div class="action" v-if="$slots.default"><slot /></div>
  </div>
</template>

<script setup>
// 统一空状态：线性图标 + 一句话说明 + 可选主操作按钮（禁用 emoji）
defineProps({
  icon: { type: [String, Object], default: 'Box' },
  text: { type: String, default: '暂无数据' }
})
</script>

<style scoped>
.empty-state{ text-align:center;padding:44px 16px; }
.icon{ color:var(--ink-400); margin-bottom:12px; opacity:.65; }
.text{ color:var(--ink-400);font-size:13.5px; }
.action{ margin-top:14px; }
</style>
