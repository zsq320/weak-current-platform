<template>
  <div class="home">
    <div class="hero" :class="{ 'hero-admin': isAdmin }">
      <h1>弱电工程管理平台</h1>
      <p>连接工程需求方与专业工程师，让弱电工程更高效</p>

      <!-- 管理员统计（更多数据） -->
      <div v-if="isAdmin" class="stats-bar admin-stats">
        <div class="stat">
          <span class="num">{{ globalStats.total_users || 0 }}</span>
          <span class="label">注册用户</span>
        </div>
        <div class="stat">
          <span class="num">{{ globalStats.total_clients || 0 }}</span>
          <span class="label">甲方用户</span>
        </div>
        <div class="stat">
          <span class="num">{{ globalStats.total_engineers || 0 }}</span>
          <span class="label">认证工程师</span>
        </div>
        <div class="stat">
          <span class="num">{{ globalStats.total_projects || 0 }}</span>
          <span class="label">工程项目</span>
        </div>
        <div class="stat">
          <span class="num">{{ globalStats.bidding_projects || 0 }}</span>
          <span class="label">招标中</span>
        </div>
        <div class="stat">
          <span class="num">{{ globalStats.total_contracts || 0 }}</span>
          <span class="label">合同总数</span>
        </div>
        <div class="stat">
          <span class="num">{{ globalStats.active_contracts || 0 }}</span>
          <span class="label">履行中</span>
        </div>
        <div class="stat">
          <span class="num">{{ globalStats.pending_certs || 0 }}</span>
          <span class="label">待审批</span>
        </div>
      </div>

      <!-- 普通用户/未登录统计 -->
      <div v-else class="stats-bar">
        <div class="stat">
          <span class="num">{{ isLoggedIn ? (globalStats.total_projects || 0) : '***' }}</span>
          <span class="label">工程项目</span>
        </div>
        <div class="stat">
          <span class="num">{{ isLoggedIn ? (globalStats.total_users || 0) : '***' }}</span>
          <span class="label">注册用户</span>
        </div>
        <div class="stat">
          <span class="num">{{ isLoggedIn ? (globalStats.total_engineers || 0) : '***' }}</span>
          <span class="label">认证工程师</span>
        </div>
        <div class="stat">
          <span class="num">{{ isLoggedIn ? (globalStats.total_contracts || 0) : '***' }}</span>
          <span class="label">完成合同</span>
        </div>
      </div>

      <div v-if="!isLoggedIn" class="login-hint">
        <el-button type="primary" @click="router.push('/login')">登录 / 注册</el-button>
        <span class="hint-text">登录后查看详细数据</span>
      </div>
      <div v-else-if="isAdmin" class="admin-hint">
        <el-button type="warning" @click="router.push('/admin')">进入管理后台</el-button>
        <span class="hint-text">查看更多详细数据和管理功能</span>
      </div>
    </div>

    <div class="filters">
      <el-input v-model="filters.keyword" placeholder="搜索工程..." clearable @keyup.enter="fetchProjects" style="width: 300px">
        <template #prefix><el-icon><Search /></el-icon></template>
      </el-input>
      <el-select v-model="filters.category" placeholder="工程分类" clearable @change="fetchProjects">
        <el-option v-for="c in categories" :key="c" :label="c" :value="c" />
      </el-select>
      <el-select v-model="filters.status" placeholder="工程状态" clearable @change="fetchProjects">
        <el-option label="招标中" value="bidding" />
        <el-option label="进行中" value="in_progress" />
        <el-option label="已完成" value="completed" />
      </el-select>
    </div>

    <div class="project-list">
      <ProjectCard
        v-for="p in projects"
        :key="p.id"
        :project="p"
        :require-login="!isLoggedIn"
      />
      <el-empty v-if="projects.length === 0" description="暂无工程" />
    </div>

    <el-pagination
      v-if="total > pageSize"
      layout="prev, pager, next"
      :total="total"
      :page-size="pageSize"
      v-model:current-page="page"
      @current-change="fetchProjects"
      style="justify-content: center; margin-top: 20px"
    />
  </div>
</template>

<script setup>
import { ref, onMounted, reactive, computed } from 'vue'
import { useRouter } from 'vue-router'
import { Search } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { useUserStore } from '../store'
import api from '../api'
import ProjectCard from '../components/ProjectCard.vue'

const router = useRouter()
const userStore = useUserStore()

const isLoggedIn = computed(() => userStore.isLoggedIn)
const isAdmin = computed(() => userStore.isAdmin)

const categories = ['安防监控', '网络布线', '门禁系统', '楼宇对讲', '停车场系统', '广播系统', '综合布线', '其他']
const projects = ref([])
const total = ref(0)
const page = ref(1)
const pageSize = 10
const globalStats = ref({})
const filters = reactive({ keyword: '', category: '', status: '' })

const fetchProjects = async () => {
  try {
    const res = await api.get('/projects', { params: { ...filters, page: page.value, pageSize } })
    projects.value = res.data
    total.value = res.total
  } catch (e) {
    ElMessage.error('加载工程列表失败')
  }
}

const fetchGlobalStats = async () => {
  try {
    globalStats.value = await api.get('/dashboard/global')
  } catch (e) {}
}

onMounted(() => {
  fetchProjects()
  fetchGlobalStats()
})
</script>

<style scoped>
.hero {
  text-align: center;
  padding: 48px 24px;
  background: linear-gradient(135deg, #409eff, #67c23a);
  color: #fff;
  border-radius: 20px;
  margin-bottom: 32px;
  box-shadow: 0 8px 32px rgba(64, 158, 255, 0.3);
}

.hero-admin {
  background: linear-gradient(135deg, #303133, #409eff);
  padding-bottom: 36px;
}

.hero h1 {
  font-size: 36px;
  font-weight: 700;
  margin-bottom: 12px;
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.hero p {
  font-size: 18px;
  opacity: 0.9;
  margin-bottom: 32px;
}

.stats-bar {
  display: flex;
  justify-content: center;
  gap: 40px;
  flex-wrap: wrap;
}

.admin-stats {
  gap: 24px;
}

.stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 12px 20px;
  background: rgba(255, 255, 255, 0.15);
  border-radius: 12px;
  min-width: 100px;
  backdrop-filter: blur(10px);
  transition: transform 0.2s;
}

.stat:hover {
  transform: translateY(-2px);
}

.stat .num {
  font-size: 32px;
  font-weight: 700;
  line-height: 1.2;
}

.stat .label {
  font-size: 14px;
  opacity: 0.85;
  margin-top: 4px;
}

.login-hint,
.admin-hint {
  margin-top: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
}

.hint-text {
  color: rgba(255, 255, 255, 0.85);
  font-size: 15px;
}

.filters {
  display: flex;
  gap: 16px;
  margin-bottom: 24px;
  flex-wrap: wrap;
}

.project-list {
  min-height: 200px;
}

:deep(.el-input__wrapper),
:deep(.el-select__wrapper) {
  border-radius: 10px;
}
</style>
