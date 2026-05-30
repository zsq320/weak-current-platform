<template>
  <div>
    <el-row :gutter="24">
      <el-col :span="8">
        <el-card>
          <template #header><h3>个人信息</h3></template>
          <div class="user-card">
            <el-avatar :size="80" :icon="UserFilled" />
            <h3>{{ userStore.user?.real_name || userStore.user?.username }}</h3>
            <el-tag>{{ { user: '甲方', engineer: '工程师', admin: '管理员' }[userStore.user?.role] }}</el-tag>
            <el-tag v-if="userStore.user?.certification_status === 'pending'" type="warning" style="margin-top: 8px">认证审批中</el-tag>
            <el-tag v-else-if="userStore.user?.certification_status === 'approved'" type="success" style="margin-top: 8px">已认证工程师</el-tag>
            <p class="balance">账户余额: <span>¥{{ userStore.user?.balance?.toLocaleString() || '0' }}</span></p>
          </div>
          <el-form :model="form" label-position="top" style="margin-top: 20px">
            <el-form-item label="真实姓名">
              <el-input v-model="form.real_name" />
            </el-form-item>
            <el-form-item label="手机号">
              <el-input v-model="form.phone" />
            </el-form-item>
            <el-form-item label="邮箱">
              <el-input v-model="form.email" />
            </el-form-item>
            <el-button type="primary" @click="updateProfile" style="width: 100%">保存修改</el-button>
          </el-form>
        </el-card>
      </el-col>
      <el-col :span="16">
        <el-card>
          <template #header><h3>模拟充值</h3></template>
          <el-form inline>
            <el-form-item label="充值金额">
              <el-input-number v-model="depositAmount" :min="1" :max="100000" :step="100" />
            </el-form-item>
            <el-form-item>
              <el-button type="primary" @click="handleDeposit">充值</el-button>
            </el-form-item>
          </el-form>
          <div class="quick-amounts">
            <el-button v-for="a in [100, 500, 1000, 5000, 10000]" :key="a" @click="depositAmount = a">¥{{ a }}</el-button>
          </div>
        </el-card>

        <el-card style="margin-top: 16px" v-if="userStore.user?.role === 'user' && userStore.user?.certification_status !== 'pending' && userStore.user?.certification_status !== 'approved'">
          <template #header><h3>申请工程师认证</h3></template>
          <el-form label-position="top">
            <el-form-item label="认证信息（资质证书、从业经验等）">
              <el-input v-model="certInfo" type="textarea" :rows="4" placeholder="请填写您的专业资质和从业经验..." />
            </el-form-item>
            <el-button type="primary" @click="applyCert">提交认证申请</el-button>
          </el-form>
        </el-card>

        <el-card style="margin-top: 16px" v-if="userStore.user?.certification_status === 'pending'">
          <template #header><h3>认证状态</h3></template>
          <el-result icon="info" title="工程师认证审批中" sub-title="您的认证申请正在审核，请耐心等待" />
        </el-card>

        <el-card style="margin-top: 16px">
          <template #header><h3>我的评价</h3></template>
          <div v-if="reviews.length > 0">
            <div class="review-summary" v-if="reviewStats.avg_rating">
              <el-rate :model-value="reviewStats.avg_rating" disabled show-score />
              <span>{{ reviewStats.total }} 条评价</span>
            </div>
            <div v-for="r in reviews" :key="r.id" class="review-item">
              <div class="review-header">
                <span>{{ r.from_real_name || r.from_username }}</span>
                <el-rate :model-value="r.rating" disabled size="small" />
              </div>
              <p>{{ r.comment }}</p>
              <span class="review-time">{{ r.created_at }}</span>
            </div>
          </div>
          <el-empty v-else description="暂无评价" />
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { useUserStore } from '../store'
import { ElMessage } from 'element-plus'
import { UserFilled } from '@element-plus/icons-vue'
import api from '../api'

const userStore = useUserStore()
const form = reactive({
  real_name: userStore.user?.real_name || '',
  phone: userStore.user?.phone || '',
  email: userStore.user?.email || ''
})
const depositAmount = ref(100)
const certInfo = ref('')
const reviews = ref([])
const reviewStats = ref({ avg_rating: 0, total: 0 })

const updateProfile = async () => {
  try {
    await api.put('/auth/profile', form)
    await userStore.fetchUser()
    ElMessage.success('保存成功')
  } catch (e) {}
}

const handleDeposit = async () => {
  try {
    const res = await api.post('/auth/deposit', { amount: depositAmount.value })
    await userStore.fetchUser()
    ElMessage.success(res.message)
  } catch (e) {}
}

const applyCert = async () => {
  if (!certInfo.value) return ElMessage.warning('请填写认证信息')
  try {
    await api.post('/auth/certify', { certification: certInfo.value })
    await userStore.fetchUser()
    ElMessage.success('认证申请已提交')
  } catch (e) {}
}

onMounted(async () => {
  try {
    const res = await api.get(`/reviews/user/${userStore.user?.id}`)
    reviews.value = res.reviews
    reviewStats.value = { avg_rating: res.avg_rating, total: res.total }
  } catch (e) {}
})
</script>

<style scoped>
h3 { margin: 0; }
.user-card { text-align: center; }
.user-card h3 { margin: 12px 0 8px; }
.balance { margin-top: 12px; color: #909399; }
.balance span { color: #f56c6c; font-weight: bold; font-size: 20px; }
.quick-amounts { display: flex; gap: 8px; margin-top: 12px; }
.review-summary { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; padding-bottom: 12px; border-bottom: 1px solid #ebeef5; }
.review-item { padding: 12px 0; border-bottom: 1px solid #ebeef5; }
.review-item:last-child { border-bottom: none; }
.review-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
.review-item p { color: #606266; font-size: 14px; margin: 4px 0; }
.review-time { font-size: 12px; color: #c0c4cc; }
</style>
