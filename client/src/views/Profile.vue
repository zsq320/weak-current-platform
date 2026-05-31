<template>
  <div class="profile-container">
    <el-row :gutter="24">
      <el-col :span="8">
        <el-card class="profile-card">
          <template #header><h3>个人信息</h3></template>
          <div class="user-card">
            <div class="avatar-wrapper">
              <el-avatar :size="100" :src="userStore.user?.avatar ? api.defaults.baseURL + userStore.user.avatar : ''" :icon="UserFilled" />
              <el-upload
                class="avatar-uploader"
                action="#"
                :auto-upload="false"
                :show-file-list="false"
                accept="image/*"
                :on-change="handleAvatarChange"
              >
                <el-icon class="avatar-uploader-icon"><Camera /></el-icon>
              </el-upload>
            </div>
            <h3>{{ userStore.user?.real_name || userStore.user?.username }}</h3>
            <div class="tags-row">
              <el-tag effect="dark">{{ { user: '甲方', engineer: '工程师', admin: '管理员' }[userStore.user?.role] }}</el-tag>
              <!-- 实名认证状态 -->
              <el-tag v-if="verificationStatus.is_verified" type="success" effect="dark">
                <el-icon><CircleCheck /></el-icon> 已实名
              </el-tag>
              <el-tag v-else type="info" effect="plain">
                <el-icon><Warning /></el-icon> 未实名
              </el-tag>
              <!-- 工程师认证状态 -->
              <el-tag v-if="userStore.user?.certification_status === 'pending'" type="warning" effect="dark">认证审核中</el-tag>
              <el-tag v-else-if="userStore.user?.certification_status === 'approved'" type="success" effect="dark">已认证工程师</el-tag>
            </div>
            <p class="balance">账户余额: <span>¥{{ userStore.user?.balance?.toLocaleString() || '0' }}</span></p>
          </div>
          <el-form :model="form" label-position="top" style="margin-top: 20px">
            <el-form-item label="真实姓名">
              <el-input v-model="form.real_name" :disabled="verificationStatus.real_name_verified" />
            </el-form-item>
            <el-form-item label="手机号">
              <el-input v-model="form.phone" :disabled="verificationStatus.phone_verified" />
            </el-form-item>
            <el-form-item label="邮箱">
              <el-input v-model="form.email" :disabled="verificationStatus.email_verified" />
            </el-form-item>
            <el-button type="primary" @click="updateProfile" style="width: 100%">保存修改</el-button>
            <el-button @click="showChangePassword = true" style="width: 100%; margin-top: 10px">修改密码</el-button>
          </el-form>
        </el-card>

        <!-- 实名认证卡片 -->
        <el-card style="margin-top: 16px">
          <template #header>
            <div class="card-header">
              <span>实名认证</span>
              <el-tag v-if="verificationStatus.is_verified" type="success" size="small">已认证</el-tag>
              <el-tag v-else type="warning" size="small">未认证</el-tag>
            </div>
          </template>

          <el-alert v-if="verificationStatus.is_verified" type="success" title="您已完成实名认证" show-icon :closable="false">
            <template #default>
              <p>认证时间：{{ verificationStatus.verified_at || '-' }}</p>
              <p>您可以正常发布工程和参与投标。</p>
            </template>
          </el-alert>

          <el-form v-else :model="verifyForm" label-position="top">
            <el-alert type="warning" title="实名认证是必须的" show-icon :closable="false" style="margin-bottom: 16px">
              <template #default>
                <p>发布工程或参与投标前，必须完成实名认证。</p>
              </template>
            </el-alert>

            <el-form-item label="真实姓名" required>
              <el-input v-model="verifyForm.real_name" placeholder="请输入真实姓名" />
            </el-form-item>

            <el-form-item label="身份证号" required>
              <el-input v-model="verifyForm.id_card" placeholder="请输入18位身份证号" maxlength="18" show-password />
            </el-form-item>

            <el-button type="primary" @click="submitVerification" :loading="verifyLoading" style="width: 100%">
              提交认证
            </el-button>
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
            <el-form-item label="上传资质图片（可选）">
              <el-upload
                v-model:file-list="certImages"
                action="#"
                :auto-upload="false"
                list-type="picture-card"
                :limit="10"
                accept="image/*"
                :on-preview="handlePictureCardPreview"
                :on-remove="handleRemove"
              >
                <el-icon><Plus /></el-icon>
              </el-upload>
              <el-dialog v-model="dialogVisible">
                <img w-full :src="dialogImageUrl" alt="Preview" style="width: 100%" />
              </el-dialog>
            </el-form-item>
            <el-button type="primary" @click="applyCert" :loading="certLoading">提交认证申请</el-button>
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

    <!-- 修改密码对话框 -->
    <el-dialog v-model="showChangePassword" title="修改密码" width="500px">
      <el-form :model="passwordForm" label-position="top">
        <el-form-item label="验证方式" required>
          <el-radio-group v-model="passwordForm.verification_type">
            <el-radio value="phone" :disabled="!userStore.user?.phone">
              手机验证 {{ userStore.user?.phone ? '(' + userStore.user?.phone.slice(0,3) + '****' + userStore.user?.phone.slice(-4) + ')' : '(未绑定)' }}
            </el-radio>
            <el-radio value="email" :disabled="!userStore.user?.email">
              邮箱验证 {{ userStore.user?.email ? '(' + userStore.user?.email.slice(0,3) + '***' + ')' : '(未绑定)' }}
            </el-radio>
          </el-radio-group>
        </el-form-item>

        <el-form-item label="验证码" required>
          <el-input v-model="passwordForm.verification_code" placeholder="请输入验证码" style="width: 60%">
            <template #append>
              <el-button @click="sendVerifyCode" :disabled="codeCountdown > 0">
                {{ codeCountdown > 0 ? codeCountdown + '秒' : '获取验证码' }}
              </el-button>
            </template>
          </el-input>
        </el-form-item>

        <el-form-item label="新密码" required>
          <el-input v-model="passwordForm.new_password" type="password" placeholder="请输入新密码（至少6位）" show-password />
        </el-form-item>

        <el-form-item label="确认新密码" required>
          <el-input v-model="passwordForm.confirm_password" type="password" placeholder="请再次输入新密码" show-password />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showChangePassword = false">取消</el-button>
        <el-button type="primary" @click="handleChangePassword" :loading="passwordLoading">确认修改</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, computed } from 'vue'
