<template>
  <div class="section-card">
    <div class="hd" v-if="title || $slots.extra">
      <div class="hd-l"><span class="bar"></span><span class="tt">{{ title }}</span><slot name="extra" /></div>
      <div class="hd-r"><slot name="actions" /></div>
    </div>
    <div class="bd"><slot /></div>
  </div>
</template>

<script setup>
// 分区卡片：带品牌色竖条标题栏
defineProps({ title: String })
</script>

<style scoped>
.section-card{ background:#fff;border:1px solid #E2E8F0;border-radius:10px;box-shadow:0 1px 2px rgba(15,42,67,.06); }
.hd{ display:flex;justify-content:space-between;align-items:center;padding:12px 16px;border-bottom:1px solid #EEF1F5; }
.hd-l{ display:flex;align-items:center;gap:8px; }
.bar{ width:3px;height:14px;background:#2563EB;border-radius:2px; }
.tt{ font-size:15px;font-weight:600;color:#0F172A; }
.bd{ padding:16px; }
</style>
