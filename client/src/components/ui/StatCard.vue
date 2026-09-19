<template>
  <div class="kpi">
    <div class="ic" :style="{ background: iconBg, color: iconColor }">{{ icon }}</div>
    <div class="bd">
      <div class="num">{{ value }}</div>
      <div class="lb">{{ label }}</div>
    </div>
  </div>
</template>

<script setup>
// KPI 统计卡：桌面 4 列 / 平板 2 列 / 手机 2 列，永不再竖排
defineProps({
  icon: { type: String, default: '📄' },
  iconBg: { type: String, default: '#EFF5FF' },
  iconColor: { type: String, default: '#2563EB' },
  value: { type: [Number, String], default: '-' },
  label: { type: String, default: '' }
})
</script>

<style scoped>
.kpi{
  background:#fff;border:1px solid #E2E8F0;border-radius:10px;padding:16px 18px;
  box-shadow:0 1px 2px rgba(15,42,67,.06);display:flex;align-items:center;gap:14px;height:100%;
}
.ic{ width:44px;height:44px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:20px;flex:none; }
.num{ font-size:23px;font-weight:700;color:#0F172A;font-variant-numeric:tabular-nums;line-height:1.2; }
.lb{ font-size:12.5px;color:#64748B; }
</style>
