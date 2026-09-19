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
  display:inline-flex;align-items:center;padding:1px 10px;border-radius:4px;
  font-size:12px;line-height:20px;font-weight:500;white-space:nowrap;
}
.is-success{ background:#F0FDF4;color:#16A34A;border:1px solid #BBF0CE; }
.is-warn{ background:#FFFBEB;color:#D97706;border:1px solid #FDE9B8; }
.is-danger{ background:#FEF2F2;color:#DC2626;border:1px solid #FBC8C8; }
.is-info{ background:#EFF5FF;color:#2563EB;border:1px solid #CFE0FF; }
.is-muted{ background:#F1F5F9;color:#64748B;border:1px solid #E2E8F0; }
</style>
