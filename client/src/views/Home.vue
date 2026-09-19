<template>
  <div class="home">
    <div class="hero">
      <div class="hero-inner">
        <h1>{{ heroTitle }}</h1>
        <p>连接工程需求方与专业工程师，让弱电工程更高效</p>
        <div class="hero-actions">
          <el-button v-if="!isLoggedIn" type="primary" size="large" @click="router.push('/login')">登录 / 注册</el-button>
          <el-button v-else-if="isAdmin" size="large" @click="router.push('/admin')">进入管理后台</el-button>
          <el-button v-else-if="isEngineer" type="primary" size="large" @click="scrollToFilters">浏览工程，去投标</el-button>
          <el-button v-else type="primary" size="large" @click="router.push('/publish')">发布工程</el-button>
        </div>
      </div>
    </div>

    <div class="filters" ref="filterRef">
      <el-input v-model="filters.keyword" placeholder="搜索工程..." clearable @keyup.enter="fetchProjects" class="search-input">
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

    <footer class="home-footer">
      <router-link to="/agreement/user_agreement">用户服务协议</router-link>
      <span>·</span>
      <router-link to="/agreement/privacy">隐私政策</router-link>
    </footer>
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
const isEngineer = computed(() => userStore.user?.role === 'engineer')
const heroTitle = computed(() => {
  if (!isLoggedIn.value) return '弱电工程管理平台'
  if (isAdmin.value) return '平台运营管理'
  if (isEngineer.value) return '发现适合你的弱电工程'
  return '把工程交给专业的人'
})
const filterRef = ref(null)
const scrollToFilters = () => filterRef.value?.scrollIntoView({ behavior: 'smooth' })

const categories = ['安防监控', '网络布线', '门禁系统', '楼宇对讲', '停车场系统', '广播系统', '综合布线', '其他']
const projects = ref([])
const total = ref(0)
const page = ref(1)
const pageSize = 10
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

onMounted(() => {
  fetchProjects()
})
</script>

<style scoped>
.hero{
  background:linear-gradient(135deg,#F5F9FF 0%,#F0FDFA 100%);
  border:1px solid #D7E4FC;border-radius:14px;padding:38px 32px;margin-bottom:22px;text-align:center;
}
.hero h1{ font-size:26px;font-weight:700;color:#0F172A;margin-bottom:8px; }
.hero p{ font-size:14px;color:#64748B;margin-bottom:20px; }
.hero-actions{ margin-top:4px; }
.filters{ display:flex;gap:12px;margin-bottom:20px;flex-wrap:wrap;align-items:center; }
.project-list{ min-height:200px; }
:deep(.el-input__wrapper),
:deep(.el-select__wrapper){ border-radius:6px; }
.search-input{ width:300px; }
.filters :deep(.el-select){ width:150px; }
@media (max-width:768px){
  .hero{ padding:26px 16px;border-radius:12px;margin-bottom:16px; }
  .hero h1{ font-size:22px; }
  .hero p{ font-size:13px;margin-bottom:16px; }
  .search-input{ width:100%; }
  .filters{ gap:10px;margin-bottom:14px; }
  .filters :deep(.el-select){ width:calc(50% - 5px); }
}
</style>
