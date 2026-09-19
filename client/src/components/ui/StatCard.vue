<template>
  <div class="kpi">
    <div class="ic" :style="{ background: iconBg, color: iconColor }">
      <el-icon :size="22"><component :is="icon" /></el-icon>
    </div>
    <div class="bd">
      <div class="num">{{ value }}</div>
      <div class="lb">{{ label }}</div>
    </div>
  </div>
</template>

<script setup>
// KPI 统计卡：图标使用 Element 线性图标组件名（全局注册），禁用 emoji
// 桌面 4 列 / 平板 2 列 / 手机 2 列
defineProps({
  icon: { type: [String, Object], default: 'DataAnalysis' },
  iconBg: { type: String, default: 'var(--brand-50)' },
  iconColor: { type: String, default: 'var(--brand-700)' },
  value: { type: [Number, String], default: '-' },
  label: { type: String, default: '' }
})
</script>

<style scoped>
.kpi{
  background:#fff;border:1px solid var(--line);border-radius:var(--r-lg);padding:15px 16px;
  box-shadow:var(--sh-1);display:flex;align-items:center;gap:13px;height:100%;
}
.ic{ width:44px;height:44px;border-radius:8px;display:flex;align-items:center;justify-content:center;flex:none; }
.num{ font-size:22px;font-weight:700;color:var(--ink-900);font-variant-numeric:tabular-nums;line-height:1.2; }
.lb{ font-size:12.5px;color:var(--ink-500);margin-top:2px; }
</style>
