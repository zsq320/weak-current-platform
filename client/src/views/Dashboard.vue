<template>
  <div class="dashboard-container">
    <!-- 甲方仪表盘 -->
    <template v-if="userStore.isClient">
      <el-row :gutter="20" style="margin-bottom: 24px">
        <el-col :xs="12" :md="6" v-for="card in clientCards" :key="card.title">
          <el-card shadow="hover" class="stat-card">
            <div class="stat-card-content">
              <div class="stat-icon" :style="{ backgroundColor: card.color + '15', color: card.color }">
                <el-icon :size="28"><component :is="card.icon" /></el-icon>
              </div>
              <div class="stat-info">
                <span class="stat-value">{{ card.value }}</span>
                <span class="stat-title">{{ card.title }}</span>
              </div>
            </div>
          </el-card>
        </el-col>
      </el-row>

      <el-row :gutter="16">
        <el-col :xs="24" :md="12">
          <el-card>
            <template #header><h3>工程状态分布</h3></template>
            <div ref="statusChartRef" style="height: 300px"></div>
          </el-card>
        </el-col>
        <el-col :xs="24" :md="12">
          <el-card>
            <template #header><h3>月度支出趋势</h3></template>
            <div ref="monthlyChartRef" style="height: 300px"></div>
          </el-card>
        </el-col>
      </el-row>

      <el-row :gutter="16" style="margin-top: 16px">
        <el-col :span="24">
          <el-card>
            <template #header><h3>最近发布的工程</h3></template>
            <el-table :data="clientData.recentProjects" style="width: 100%">
              <el-table-column prop="title" label="工程名称" />
              <el-table-column prop="budget" label="预算" width="120">
                <template #default="{ row }">¥{{ row.budget?.toLocaleString() }}</template>
              </el-table-column>
              <el-table-column prop="status" label="状态" width="100">
                <template #default="{ row }">
                  <el-tag :type="statusType[row.status]" size="small">{{ statusName[row.status] }}</el-tag>
                </template>
              </el-table-column>
              <el-table-column prop="created_at" label="发布时间" width="180" />
            </el-table>
          </el-card>
        </el-col>
      </el-row>
    </template>

    <!-- 工程师仪表盘 -->
    <template v-else-if="userStore.isEngineer">
      <el-row :gutter="20" style="margin-bottom: 24px">
        <el-col :xs="12" :md="5" v-for="card in engineerCards" :key="card.title">
          <el-card shadow="hover" class="stat-card">
            <div class="stat-card-content">
              <div class="stat-icon" :style="{ backgroundColor: card.color + '15', color: card.color }">
                <el-icon :size="28"><component :is="card.icon" /></el-icon>
              </div>
              <div class="stat-info">
                <span class="stat-value">{{ card.value }}</span>
                <span class="stat-title">{{ card.title }}</span>
              </div>
            </div>
          </el-card>
        </el-col>
      </el-row>

      <el-row :gutter="16">
        <el-col :xs="24" :md="12">
          <el-card>
            <template #header><h3>投标状态分布</h3></template>
            <div ref="statusChartRef" style="height: 300px"></div>
          </el-card>
        </el-col>
        <el-col :xs="24" :md="12">
          <el-card>
            <template #header><h3>月度收入趋势</h3></template>
            <div ref="monthlyChartRef" style="height: 300px"></div>
          </el-card>
        </el-col>
      </el-row>

      <el-row :gutter="16" style="margin-top: 16px">
        <el-col :span="24">
          <el-card>
            <template #header><h3>最近投标记录</h3></template>
            <el-table :data="engineerData.recentBids" style="width: 100%">
              <el-table-column prop="project_title" label="工程名称" />
              <el-table-column prop="price" label="报价" width="120">
                <template #default="{ row }">¥{{ row.price?.toLocaleString() }}</template>
              </el-table-column>
              <el-table-column prop="status" label="投标状态" width="100">
                <template #default="{ row }">
                  <el-tag :type="{ pending: 'info', accepted: 'success', rejected: 'danger' }[row.status]" size="small">
                    {{ { pending: '待定', accepted: '已中标', rejected: '未中标' }[row.status] }}
                  </el-tag>
                </template>
              </el-table-column>
              <el-table-column prop="project_status" label="工程状态" width="100">
                <template #default="{ row }">
                  <el-tag :type="statusType[row.project_status]" size="small">{{ statusName[row.project_status] }}</el-tag>
                </template>
              </el-table-column>
              <el-table-column prop="created_at" label="投标时间" width="180" />
            </el-table>
          </el-card>
        </el-col>
      </el-row>
    </template>

    <!-- 管理员跳转 -->
    <template v-else-if="userStore.isAdmin">
      <el-result icon="info" title="管理员请前往管理后台" sub-title="管理后台包含完整的平台数据统计">
        <template #extra>
          <el-button type="primary" @click="router.push('/admin')">进入管理后台</el-button>
        </template>
      </el-result>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { useUserStore } from '../store'
import { Document, User, Money, Star, Tickets } from '@element-plus/icons-vue'
import echarts from '../utils/echarts'
import { ElMessage } from 'element-plus'
import api from '../api'