import { useUserStore } from '../store'
import { ElMessage, ElMessageBox } from 'element-plus'
import { UserFilled, Plus, CircleCheck, Warning, Camera } from '@element-plus/icons-vue'
import api from '../api'

const backendBaseURL = api.defaults.baseURL || ''

const userStore = useUserStore()
const form = reactive({
  real_name: userStore.user?.real_name || '',
  phone: userStore.user?.phone || '',
  email: userStore.user?.email || ''
})
const depositAmount = ref(100)
const certInfo = ref('')
const certImages = ref([])
const certLoading = ref(false)
const reviews = ref([])
const reviewStats = ref({ avg_rating: 0, total: 0 })

// 图片预览
const dialogImageUrl = ref('')
const dialogVisible = ref(false)

const handlePictureCardPreview = (file) => {
  dialogImageUrl.value = file.url
  dialogVisible.value = true
}

const handleRemove = (file, fileList) => {
  certImages.value = fileList
}

// 头像上传
const handleAvatarChange = async (file) => {
  if (!file.raw) return

  // 验证文件类型
  if (!file.raw.type.startsWith('image/')) {
    return ElMessage.warning('请选择图片文件')
  }

  // 验证文件大小 (5MB)
  if (file.raw.size > 5 * 1024 * 1024) {
    return ElMessage.warning('图片大小不能超过5MB')
  }

  const formData = new FormData()
  formData.append('avatar', file.raw)

  try {
    const res = await api.post('/auth/avatar', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
    await userStore.fetchUser()
    ElMessage.success('头像上传成功')
  } catch (e) {
    ElMessage.error(e.response?.data?.error || '头像上传失败')
  }
}

// 修改密码相关
const showChangePassword = ref(false)
const passwordLoading = ref(false)
const codeCountdown = ref(0)
let countdownTimer = null

const passwordForm = reactive({
  verification_type: 'phone',
  verification_code: '',
  new_password: '',
  confirm_password: ''
})

// 发送验证码
const sendVerifyCode = async () => {
  if (!passwordForm.verification_type) {
    return ElMessage.warning('请选择验证方式')
  }

  try {
    await api.post('/auth/send-verify-code', {
      type: passwordForm.verification_type
    })
    ElMessage.success('验证码已发送')

    // 开始倒计时
    codeCountdown.value = 60
    countdownTimer = setInterval(() => {
      codeCountdown.value--
      if (codeCountdown.value <= 0) {
        clearInterval(countdownTimer)
      }
    }, 1000)
  } catch (e) {
    ElMessage.error(e.response?.data?.error || '发送失败')
  }
}

// 修改密码
const handleChangePassword = async () => {
  if (!passwordForm.verification_code) {
    return ElMessage.warning('请输入验证码')
  }
  if (!passwordForm.new_password || passwordForm.new_password.length < 6) {
    return ElMessage.warning('新密码长度至少6位')
  }
  if (passwordForm.new_password !== passwordForm.confirm_password) {
    return ElMessage.warning('两次输入的密码不一致')
  }

  passwordLoading.value = true
  try {
    await api.post('/auth/change-password', {
      verification_type: passwordForm.verification_type,
      verification_code: passwordForm.verification_code,
      new_password: passwordForm.new_password
    })
    ElMessage.success('密码修改成功')
    showChangePassword.value = false
    // 重置表单
    passwordForm.verification_code = ''
    passwordForm.new_password = ''
    passwordForm.confirm_password = ''
  } catch (e) {
    ElMessage.error(e.response?.data?.error || '修改失败')
  } finally {
    passwordLoading.value = false
  }
}

// 实名认证状态
const verificationStatus = ref({
  is_verified: false,
  real_name_verified: false,
  phone_verified: false,
  email_verified: false,
  verified_at: null
})

// 获取认证状态
const fetchVerificationStatus = async () => {
  try {
    const res = await api.get('/auth/verification-status')
    verificationStatus.value = {
      is_verified: res.is_verified || false,
      real_name_verified: !!res.real_name_verified,
      phone_verified: !!res.phone_verified,
      email_verified: !!res.email_verified,
      verified_at: res.verified_at || null
    }
  } catch (e) {
    // 如果获取失败，从用户信息中获取基本状态
    verificationStatus.value.is_verified = !!userStore.user?.real_name_verified
    verificationStatus.value.real_name_verified = !!userStore.user?.real_name_verified
  }
}

// 实名认证表单
const verifyForm = reactive({
  real_name: '',
  id_card: ''
})
const verifyLoading = ref(false)

// 提交实名认证
const submitVerification = async () => {
  if (!verifyForm.real_name) {
    return ElMessage.warning('请输入真实姓名')
  }
  if (!verifyForm.id_card || verifyForm.id_card.length !== 18) {
    return ElMessage.warning('请输入18位身份证号')
  }

  verifyLoading.value = true
  try {
    await api.post('/auth/verify-identity', {
      real_name: verifyForm.real_name,
      id_card: verifyForm.id_card
    })
    ElMessage.success('实名认证已提交')
    await fetchVerificationStatus()
    await userStore.fetchUser()
    // 清空表单
    verifyForm.real_name = ''
    verifyForm.id_card = ''
  } catch (e) {
    ElMessage.error(e.response?.data?.error || '认证提交失败')
  } finally {
    verifyLoading.value = false
  }
}

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

  certLoading.value = true
  try {
    // 使用 FormData 上传图片
    const formData = new FormData()
    formData.append('certification', certInfo.value)

    // 添加图片文件
    certImages.value.forEach((file) => {
      if (file.raw) {
        formData.append('images', file.raw)
      }
    })

    await api.post('/auth/certify', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
    await userStore.fetchUser()
    ElMessage.success('认证申请已提交')
    certInfo.value = ''
    certImages.value = []
  } catch (e) {
    ElMessage.error(e.response?.data?.error || '提交失败')
  } finally {
    certLoading.value = false
  }
}

onMounted(async () => {
  try {
    const res = await api.get(`/reviews/user/${userStore.user?.id}`)
    reviews.value = res.reviews
    reviewStats.value = { avg_rating: res.avg_rating, total: res.total }
  } catch (e) {}
  // 获取认证状态
  await fetchVerificationStatus()
})
</script>

<style scoped>
.profile-container {
  padding: 0;
}

.profile-card {
  border-radius: 16px;
  border: none;
}

h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
}

