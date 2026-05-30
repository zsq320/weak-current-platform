<template>
  <div>
    <el-card>
      <template #header><h2>我的投标</h2></template>
      <el-table :data="bids" style="width: 100%">
        <el-table-column prop="project_title" label="工程名称" min-width="200">
          <template #default="{ row }">
            <el-link type="primary" @click="router.push(`/project/${row.project_id}`)">{{ row.project_title }}</el-link>
          </template>
        </el-table-column>
        <el-table-column prop="category" label="分类" width="120" />
        <el-table-column prop="price" label="我的报价" width="120">
          <template #default="{ row }">
            <span style="color: #f56c6c; font-weight: bold">¥{{ row.price?.toLocaleString() }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="budget" label="工程预算" width="120">
          <template #default="{ row }">¥{{ row.budget?.toLocaleString() || '面议' }}</template>
        </el-table-column>
        <el-table-column prop="status" label="投标状态" width="100">
          <template #default="{ row }">
            <el-tag :type="bidStatusMap[row.status]?.type">{{ bidStatusMap[row.status]?.text }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="project_status" label="工程状态" width="100">
          <template #default="{ row }">
            <el-tag :type="projStatusMap[row.project_status]?.type">{{ projStatusMap[row.project_status]?.text }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="created_at" label="投标时间" width="180" />
      </el-table>
      <el-empty v-if="bids.length === 0" description="暂无投标记录" />
    </el-card>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import api from '../api'

const router = useRouter()
const bids = ref([])
const bidStatusMap = {
  pending: { text: '待定', type: 'warning' },
  accepted: { text: '已中标', type: 'success' },
  rejected: { text: '未中标', type: 'danger' }
}
const projStatusMap = {
  bidding: { text: '招标中', type: 'success' },
  in_progress: { text: '进行中', type: 'warning' },
  completed: { text: '已完成', type: '' },
  cancelled: { text: '已取消', type: 'danger' }
}

onMounted(async () => {
  try {
    bids.value = await api.get('/bids/my')
  } catch (e) {
    ElMessage.error('加载投标列表失败')
  }
})
</script>

<style scoped>
h2 { margin: 0; }
</style>
