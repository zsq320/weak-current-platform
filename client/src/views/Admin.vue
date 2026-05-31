<template>
  <div class="admin-container">
    <el-tabs v-model="activeTab" @tab-change="handleTabChange" class="admin-tabs">
      <!-- 平台概览 -->
      <el-tab-pane label="平台概览" name="overview">
        <el-row :gutter="20" style="margin-bottom: 24px">
          <el-col :span="6" v-for="card in overviewCards" :key="card.label">
            <el-card shadow="hover" class="stat-card" :body-style="{ padding: '20px' }">
              <div class="stat-card-content">
                <div class="stat-icon" :style="{ backgroundColor: card.color + '20', color: card.color }">
                  <el-icon :size="28"><component :is="card.icon" /></el-icon>
                </div>
                <div class="stat-info">
                  <div class="stat-value">{{ card.value }}</div>
                  <div class="stat-label">{{ card.label }}</div>
                </div>
              </div>
            </el-card>
          </el-col>
        </el-row>
        <el-row :gutter="16">
          <el-col :span="8">
            <el-card>
              <template #header><h3>用户角色分布</h3></template>
              <div ref="userRoleChartRef" style="height: 250px"></div>
            </el-card>
          </el-col>
          <el-col :span="8">
            <el-card>
              <template #header><h3>工程状态分布</h3></template>
              <div ref="projectStatusChartRef" style="height: 250px"></div>
            </el-card>
          </el-col>
          <el-col :span="8">
            <el-card>
              <template #header><h3>月度收入趋势</h3></template>
              <div ref="revenueChartRef" style="height: 250px"></div>
            </el-card>
          </el-col>
        </el-row>
        <el-card style="margin-top: 16px">
          <template #header><h3>最近操作记录</h3></template>
          <el-table :data="adminStats.recent_activity" style="width: 100%">
            <el-table-column prop="username" label="操作人" width="120" />
            <el-table-column prop="action" label="操作类型" width="160">
              <template #default="{ row }">
                <el-tag size="small">{{ actionNameMap[row.action] || row.action }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="target_type" label="目标类型" width="100" />
            <el-table-column prop="details" label="详情" min-width="200" show-overflow-tooltip />
            <el-table-column prop="created_at" label="时间" width="180" />
          </el-table>
        </el-card>
      </el-tab-pane>

      <!-- 用户管理 -->
      <el-tab-pane label="用户管理" name="users">
        <el-card>
          <template #header>
            <div style="display: flex; justify-content: space-between; align-items: center">
              <h3 style="margin:0">用户列表</h3>
              <div style="display: flex; gap: 10px">
                <el-input v-model="userFilter.keyword" placeholder="搜索用户名/姓名/手机" clearable style="width: 200px" @clear="fetchUsers" @keyup.enter="fetchUsers" />
                <el-select v-model="userFilter.role" placeholder="角色筛选" clearable style="width: 120px" @change="fetchUsers">
                  <el-option label="甲方" value="user" />
                  <el-option label="工程师" value="engineer" />
                  <el-option label="管理员" value="admin" />
                </el-select>
                <el-select v-model="userFilter.is_disabled" placeholder="状态筛选" clearable style="width: 120px" @change="fetchUsers">
                  <el-option label="正常" value="0" />
                  <el-option label="已禁用" value="1" />
                </el-select>
                <el-button type="primary" @click="fetchUsers">搜索</el-button>
              </div>
            </div>
          </template>
          <el-table :data="users" style="width: 100%">
            <el-table-column prop="id" label="ID" width="60" />
            <el-table-column prop="username" label="用户名" width="120" />
            <el-table-column prop="real_name" label="真实姓名" width="120" />
            <el-table-column prop="role" label="角色" width="100">
              <template #default="{ row }">
                <el-tag :type="{ user: '', engineer: 'success', admin: 'danger' }[row.role]">
                  {{ { user: '甲方', engineer: '工程师', admin: '管理员' }[row.role] }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="phone" label="手机号" width="140" />
            <el-table-column prop="balance" label="余额" width="100">
              <template #default="{ row }">¥{{ row.balance?.toLocaleString() }}</template>
            </el-table-column>
            <el-table-column label="状态" width="80">
              <template #default="{ row }">
                <el-tag :type="row.is_disabled ? 'danger' : 'success'" size="small">{{ row.is_disabled ? '已禁用' : '正常' }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="certification_status" label="认证状态" width="100">
              <template #default="{ row }">
                <el-tag v-if="row.certification_status === 'approved'" type="success" size="small">已认证</el-tag>
                <el-tag v-else-if="row.certification_status === 'pending'" type="warning" size="small">审批中</el-tag>
                <el-tag v-else-if="row.certification_status === 'rejected'" type="danger" size="small">已拒绝</el-tag>
                <span v-else>-</span>
              </template>
            </el-table-column>
            <el-table-column prop="created_at" label="注册时间" width="180" />
            <el-table-column label="操作" width="200" fixed="right">
              <template #default="{ row }">
                <template v-if="row.role !== 'admin'">
                  <el-button :type="row.is_disabled ? 'success' : 'warning'" size="small" @click="toggleUserStatus(row)">
                    {{ row.is_disabled ? '启用' : '禁用' }}
                  </el-button>
                  <el-dropdown @command="(role) => changeUserRole(row.id, role)" style="margin-left: 8px">
                    <el-button size="small" type="primary">变更角色</el-button>
                    <template #dropdown>
                      <el-dropdown-menu>
                        <el-dropdown-item command="user" :disabled="row.role === 'user'">甲方</el-dropdown-item>
                        <el-dropdown-item command="engineer" :disabled="row.role === 'engineer'">工程师</el-dropdown-item>
                      </el-dropdown-menu>
                    </template>
                  </el-dropdown>
                </template>
                <span v-else style="color: #909399; font-size: 12px">管理员</span>
              </template>
            </el-table-column>
          </el-table>
          <div style="margin-top: 16px; text-align: right">
            <el-pagination v-model:current-page="userPage" :page-size="20" :total="userTotal" layout="total, prev, pager, next" @current-change="fetchUsers" />
          </div>
        </el-card>
      </el-tab-pane>

      <!-- 认证审批 -->
      <el-tab-pane label="认证审批" name="certs">
        <el-card>
          <template #header><h3>待审批认证申请</h3></template>
          <el-table :data="certs" style="width: 100%">
            <el-table-column prop="username" label="用户名" width="120" />
            <el-table-column prop="real_name" label="真实姓名" width="120" />
            <el-table-column prop="phone" label="手机号" width="140" />
            <el-table-column prop="email" label="邮箱" width="180" />
            <el-table-column prop="certification" label="认证信息" min-width="200" show-overflow-tooltip />
            <el-table-column prop="created_at" label="申请时间" width="180" />
            <el-table-column label="操作" width="160">
              <template #default="{ row }">
                <el-button type="success" size="small" @click="handleCert(row.id, 'approve')">批准</el-button>
                <el-button type="danger" size="small" @click="handleCert(row.id, 'reject')">拒绝</el-button>
              </template>
            </el-table-column>
          </el-table>
          <el-empty v-if="certs.length === 0" description="暂无待审批申请" />
        </el-card>
      </el-tab-pane>

      <!-- 工程管理 -->
      <el-tab-pane label="工程管理" name="projects">
        <el-card>
          <template #header>
            <div style="display: flex; justify-content: space-between; align-items: center">
              <h3 style="margin:0">全部工程</h3>
              <div style="display: flex; gap: 10px">
                <el-input v-model="projectFilter.keyword" placeholder="搜索工程名称" clearable style="width: 200px" @clear="fetchProjects" @keyup.enter="fetchProjects" />
                <el-select v-model="projectFilter.status" placeholder="状态筛选" clearable style="width: 120px" @change="fetchProjects">
                  <el-option label="招标中" value="bidding" />
                  <el-option label="进行中" value="in_progress" />
                  <el-option label="已完成" value="completed" />
                  <el-option label="已取消" value="cancelled" />
                </el-select>
                <el-button type="primary" @click="fetchProjects">搜索</el-button>
              </div>
            </div>
          </template>
          <el-table :data="projects" style="width: 100%">
            <el-table-column prop="id" label="ID" width="60" />
            <el-table-column prop="title" label="工程名称" min-width="200">
              <template #default="{ row }">
                <el-link type="primary" @click="router.push(`/project/${row.id}`)">{{ row.title }}</el-link>
              </template>
            </el-table-column>
            <el-table-column prop="publisher_name" label="发布者" width="120" />
            <el-table-column prop="category" label="分类" width="120" />
            <el-table-column prop="budget" label="预算" width="120">
              <template #default="{ row }">¥{{ row.budget?.toLocaleString() }}</template>
            </el-table-column>
            <el-table-column prop="bid_count" label="投标数" width="80" />
            <el-table-column prop="status" label="状态" width="100">
              <template #default="{ row }">
                <el-tag :type="statusType[row.status]" size="small">{{ statusName[row.status] }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="created_at" label="发布时间" width="180" />
            <el-table-column label="操作" width="120" fixed="right">
              <template #default="{ row }">
                <el-button v-if="row.status !== 'completed' && row.status !== 'cancelled'" type="danger" size="small" @click="forceCancelProject(row.id)">强制取消</el-button>
                <span v-else style="color: #909399; font-size: 12px">已结束</span>
              </template>
            </el-table-column>
          </el-table>
          <div style="margin-top: 16px; text-align: right">
            <el-pagination v-model:current-page="projectPage" :page-size="20" :total="projectTotal" layout="total, prev, pager, next" @current-change="fetchProjects" />
          </div>
        </el-card>
      </el-tab-pane>

      <!-- 合同管理 -->
      <el-tab-pane label="合同管理" name="contracts">
        <el-card>
          <template #header>
            <div style="display: flex; justify-content: space-between; align-items: center">
              <h3 style="margin:0">全部合同</h3>
              <el-select v-model="contractFilter.status" placeholder="状态筛选" clearable style="width: 120px" @change="fetchContracts">
                <el-option label="履行中" value="active" />
                <el-option label="已完成" value="completed" />
                <el-option label="已终止" value="terminated" />
              </el-select>
            </div>
          </template>
          <el-table :data="contracts" style="width: 100%">
            <el-table-column prop="id" label="ID" width="60" />
            <el-table-column prop="project_title" label="工程名称" min-width="200" />
            <el-table-column prop="owner_real_name" label="甲方" width="120" />
            <el-table-column prop="engineer_real_name" label="工程师" width="120" />
            <el-table-column prop="amount" label="合同金额" width="120">
              <template #default="{ row }"><span style="color: #f56c6c; font-weight: bold">¥{{ row.amount?.toLocaleString() }}</span></template>
            </el-table-column>
            <el-table-column prop="status" label="状态" width="100">
              <template #default="{ row }">
                <el-tag :type="{ active: '', completed: 'success', terminated: 'danger' }[row.status]" size="small">
                  {{ { active: '履行中', completed: '已完成', terminated: '已终止' }[row.status] }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="signed_at" label="签订时间" width="180" />
          </el-table>
          <div style="margin-top: 16px; text-align: right">
            <el-pagination v-model:current-page="contractPage" :page-size="20" :total="contractTotal" layout="total, prev, pager, next" @current-change="fetchContracts" />
          </div>
        </el-card>
      </el-tab-pane>

      <!-- 财务概览 -->
      <el-tab-pane label="财务概览" name="finance">
        <el-card style="margin-bottom: 16px">
          <div style="text-align: center; padding: 20px">
            <div style="font-size: 14px; color: #909399">平台总交易额</div>
            <div style="font-size: 36px; font-weight: bold; color: #f56c6c; margin-top: 8px">¥{{ (financeData.totalAmount || 0).toLocaleString() }}</div>
          </div>
        </el-card>
        <el-card>
          <template #header><h3>交易记录</h3></template>
          <el-table :data="financeData.data" style="width: 100%">
            <el-table-column prop="id" label="合同ID" width="80" />
            <el-table-column prop="project_title" label="工程名称" min-width="200" />
            <el-table-column prop="owner_name" label="甲方" width="120" />
            <el-table-column prop="engineer_name" label="工程师" width="120" />
            <el-table-column prop="amount" label="交易金额" width="120">
              <template #default="{ row }"><span style="color: #f56c6c; font-weight: bold">¥{{ row.amount?.toLocaleString() }}</span></template>
            </el-table-column>
            <el-table-column prop="completed_at" label="完成时间" width="180" />
          </el-table>
          <div style="margin-top: 16px; text-align: right">
            <el-pagination v-model:current-page="financePage" :page-size="20" :total="financeTotal" layout="total, prev, pager, next" @current-change="fetchFinance" />
          </div>
        </el-card>
      </el-tab-pane>

      <!-- 操作日志 -->
      <el-tab-pane label="操作日志" name="logs">
        <el-card>
          <template #header>
            <div style="display: flex; justify-content: space-between; align-items: center">
              <h3 style="margin:0">操作日志</h3>
              <div style="display: flex; gap: 10px">
                <el-select v-model="logFilter.action" placeholder="操作类型" clearable style="width: 160px" @change="fetchLogs">
                  <el-option label="登录" value="login" />
                  <el-option label="注册" value="register" />
                  <el-option label="发布工程" value="publish_project" />
                  <el-option label="投标" value="submit_bid" />
                  <el-option label="接受投标" value="accept_bid" />
                  <el-option label="完成合同" value="complete_contract" />
                  <el-option label="禁用用户" value="disable_user" />
                  <el-option label="启用用户" value="enable_user" />
                  <el-option label="变更角色" value="change_role" />
                  <el-option label="强制取消工程" value="force_cancel_project" />
                </el-select>
                <el-button type="primary" @click="fetchLogs">筛选</el-button>
              </div>
            </div>
          </template>
          <el-table :data="logs" style="width: 100%">
            <el-table-column prop="id" label="ID" width="60" />
            <el-table-column prop="username" label="操作人" width="120" />
            <el-table-column prop="action" label="操作类型" width="160">
              <template #default="{ row }">
                <el-tag size="small">{{ actionNameMap[row.action] || row.action }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="target_type" label="目标类型" width="100" />
            <el-table-column prop="target_id" label="目标ID" width="80" />
            <el-table-column prop="details" label="详情" min-width="200" show-overflow-tooltip />
            <el-table-column prop="ip_address" label="IP地址" width="140" />
            <el-table-column prop="created_at" label="时间" width="180" />
          </el-table>
          <div style="margin-top: 16px; text-align: right">
            <el-pagination v-model:current-page="logPage" :page-size="50" :total="logTotal" layout="total, prev, pager, next" @current-change="fetchLogs" />
          </div>
        </el-card>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, nextTick, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { User, UserFilled, Briefcase, Folder, Document, Clock, Money } from '@element-plus/icons-vue'
import * as echarts from 'echarts'
import api from '../api'

const router = useRouter()
const activeTab = ref('overview')

const statusType = { pending: 'info', bidding: 'warning', in_progress: '', completed: 'success', cancelled: 'danger' }
const statusName = { pending: '待发布', bidding: '招标中', in_progress: '进行中', completed: '已完成', cancelled: '已取消' }
const actionNameMap = {
  login: '登录', register: '注册', publish_project: '发布工程',
  submit_bid: '提交投标', accept_bid: '接受投标', complete_contract: '完成合同',
  disable_user: '禁用用户', enable_user: '启用用户', change_role: '变更角色',
  force_cancel_project: '强制取消工程', cert_approve: '批准认证', cert_reject: '拒绝认证'
}

// 概览
const adminStats = ref({})
const userRoleChartRef = ref(null)
const projectStatusChartRef = ref(null)
const revenueChartRef = ref(null)
let charts = []

const overviewCards = computed(() => [
  { label: '用户总数', value: adminStats.value.total_users || 0, icon: 'User', color: '#409eff' },
  { label: '甲方用户', value: adminStats.value.total_clients || 0, icon: 'UserFilled', color: '#67c23a' },
  { label: '工程师', value: adminStats.value.total_engineers || 0, icon: 'Briefcase', color: '#e6a23c' },
  { label: '项目总数', value: adminStats.value.total_projects || 0, icon: 'Folder', color: '#909399' },
  { label: '合同总数', value: adminStats.value.total_contracts || 0, icon: 'Document', color: '#f56c6c' },
  { label: '待审批', value: adminStats.value.pending_certs || 0, icon: 'Clock', color: '#e6a23c' },
  { label: '总交易额', value: `¥${(adminStats.value.total_revenue || 0).toLocaleString()}`, icon: 'Money', color: '#f56c6c' }
])

// 用户管理
const users = ref([])
const userPage = ref(1)
const userTotal = ref(0)
const userFilter = reactive({ keyword: '', role: '', is_disabled: '' })

// 认证
const certs = ref([])

// 工程管理
const projects = ref([])
const projectPage = ref(1)
const projectTotal = ref(0)
const projectFilter = reactive({ keyword: '', status: '' })

// 合同管理
const contracts = ref([])
const contractPage = ref(1)
const contractTotal = ref(0)
const contractFilter = reactive({ status: '' })

// 财务概览
const financeData = ref({})
const financePage = ref(1)
const financeTotal = ref(0)

// 操作日志
const logs = ref([])
const logPage = ref(1)
const logTotal = ref(0)
const logFilter = reactive({ action: '' })

// 数据获取
const fetchStats = async () => {
  try {
    adminStats.value = await api.get('/admin/stats')
    await nextTick()
    initOverviewCharts()
  } catch (e) {}
}

const initOverviewCharts = () => {
  charts.forEach(c => c.dispose())
  charts = []

  if (userRoleChartRef.value && adminStats.value.users_by_role?.length) {
    const chart = echarts.init(userRoleChartRef.value)
    const nameMap = { user: '甲方', engineer: '工程师', admin: '管理员' }
    chart.setOption({
      tooltip: { trigger: 'item' },
      series: [{ type: 'pie', radius: '60%', data: adminStats.value.users_by_role.map(r => ({ name: nameMap[r.role] || r.role, value: r.count })) }]
    })
    charts.push(chart)
  }

  if (projectStatusChartRef.value && adminStats.value.projects_by_status?.length) {
    const chart = echarts.init(projectStatusChartRef.value)
    chart.setOption({
      tooltip: { trigger: 'item' },
      series: [{ type: 'pie', radius: '60%', data: adminStats.value.projects_by_status.map(p => ({ name: statusName[p.status] || p.status, value: p.count })) }]
    })
    charts.push(chart)
  }

  if (revenueChartRef.value && adminStats.value.monthly_revenue?.length) {
    const chart = echarts.init(revenueChartRef.value)
    chart.setOption({
      tooltip: { trigger: 'axis' },
      xAxis: { type: 'category', data: adminStats.value.monthly_revenue.map(m => m.month) },
      yAxis: { type: 'value' },
      series: [{ type: 'bar', data: adminStats.value.monthly_revenue.map(m => m.total), itemStyle: { color: '#f56c6c' } }]
    })
    charts.push(chart)
  }
}

const fetchUsers = async () => {
  try {
    const params = { page: userPage.value, pageSize: 20 }
    if (userFilter.keyword) params.keyword = userFilter.keyword
    if (userFilter.role) params.role = userFilter.role
    if (userFilter.is_disabled !== '') params.is_disabled = userFilter.is_disabled
    const res = await api.get('/admin/users', { params })
    users.value = res.data
    userTotal.value = res.total
  } catch (e) {}
}

const fetchCerts = async () => {
  try { certs.value = await api.get('/admin/certifications') } catch (e) {}
}

const fetchProjects = async () => {
  try {
    const params = { page: projectPage.value, pageSize: 20 }
    if (projectFilter.keyword) params.keyword = projectFilter.keyword
    if (projectFilter.status) params.status = projectFilter.status
    const res = await api.get('/admin/projects', { params })
    projects.value = res.data
    projectTotal.value = res.total
  } catch (e) {}
}

const fetchContracts = async () => {
  try {
    const params = { page: contractPage.value, pageSize: 20 }
    if (contractFilter.status) params.status = contractFilter.status
    const res = await api.get('/admin/contracts', { params })
    contracts.value = res.data
    contractTotal.value = res.total
  } catch (e) {}
}

const fetchFinance = async () => {
  try {
    const res = await api.get('/admin/transactions', { params: { page: financePage.value, pageSize: 20 } })
    financeData.value = res
    financeTotal.value = res.total
  } catch (e) {}
}

const fetchLogs = async () => {
  try {
    const params = { page: logPage.value, pageSize: 50 }
    if (logFilter.action) params.action = logFilter.action
    const res = await api.get('/admin/audit-logs', { params })
    logs.value = res.data
    logTotal.value = res.total
  } catch (e) {}
}

// 操作
const handleCert = async (userId, action) => {
  try {
    await api.post(`/admin/certifications/${userId}/approve`, { action })
    ElMessage.success(action === 'approve' ? '已批准' : '已拒绝')
    fetchCerts()
    fetchUsers()
    fetchStats()
  } catch (e) {}
}

const toggleUserStatus = async (user) => {
  const action = user.is_disabled ? '启用' : '禁用'
  try {
    await ElMessageBox.confirm(`确定要${action}用户「${user.username}」吗？`, '确认操作', { type: 'warning' })
    await api.put(`/admin/users/${user.id}/status`, { is_disabled: !user.is_disabled })
    ElMessage.success(`已${action}`)
    fetchUsers()
  } catch (e) {}
}

const changeUserRole = async (userId, role) => {
  const roleLabel = role === 'engineer' ? '工程师' : '甲方'
  try {
    await ElMessageBox.confirm(`确定要将该用户角色变更为「${roleLabel}」吗？`, '确认操作', { type: 'warning' })
    await api.put(`/admin/users/${userId}/role`, { role })
    ElMessage.success('角色已变更')
    fetchUsers()
  } catch (e) {}
}

const forceCancelProject = async (id) => {
  try {
    await ElMessageBox.confirm('确定要强制取消该工程吗？这将同时终止相关合同。', '确认操作', { type: 'warning' })
    await api.post(`/admin/projects/${id}/cancel`)
    ElMessage.success('工程已强制取消')
    fetchProjects()
    fetchStats()
  } catch (e) {}
}

const handleTabChange = (tab) => {
  if (tab === 'overview') fetchStats()
  else if (tab === 'users') fetchUsers()
  else if (tab === 'certs') fetchCerts()
  else if (tab === 'projects') fetchProjects()
  else if (tab === 'contracts') fetchContracts()
  else if (tab === 'finance') fetchFinance()
  else if (tab === 'logs') fetchLogs()
}

onMounted(() => {
  fetchStats()
  fetchCerts()
})

onBeforeUnmount(() => {
  charts.forEach(c => c.dispose())
  charts = []
})
</script>

<style scoped>
.admin-container {
  padding: 0;
}

.admin-tabs :deep(.el-tabs__header) {
  margin-bottom: 24px;
}

.admin-tabs :deep(.el-tabs__item) {
  font-size: 15px;
  font-weight: 500;
}

.stat-card {
  border-radius: 12px;
  transition: all 0.3s ease;
}

.stat-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 12px 24px rgba(0, 0, 0, 0.1);
}

.stat-card-content {
  display: flex;
  align-items: center;
  gap: 16px;
}

.stat-icon {
  width: 56px;
  height: 56px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.stat-info {
  flex: 1;
  min-width: 0;
}

.stat-value {
  font-size: 24px;
  font-weight: 700;
  color: #303133;
  line-height: 1.2;
}

.stat-label {
  font-size: 13px;
  color: #909399;
  margin-top: 4px;
}

h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}

:deep(.el-card) {
  border-radius: 12px;
  border: none;
}

:deep(.el-table) {
  border-radius: 8px;
}

:deep(.el-table th) {
  background-color: #f5f7fa !important;
  font-weight: 600;
}
</style>
