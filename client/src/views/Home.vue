<template>
  <div class="home">
    <div class="hero">
      <div class="hero-grid"></div>
      <div class="hero-inner">
        <div class="hero-badge">弱电工程 · 全流程协同平台</div>
        <h1>{{ heroTitle }}</h1>
        <p>连接工程需求方与专业工程师，投标签约 · 施工留痕 · 验收结算一体化</p>
        <div class="hero-tags">
          <span v-for="c in categories.slice(0, 6)" :key="c" class="hero-tag">{{ c }}</span>
        </div>
        <div class="hero-actions">
          <el-button v-if="!isLoggedIn" size="large" class="btn-light" @click="router.push('/login')">登录 / 注册</el-button>
          <el-button v-else-if="isAdmin" size="large" class="btn-outline" @click="router.push('/admin')">进入管理后台</el-button>
          <el-button v-else-if="isEngineer" size="large" class="btn-light" @click="scrollToFilters">浏览工程，去投标</el-button>
          <el-button v-else size="large" class="btn-light" @click="router.push('/publish')">发布工程</el-button>
        </div>
      </div>
    </div>

    <div class="filters" ref="filterRef">
      <el-input v-model="filters.keyword" placeholder="搜索工程标题或描述" clearable @keyup.enter="fetchProjects" class="search-input">
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
      <el-empty v-if="projects.length === 0" description="暂无符合条件的工程" />
    </div>

    <el-pagination
      v-if="total > pageSize"
      layout="prev, pager, next"
      :total="total"
      :page-size="pageSize"
      v-model:current-page="page"
      @current-change="fetchProjects"
      class="pager"
    />

    <footer class="home-footer">
      <router-link to="/agreement/user_agreement">用户服务协议</router-link>
      <span class="dot">·</span>
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
  if (!isLoggedIn.value) return '让弱电工程，每一步都可控可溯'
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
/* ============ 深色蓝图 Hero ============ */
.hero{
  position:relative; overflow:hidden;
  background:var(--brand-900);
  background-image:linear-gradient(160deg,#123A60 0%,#0E2C4C 55%,#0C2743 100%);
  border-radius:var(--r-lg);padding:46px 36px 42px;margin-bottom:20px;
}
.hero-grid{
  position:absolute; inset:0; pointer-events:none;
  background-image:
    linear-gradient(rgba(255,255,255,.05) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255,255,255,.05) 1px, transparent 1px);
  background-size:40px 40px;
  mask-image:linear-gradient(180deg,#000 30%,transparent 90%);
  -webkit-mask-image:linear-gradient(180deg,#000 30%,transparent 90%);
}
.hero-inner{ position:relative; text-align:left; max-width:760px; }
.hero-badge{
  display:inline-block; font-size:12.5px; letter-spacing:1px; color:#BFD2E8;
  border:1px solid rgba(255,255,255,.22); border-radius:20px; padding:3px 14px; margin-bottom:16px;
}
.hero h1{ font-size:29px;font-weight:700;color:#fff;margin-bottom:10px;letter-spacing:.5px; }
.hero p{ font-size:14.5px;color:rgba(255,255,255,.72);margin-bottom:18px; }
.hero-tags{ display:flex; flex-wrap:wrap; gap:8px; margin-bottom:24px; }
.hero-tag{
  font-size:12.5px; color:rgba(255,255,255,.82);
  border:1px solid rgba(255,255,255,.18); border-radius:var(--r-sm); padding:2px 11px;
  background:rgba(255,255,255,.05);
}
.hero-actions{ margin-top:4px; }
.btn-light{ background:#fff; color:var(--brand-800); border-color:#fff; font-weight:600; }
.btn-light:hover{ background:#EAF1F8; color:var(--brand-800); border-color:#EAF1F8; }
.btn-outline{ background:transparent; color:#fff; border:1px solid rgba(255,255,255,.5); }
.btn-outline:hover{ background:rgba(255,255,255,.1); color:#fff; border-color:#fff; }

/* ============ 筛选条（白卡） ============ */
.filters{
  display:flex;gap:12px;margin-bottom:18px;flex-wrap:wrap;align-items:center;
  background:#fff;border:1px solid var(--line);border-radius:var(--r-lg);
  padding:13px 16px;box-shadow:var(--sh-1);
}
.project-list{ min-height:200px; }
.search-input{ width:320px; }
.filters :deep(.el-select){ width:160px; }
.pager{ justify-content:center; margin-top:24px; }

.home-footer{ text-align:center;margin-top:30px;padding-bottom:10px;font-size:12.5px;color:var(--ink-400); }
.home-footer a{ color:var(--ink-500); text-decoration:none; }
.home-footer a:hover{ color:var(--brand-700); }
.home-footer .dot{ margin:0 8px; }

@media (max-width:768px){
  .hero{ padding:30px 20px 28px;border-radius:var(--r-lg);margin-bottom:14px; }
  .hero h1{ font-size:22px; }
  .hero p{ font-size:13px;margin-bottom:14px; }
  .hero-tags{ margin-bottom:18px; }
  .search-input{ width:100%; }
  .filters{ gap:10px;margin-bottom:14px; }
  .filters :deep(.el-select){ width:calc(50% - 5px); }
}
</style>
