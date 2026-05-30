<template>
  <el-card class="project-card" shadow="hover" @click="router.push(`/project/${project.id}`)">
    <div class="card-header">
      <el-tag :type="statusType" size="small">{{ statusText }}</el-tag>
      <el-tag type="info" size="small">{{ project.category }}</el-tag>
    </div>
    <h3 class="title">{{ project.title }}</h3>
    <p class="desc">{{ project.description?.substring(0, 80) }}{{ project.description?.length > 80 ? '...' : '' }}</p>
    <div class="card-footer">
      <div class="budget">
        <span class="label">预算</span>
        <span class="amount">¥{{ project.budget?.toLocaleString() || '面议' }}</span>
      </div>
      <div class="info">
        <span><el-icon><Location /></el-icon> {{ project.location || '未填写' }}</span>
        <span><el-icon><User /></el-icon> {{ project.bid_count || 0 }} 人投标</span>
      </div>
    </div>
  </el-card>
</template>

<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { Location, User } from '@element-plus/icons-vue'

const props = defineProps({ project: Object })
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
</script>

<style scoped>
.project-card { cursor: pointer; transition: transform 0.2s; margin-bottom: 16px; }
.project-card:hover { transform: translateY(-2px); }
.card-header { display: flex; gap: 8px; margin-bottom: 12px; }
.title { font-size: 16px; margin-bottom: 8px; color: #303133; }
.desc { font-size: 13px; color: #909399; margin-bottom: 16px; line-height: 1.5; }
.card-footer { display: flex; justify-content: space-between; align-items: center; }
.budget .label { font-size: 12px; color: #909399; margin-right: 4px; }
.budget .amount { font-size: 18px; font-weight: bold; color: #f56c6c; }
.info { display: flex; gap: 16px; font-size: 13px; color: #909399; }
.info span { display: flex; align-items: center; gap: 4px; }
</style>
