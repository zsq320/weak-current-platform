<template>
  <div>
    <el-card>
      <template #header>
        <div class="header-row">
          <h2>我发布的工程</h2>
          <el-button type="primary" @click="router.push('/publish')">发布工程</el-button>
        </div>
      </template>
      <el-table :data="projects" style="width: 100%">
        <el-table-column prop="title" label="工程标题" min-width="200">
          <template #default="{ row }">
            <el-link type="primary" @click="router.push(`/project/${row.id}`)">{{ row.title }}</el-link>
          </template>
        </el-table-column>
        <el-table-column prop="category" label="分类" width="120" />
        <el-table-column prop="budget" label="预算" width="120">
          <template #default="{ row }">¥{{ row.budget?.toLocaleString() || '面议' }}</template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="statusMap[row.status]?.type">{{ statusMap[row.status]?.text }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="bid_count" label="投标数" width="80" />
        <el-table-column prop="created_at" label="发布时间" width="180" />
      </el-table>
      <el-empty v-if="projects.length === 0" description="暂无工程">
        <el-button type="primary" @click="router.push('/publish')">发布第一个工程</el-button>
      </el-empty>
    </el-card>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useUserStore } from '../store'
import { ElMessage } from 'element-plus'
import api from '../api'

const router = useRouter()
const userStore = useUserStore()
const projects = ref([])
const statusMap = {
  pending: { text: '待发布', type: 'info' },
  bidding: { text: '招标中', type: 'success' },
  in_progress: { text: '进行中', type: 'warning' },
  completed: { text: '已完成', type: '' },
  cancelled: { text: '已取消', type: 'danger' }
}

onMounted(async () => {
  try {
    const res = await api.get('/projects', { params: { user_id: userStore.user?.id, pageSize: 100 } })
    projects.value = res.data
  } catch (e) {
    ElMessage.error('加载工程列表失败')
  }
})
</script>

<style scoped>
.header-row { display: flex; justify-content: space-between; align-items: center; }
h2 { margin: 0; }
</style>
