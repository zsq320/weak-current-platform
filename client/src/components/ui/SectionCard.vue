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
// 分区卡片：带工程蓝竖条标题栏
defineProps({ title: String })
</script>

<style scoped>
.section-card{ background:#fff;border:1px solid var(--line);border-radius:var(--r-lg);box-shadow:var(--sh-1); }
.hd{ display:flex;justify-content:space-between;align-items:center;padding:12px 16px;border-bottom:1px solid var(--line-soft); }
.hd-l{ display:flex;align-items:center;gap:8px; }
.bar{ width:3px;height:14px;background:var(--brand-700);border-radius:2px; }
.tt{ font-size:15px;font-weight:600;color:var(--ink-900); }
.bd{ padding:16px; }
</style>
