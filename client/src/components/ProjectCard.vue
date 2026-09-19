<template>
  <div class="proj" @click="handleClick">
    <div class="hd" :style="{ background: categoryGradient }"></div>
    <div class="bd">
      <span class="cat">{{ project.category }}</span>
      <div class="tt">
        <span class="tt-text">{{ project.title }}</span>
        <StatusTag kind="project" :status="project.status" />
        <span v-if="requireLogin" class="need-login"><el-icon><Lock /></el-icon> 需登录</span>
      </div>
      <div class="ds">{{ project.description?.substring(0, 60) }}{{ project.description?.length > 60 ? '…' : '' }}</div>
      <div class="ft">
        <span class="budget">¥{{ formatBudget(project.budget) }}</span>
        <span class="meta">📍 {{ project.location || '未填写' }} · 👷 {{ project.bid_count || 0 }} 人投标</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { Lock } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import StatusTag from './ui/StatusTag.vue'

const props = defineProps({
  project: Object,
  requireLogin: { type: Boolean, default: false }
})

const router = useRouter()

const statusMap = {
  pending: { text: '待发布', type: 'info' },
  bidding: { text: '招标中', type: 'success' },
  in_progress: { text: '进行中', type: 'warning' },
  completed: { text: '已完成', type: '' },
  cancelled: { text: '已取消', type: 'danger' }
}

const statusText = computed(() => statusMap[props.project.status]?.text || props.project.status)
const statusType = computed(() => statusMap[props.project.status]?.type || 'info')

const GRADIENTS = [
  'linear-gradient(90deg, #2563EB, #0891B2)',
  'linear-gradient(90deg, #0891B2, #16A34A)',
  'linear-gradient(90deg, #1D4ED8, #7C3AED)',
  'linear-gradient(90deg, #D97706, #DC2626)',
  'linear-gradient(90deg, #2563EB, #16A34A)'
]
const categoryGradient = computed(() => {
  let h = 0
  const str = String(props.project.category || '')
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) % 997
  return GRADIENTS[h % GRADIENTS.length]
})

const formatBudget = (budget) => {
  if (!budget) return '面议'
  return budget.toLocaleString()
}

const handleClick = async () => {
  if (props.requireLogin) {
    try {
      await ElMessageBox.confirm(
        '查看项目详情需要登录，是否前往登录？',
        '提示',
        {
          confirmButtonText: '去登录',
          cancelButtonText: '取消',
          type: 'warning'
        }
      )
      router.push('/login')
    } catch {
      // 用户取消
    }
    return
  }
  router.push(`/project/${props.project.id}`)
}
</script>

<style scoped>
.proj{
  background:#fff;border:1px solid #E2E8F0;border-radius:10px;overflow:hidden;cursor:pointer;
  box-shadow:0 1px 2px rgba(15,42,67,.06);transition:.18s;margin-bottom:14px;
}
.proj:hover{ box-shadow:0 4px 14px rgba(15,42,67,.08); transform:translateY(-2px); border-color:#C9DBFF; }
.hd{ height:6px; }
.bd{ padding:14px 16px; }
.cat{
  display:inline-block;background:#F5F9FF;color:#2563EB;font-size:11.5px;
  padding:1px 8px;border-radius:4px;margin-bottom:8px;
}
.tt{ display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:6px; }
.tt-text{ font-weight:600;font-size:15px;color:#0F172A; }
.need-login{
  display:inline-flex;align-items:center;gap:2px;font-size:11px;color:#D97706;
  background:#FFFBEB;border:1px solid #FDE9B8;border-radius:4px;padding:0 6px;
}
.ds{ font-size:12.5px;color:#64748B;height:38px;overflow:hidden;line-height:1.6; }
.ft{
  display:flex;justify-content:space-between;align-items:center;margin-top:10px;
  padding-top:10px;border-top:1px dashed #E2E8F0;font-size:12.5px;color:#64748B;flex-wrap:wrap;gap:6px;
}
.budget{ color:#DC2626;font-weight:700;font-size:17px;font-variant-numeric:tabular-nums; }
.meta{ font-variant-numeric:tabular-nums; }
</style>
