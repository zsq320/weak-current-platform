<template>
  <span class="status-tag" :class="`is-${resolvedType}`">{{ resolvedText }}</span>
</template>

<script setup>
// 全站统一状态标签：五套状态映射（工程/投标/合同/资金/工单）或直接传 type+text
import { computed } from 'vue'

const props = defineProps({
  kind: { type: String, default: '' },   // project | bid | contract | fund | warranty
  status: { type: String, default: '' },
  type: { type: String, default: '' },   // 直接指定：info | warn | success | danger | muted
  text: { type: String, default: '' }
})

const MAPS = {
  project: {
    pending: ['muted', '待发布'], bidding: ['info', '招标中'], in_progress: ['warn', '进行中'],
    completed: ['success', '已完成'], cancelled: ['danger', '已取消']
  },
  bid: {
    pending: ['warn', '待定'], accepted: ['success', '已中标'], rejected: ['danger', '已拒绝']
  },
  contract: {
    active: ['warn', '履行中'], completed: ['success', '已完成'], terminated: ['danger', '已终止']
  },
  fund: {
    none: ['muted', '未托管'], frozen: ['info', '托管中'], settled: ['success', '已结算'], refunded: ['muted', '已退回']
  },
  warranty: {
    open: ['warn', '待处理'], processing: ['info', '处理中'], resolved: ['success', '已解决'], closed: ['muted', '已关闭']
  }
}

const resolved = computed(() => {
  if (props.kind && MAPS[props.kind]?.[props.status]) return MAPS[props.kind][props.status]
  return [props.type || 'muted', props.text || props.status || '-']
})
const resolvedType = computed(() => resolved.value[0])
const resolvedText = computed(() => resolved.value[1])
</script>

<style scoped>
.status-tag{
  display:inline-flex;align-items:center;padding:1px 9px;border-radius:var(--r-sm);
  font-size:12px;line-height:20px;font-weight:500;white-space:nowrap;
}
.is-success{ background:var(--success-50);color:var(--success-600);border:1px solid var(--success-100); }
.is-warn{ background:var(--warn-50);color:var(--warn-600);border:1px solid var(--warn-100); }
.is-danger{ background:var(--danger-50);color:var(--danger-600);border:1px solid var(--danger-100); }
.is-info{ background:var(--brand-50);color:var(--brand-700);border:1px solid var(--brand-200); }
.is-muted{ background:var(--bg-muted);color:var(--ink-500);border:1px solid var(--line); }
</style>
