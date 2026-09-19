<template>
  <div class="proj" @click="handleClick">
    <div class="bd">
      <div class="tt">
        <span class="tt-text">{{ project.title }}</span>
        <StatusTag kind="project" :status="project.status" />
        <span v-if="requireLogin" class="need-login"><el-icon><Lock /></el-icon> 需登录</span>
      </div>
      <div class="ds">{{ project.description?.substring(0, 60) }}{{ project.description?.length > 60 ? '…' : '' }}</div>
      <div class="ft">
        <div class="ft-left">
          <span class="cat">{{ project.category }}</span>
          <span class="loc"><el-icon><Location /></el-icon>{{ project.location || '地点未填写' }}</span>
        </div>
        <div class="ft-right">
          <span class="budget">¥{{ formatBudget(project.budget) }}</span>
          <span class="bids"><el-icon><User /></el-icon>{{ project.bid_count || 0 }} 人投标</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { useRouter } from 'vue-router'
import { Lock, Location, User } from '@element-plus/icons-vue'
import { ElMessageBox } from 'element-plus'
import StatusTag from './ui/StatusTag.vue'

const props = defineProps({
  project: Object,
  requireLogin: { type: Boolean, default: false }
})

const router = useRouter()

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
  background:#fff;border:1px solid var(--line);border-radius:var(--r-lg);overflow:hidden;cursor:pointer;
  box-shadow:var(--sh-1);transition:border-color .15s,box-shadow .15s;margin-bottom:12px;
}
.proj:hover{ box-shadow:var(--sh-2); border-color:var(--brand-300); }
.bd{ padding:15px 18px; }
.tt{ display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:7px; }
.tt-text{ font-weight:600;font-size:15.5px;color:var(--ink-900); }
.need-login{
  display:inline-flex;align-items:center;gap:2px;font-size:11px;color:var(--warn-600);
  background:var(--warn-50);border:1px solid var(--warn-100);border-radius:var(--r-sm);padding:0 6px;
}
.ds{ font-size:13px;color:var(--ink-500);height:40px;overflow:hidden;line-height:1.55; }
.ft{
  display:flex;justify-content:space-between;align-items:center;margin-top:11px;gap:10px;flex-wrap:wrap;
  padding-top:11px;border-top:1px solid var(--line-soft);font-size:12.5px;color:var(--ink-500);
}
.ft-left,.ft-right{ display:flex;align-items:center;gap:14px;flex-wrap:wrap; }
.cat{
  display:inline-block;background:var(--brand-50);color:var(--brand-700);font-size:12px;
  padding:2px 9px;border-radius:var(--r-sm);font-weight:500;
}
.loc,.bids{ display:inline-flex;align-items:center;gap:4px;font-variant-numeric:tabular-nums; }
.budget{ color:var(--accent-600);font-weight:700;font-size:17px;font-variant-numeric:tabular-nums; }
</style>
