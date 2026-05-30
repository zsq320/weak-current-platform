<template>
  <div class="home">
    <div class="hero">
      <h1>弱电工程管理平台</h1>
      <p>连接工程需求方与专业工程师，让弱电工程更高效</p>
      <div class="stats-bar">
        <div class="stat"><span class="num">{{ globalStats.total_projects || 0 }}</span><span class="label">工程项目</span></div>
        <div class="stat"><span class="num">{{ globalStats.total_users || 0 }}</span><span class="label">注册用户</span></div>
        <div class="stat"><span class="num">{{ globalStats.total_engineers || 0 }}</span><span class="label">认证工程师</span></div>
        <div class="stat"><span class="num">{{ globalStats.total_contracts || 0 }}</span><span class="label">完成合同</span></div>
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
      <ProjectCard v-for="p in projects" :key="p.id" :project="p" />
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
import { ref, onMounted, reactive } from 'vue'
import { Search } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import api from '../api'
import ProjectCard from '../components/ProjectCard.vue'

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
.hero { text-align: center; padding: 40px 20px; background: linear-gradient(135deg, #409eff, #67c23a); color: #fff; border-radius: 12px; margin-bottom: 24px; }
.hero h1 { font-size: 32px; margin-bottom: 8px; }
.hero p { font-size: 16px; opacity: 0.9; margin-bottom: 24px; }
.stats-bar { display: flex; justify-content: center; gap: 48px; }
.stat { display: flex; flex-direction: column; }
.stat .num { font-size: 28px; font-weight: bold; }
.stat .label { font-size: 13px; opacity: 0.8; }
.filters { display: flex; gap: 12px; margin-bottom: 20px; flex-wrap: wrap; }
.project-list { min-height: 200px; }
</style>
