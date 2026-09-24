<template>
  <div class="engineer-profile">
    <el-card>
      <template #header>
        <div class="header-row">
          <h2 style="margin:0">工程师主页</h2>
          <el-button v-if="userStore.isLoggedIn && userStore.user?.id !== profile.id" type="primary" size="small" @click="openMessage">
            发私信
          </el-button>
        </div>
      </template>

      <el-row :gutter="24">
        <el-col :xs="24" :md="8">
          <div class="profile-card">
            <el-avatar :size="80" :src="profile.avatar || ''" />
            <h3>{{ profile.username }}</h3>
            <div class="tags">
              <el-tag v-if="profile.certification_status === 'approved'" type="success">已认证工程师</el-tag>
              <el-tag v-else-if="profile.certification_status === 'pending'" type="warning">认证审核中</el-tag>
              <el-tag v-else type="info">未认证</el-tag>
              <el-tag v-if="profile.company" type="success" effect="plain">
                {{ profile.company.company_name }}
              </el-tag>
            </div>
            <p class="since">加入时间：{{ String(profile.member_since || '').slice(0, 10) }}</p>
          </div>
        </el-col>
        <el-col :xs="24" :md="16">
          <el-row :gutter="14">
            <el-col :span="6" v-for="s in statCards" :key="s.label">
              <div class="stat">
                <div class="stat-value">{{ s.value }}</div>
                <div class="stat-label">{{ s.label }}</div>
              </div>
            </el-col>
          </el-row>
          <el-alert v-if="profile.company" type="success" :closable="false" style="margin-top: 14px"
            :title="`企业资质：${profile.company.company_name}${profile.company.qualification_level ? '（' + profile.company.qualification_level + '）' : ''}`" />
        </el-col>
      </el-row>
    </el-card>

    <el-card style="margin-top: 16px">
      <template #header>
        <div class="header-row">
          <h3 style="margin:0">收到的评价（{{ reviews.length }}）</h3>
          <div v-if="reviewSummary.total > 0" class="review-summary">
            <el-rate :model-value="reviewSummary.avg" disabled show-score />
          </div>
        </div>
      </template>
      <div v-for="r in reviews" :key="r.id" class="review-item">
        <div class="review-header">
          <span>{{ r.from_real_name || r.from_username }}</span>
          <el-rate :model-value="r.rating" disabled size="small" />
          <span class="review-time">{{ r.created_at }}</span>
        </div>
        <p v-if="r.comment">{{ r.comment }}</p>
      </div>
      <el-empty v-if="reviews.length === 0" description="暂无评价" :image-size="60" />
    </el-card>

    <!-- 私信对话框 -->
    <el-dialog v-model="msgVisible" :title="`给 ${profile.username} 发送私信`" width="460px">
      <el-form label-position="top">
        <el-form-item label="标题">
          <el-input v-model="msgForm.title" placeholder="可选" maxlength="100" />
        </el-form-item>
        <el-form-item label="内容" required>
          <el-input v-model="msgForm.content" type="textarea" :rows="4" maxlength="2000" show-word-limit />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="msgVisible = false">取消</el-button>
        <el-button type="primary" :loading="sending" @click="sendMsg">发送</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import api from '../api'
import { useUserStore } from '../store'

const route = useRoute()
const userStore = useUserStore()
const profile = ref({})
const reviews = ref([])
const msgVisible = ref(false)
const sending = ref(false)
const msgForm = ref({ title: '', content: '' })

const statCards = computed(() => {
  const s = profile.value.stats || {}
  return [
    { label: '完成工程', value: s.completed_contracts ?? 0 },
    { label: '履行中合同', value: s.active_contracts ?? 0 },
    { label: '投标/中标', value: `${s.total_bids ?? 0}/${s.won_bids ?? 0}` },
    { label: '综合评分', value: s.review_count ? `${s.avg_rating} 分（${s.review_count}条）` : '暂无' }
  ]
})

const reviewSummary = computed(() => {
  if (reviews.value.length === 0) return { avg: 0, total: 0 }
  const avg = reviews.value.reduce((s, r) => s + r.rating, 0) / reviews.value.length
  return { avg: Math.round(avg * 10) / 10, total: reviews.value.length }
})

const openMessage = () => {
  msgForm.value = { title: '', content: '' }
  msgVisible.value = true
}

const sendMsg = async () => {
  if (!msgForm.value.content.trim()) return ElMessage.warning('请填写消息内容')
  sending.value = true
  try {
    await api.post('/messages', { to_user_id: profile.value.id, ...msgForm.value })
    ElMessage.success('消息已发送')
    msgVisible.value = false
  } catch (e) {
    ElMessage.error(e.response?.data?.error || '发送失败')
  } finally {
    sending.value = false
  }
}

onMounted(async () => {
  try {
    profile.value = await api.get(`/users/${route.params.id}/profile`)
  } catch (e) {
    ElMessage.error('用户不存在或已注销')
    return
  }
  try {
    const res = await api.get(`/reviews/user/${route.params.id}`)
    reviews.value = res.reviews || []
  } catch (e) { /* 评价加载失败不阻塞 */ }
})
</script>

<style scoped>
.header-row { display: flex; justify-content: space-between; align-items: center; }
.profile-card { text-align: center; padding: 8px 0; }
.profile-card h3 { margin: 12px 0 8px; }
.tags { display: flex; gap: 8px; justify-content: center; flex-wrap: wrap; }
.since { color: var(--ink-400); font-size: 12.5px; margin-top: 10px; }
.stat { text-align: center; background: var(--bg-muted); border-radius: var(--r-md); padding: 14px 6px; }
.stat-value { font-size: 19px; font-weight: 700; color: var(--ink-900); font-variant-numeric: tabular-nums; }
.stat-label { font-size: 12px; color: var(--ink-500); margin-top: 4px; }
.review-summary { display: flex; align-items: center; }
.review-item { padding: 12px 0; border-bottom: 1px solid var(--line-soft); }
.review-item:last-child { border-bottom: none; }
.review-header { display: flex; align-items: center; gap: 10px; }
.review-time { font-size: 12px; color: var(--ink-400); }
.review-item p { color: var(--ink-700); font-size: 13.5px; margin: 6px 0 0; }
h2 { font-size: 17px; }
</style>