.user-card {
  text-align: center;
  padding: 10px 0;
}

.avatar-wrapper {
  position: relative;
  display: inline-block;
  margin-bottom: 16px;
}

.avatar-uploader {
  position: absolute;
  bottom: 0;
  right: 0;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: linear-gradient(135deg, #409eff, #67c23a);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: transform 0.2s;
  box-shadow: 0 4px 12px rgba(64, 158, 255, 0.4);
}

.avatar-uploader:hover {
  transform: scale(1.1);
}

.avatar-uploader-icon {
  color: white;
  font-size: 18px;
}

.user-card h3 {
  margin: 16px 0 12px;
  font-size: 20px;
  font-weight: 600;
}

.tags-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: center;
  margin-bottom: 16px;
}

.balance {
  margin-top: 16px;
  color: #909399;
  font-size: 14px;
}

.balance span {
  color: #f56c6c;
  font-weight: 700;
  font-size: 24px;
}

.quick-amounts {
  display: flex;
  gap: 8px;
  margin-top: 12px;
  flex-wrap: wrap;
}

.review-summary {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
  padding-bottom: 16px;
  border-bottom: 1px solid #ebeef5;
}

.review-item {
  padding: 16px 0;
  border-bottom: 1px solid #f0f0f0;
}

.review-item:last-child {
  border-bottom: none;
}

.review-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.review-item p {
  color: #606266;
  font-size: 14px;
  margin: 8px 0;
  line-height: 1.6;
}

.review-time {
  font-size: 12px;
  color: #c0c4cc;
}

:deep(.el-card) {
  border-radius: 16px;
  border: none;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
}

:deep(.el-form-item__label) {
  font-weight: 500;
}

:deep(.el-input__wrapper) {
  border-radius: 8px;
}

:deep(.el-button) {
  border-radius: 8px;
}
</style>
