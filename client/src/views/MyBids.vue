<template>
  <div class="my-bids">
    <el-card>
      <template #header>
        <div class="header-row">
          <h2>我的投标</h2>
          <div class="filters">
            <el-select v-model="filterStatus" placeholder="投标状态" clearable style="width: 120px">
              <el-option label="全部" value="all" />
              <el-option label="待定" value="pending" />
              <el-option label="已中标" value="accepted" />
              <el-option label="未中标" value="rejected" />
            </el-select>
            <el-select v-model="sortField" style="width: 120px; margin-left: 8px">
              <el-option label="按时间" value="created_at" />
              <el-option label="按报价" value="price" />
            </el-select>
            <el-button style="margin-left: 8px" @click="toggleOrder">
              {{ sortOrder === 'desc' ? '↓ 降序' : '↑ 升序' }}
            </el-button>
          </div>
        </div>
      </template>

      <!-- 统计卡片 -->
      <el-row :gutter="16" style="margin-bottom: 20px">
        <el-col :span="6">
          <el-card shadow="hover" class="stat-card">
            <div class="stat-value">{{ stats.total }}</div>
            <div class="stat-label">总投标数</div>
          </el-card>
        </el-col>
        <el-col :span="6">
          <el-card shadow="hover" class="stat-card">
            <div class="stat-value" style="color: #e6a23c">{{ stats.pending }}</div>
            <div class="stat-label">待定中</div>
          </el-card>
        </el-col>
        <el-col :span="6">
          <el-card shadow="hover" class="stat-card">
            <div class="stat-value" style="color: #67c23a">{{ stats.accepted }}</div>
            <div class="stat-label">已中标</div>
          </el-card>
        </el-col>
        <el-col :span="6">
          <el-card shadow="hover" class="stat-card">
            <div class="stat-value" style="color: #f56c6c">{{ stats.rejected }}</div>
            <div class="stat-label">未中标</div>
          </el-card>
        </el-col>
      </el-row>

      <!-- 投标列表 -->
      <el-table :data="filteredBids" style="width: 100%" v-loading="loading">
        <el-table-column label="工程名称" min-width="180">
          <template #default="{ row }">
            <el-link type="primary" @click="router.push(`/project/${row.project_id}`)">
              {{ row.project_title }}
            </el-link>
            <div style="font-size: 12px; color: #909399">{{ row.category }}</div>
          </template>
        </el-table-column>

        <el-table-column label="我的报价" width="130" sortable>
          <template #default="{ row }">
            <span class="price">¥{{ row.price?.toLocaleString() }}</span>
            <div v-if="row.project_budget" style="font-size: 11px; color: #909399">
              预算: ¥{{ row.project_budget?.toLocaleString() }}
            </div>
          </template>
        </el-table-column>

        <el-table-column label="工期" width="80">
          <template #default="{ row }">
            <span v-if="row.duration">
              {{ row.duration }}{{ row.duration_unit === 'days' ? '天' : row.duration_unit === 'weeks' ? '周' : '月' }}
            </span>
            <span v-else style="color: #909399">-</span>
          </template>
        </el-table-column>

        <el-table-column label="投标排名" width="80">
          <template #default="{ row }">
            <el-tag v-if="row.total_bids" type="info">
              {{ row.status === 'accepted' ? '第1名' : `共${row.total_bids}份` }}
            </el-tag>
          </template>
        </el-table-column>

        <el-table-column label="投标状态" width="100">
          <template #default="{ row }">
            <el-tag :type="bidStatusMap[row.status]?.type">
              {{ bidStatusMap[row.status]?.text }}
            </el-tag>
            <el-icon v-if="row.status === 'accepted'" color="#67c23a" style="margin-left: 4px"><CircleCheck /></el-icon>
            <el-icon v-else-if="row.status === 'rejected'" color="#f56c6c" style="margin-left: 4px"><CircleClose /></el-icon>
          </template>
        </el-table-column>

        <el-table-column label="工程状态" width="100">
          <template #default="{ row }">
            <el-tag :type="projStatusMap[row.project_status]?.type" size="small">
              {{ projStatusMap[row.project_status]?.text }}
            </el-tag>
          </template>
        </el-table-column>

        <el-table-column prop="created_at" label="投标时间" width="160" />

        <el-table-column label="操作" width="100" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" link @click="viewDetail(row.project_id)">查看详情</el-button>
          </template>
        </el-table-column>
      </el-table>

      <el-empty v-if="filteredBids.length === 0 && !loading" description="暂无投标记录">
        <el-button type="primary" @click="router.push('/')">浏览工程</el-button>
      </el-empty>
    </el-card>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { CircleCheck, CircleClose } from '@element-plus/icons-vue'
import api from '../api'

const router = useRouter()
const bids = ref([])
const loading = ref(false)
const filterStatus = ref('all')
const sortField = ref('created_at')
const sortOrder = ref('desc')

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

const stats = computed(() => ({
  total: bids.value.length,
  pending: bids.value.filter(b => b.status === 'pending').length,
  accepted: bids.value.filter(b => b.status === 'accepted').length,
  rejected: bids.value.filter(b => b.status === 'rejected').length
}))

const filteredBids = computed(() => {
  let result = [...bids.value]

  // 状态筛选
  if (filterStatus.value && filterStatus.value !== 'all') {
    result = result.filter(b => b.status === filterStatus.value)
  }

  // 排序
  result.sort((a, b) => {
    let aVal = a[sortField.value]
    let bVal = b[sortField.value]

    if (sortField.value === 'price') {
      aVal = aVal || 0
      bVal = bVal || 0
    } else if (sortField.value === 'created_at') {
      aVal = new Date(aVal).getTime()
      bVal = new Date(bVal).getTime()
    }

    if (sortOrder.value === 'asc') {
      return aVal > bVal ? 1 : -1
    }
    return aVal < bVal ? 1 : -1
  })

  return result
})

const toggleOrder = () => {
  sortOrder.value = sortOrder.value === 'desc' ? 'asc' : 'desc'
}

const viewDetail = (projectId) => {
  router.push(`/project/${projectId}`)
}

const fetchBids = async () => {
  loading.value = true
  try {
    bids.value = await api.get('/bids/my')
  } catch (e) {
    ElMessage.error('加载投标列表失败')
  } finally {
    loading.value = false
  }
}

onMounted(fetchBids)
</script>

<style scoped>
.my-bids {
  padding: 20px;
}

.header-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.header-row h2 {
  margin: 0;
}

.filters {
  display: flex;
  align-items: center;
}

.stat-card {
  text-align: center;
}

.stat-value {
  font-size: 28px;
  font-weight: bold;
  color: #303133;
}

.stat-label {
  font-size: 12px;
  color: #909399;
  margin-top: 4px;
}

.price {
  color: #f56c6c;
  font-weight: bold;
  font-size: 16px;
}
</style>