const router = useRouter()
const userStore = useUserStore()
const clientData = ref({})
const engineerData = ref({})
const statusChartRef = ref(null)
const monthlyChartRef = ref(null)
let charts = []

const statusType = { pending: 'info', bidding: 'warning', in_progress: '', completed: 'success', cancelled: 'danger' }
const statusName = { pending: '待发布', bidding: '招标中', in_progress: '进行中', completed: '已完成', cancelled: '已取消' }

const clientCards = computed(() => [
  { title: '发布工程', value: clientData.value.totalProjects || 0, icon: Document, color: '#1B5288' },
  { title: '待处理投标', value: clientData.value.pendingBids || 0, icon: Tickets, color: '#C9811A' },
  { title: '履行中合同', value: clientData.value.activeContracts || 0, icon: Money, color: '#1F9451' },
  { title: '总支出', value: `¥${(clientData.value.totalSpent || 0).toLocaleString()}`, icon: Money, color: '#E07A16' }
])

const engineerCards = computed(() => [
  { title: '投标总数', value: engineerData.value.totalBids || 0, icon: Document, color: '#1B5288' },
  { title: '中标数量', value: engineerData.value.completedProjects || 0, icon: User, color: '#1F9451' },
  { title: '履行中合同', value: engineerData.value.activeContracts || 0, icon: Money, color: '#C9811A' },
  { title: '总收入', value: `¥${(engineerData.value.totalEarned || 0).toLocaleString()}`, icon: Money, color: '#E07A16' },
  { title: '平均评分', value: (engineerData.value.avgRating || 0).toFixed(1), icon: Star, color: '#66707F' }
])

const initClientCharts = () => {
  if (statusChartRef.value && clientData.value.projectsByStatus?.length) {
    const chart = echarts.init(statusChartRef.value, 'app')
    chart.setOption({
      tooltip: { trigger: 'item' },
      series: [{
        type: 'pie', radius: '60%',
        data: clientData.value.projectsByStatus.map(p => ({ name: statusName[p.status] || p.status, value: p.count }))
      }]
    })
    charts.push(chart)
  }
  if (monthlyChartRef.value && clientData.value.monthlySpending?.length) {
    const chart = echarts.init(monthlyChartRef.value, 'app')
    chart.setOption({
      tooltip: { trigger: 'axis' },
      xAxis: { type: 'category', data: clientData.value.monthlySpending.map(m => m.month) },
      yAxis: { type: 'value' },
      series: [{ type: 'bar', data: clientData.value.monthlySpending.map(m => m.total), itemStyle: { color: '#1B5288' } }]
    })
    charts.push(chart)
  }
}

const initEngineerCharts = () => {
  if (statusChartRef.value && engineerData.value.bidsByStatus?.length) {
    const chart = echarts.init(statusChartRef.value, 'app')
    const nameMap = { pending: '待定', accepted: '已中标', rejected: '未中标' }
    chart.setOption({
      tooltip: { trigger: 'item' },
      series: [{
        type: 'pie', radius: '60%',
        data: engineerData.value.bidsByStatus.map(b => ({ name: nameMap[b.status] || b.status, value: b.count }))
      }]
    })
    charts.push(chart)
  }
  if (monthlyChartRef.value && engineerData.value.monthlyEarnings?.length) {
    const chart = echarts.init(monthlyChartRef.value, 'app')
    chart.setOption({
      tooltip: { trigger: 'axis' },
      xAxis: { type: 'category', data: engineerData.value.monthlyEarnings.map(m => m.month) },
      yAxis: { type: 'value' },
      series: [{ type: 'bar', data: engineerData.value.monthlyEarnings.map(m => m.total), itemStyle: { color: '#1F9451' } }]
    })
    charts.push(chart)
  }
}

onMounted(async () => {
  try {
    if (userStore.isClient) {
      clientData.value = await api.get('/dashboard/client')
    } else if (userStore.isEngineer) {
      engineerData.value = await api.get('/dashboard/engineer')
    }
  } catch (e) {
    ElMessage.error('加载统计数据失败')
  }
  await nextTick()
  if (userStore.isClient) initClientCharts()
  else if (userStore.isEngineer) initEngineerCharts()
})

onBeforeUnmount(() => {
  charts.forEach(c => c.dispose())
  charts = []
})
</script>

<style scoped>
.dashboard-container {
  padding: 0;
}

h3 {
  margin: 0;
  font-size: 15.5px;
  font-weight: 600;
  color: var(--ink-900);
}

.stat-card {
  border-radius: var(--r-lg);
}

.stat-card-content {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 6px 0;
}

.stat-icon {
  width: 50px;
  height: 50px;
  border-radius: 9px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.stat-info {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.stat-value {
  font-size: 24px;
  font-weight: 700;
  color: var(--ink-900);
  line-height: 1.2;
  font-variant-numeric: tabular-nums;
}

.stat-title {
  font-size: 13px;
  color: var(--ink-500);
  margin-top: 3px;
}
</style>
