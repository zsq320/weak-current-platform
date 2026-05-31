<template>
  <div class="auth-page">
    <el-card class="auth-card">
      <h2>注册</h2>
      <el-form :model="form" @submit.prevent="handleRegister" label-position="top">
        <el-form-item label="用户名" required>
          <el-input v-model="form.username" placeholder="4-20位字母、数字或下划线" />
        </el-form-item>

        <el-form-item label="密码" required>
          <el-input v-model="form.password" type="password" placeholder="至少6位，包含字母和数字" show-password />
        </el-form-item>

        <el-form-item label="确认密码" required>
          <el-input v-model="form.confirmPassword" type="password" placeholder="再次输入密码" show-password />
        </el-form-item>

        <el-form-item label="角色" required>
          <el-radio-group v-model="form.role">
            <el-radio value="user">甲方（发布工程）</el-radio>
            <el-radio value="engineer">工程师（接取工程）</el-radio>
          </el-radio-group>
        </el-form-item>

        <el-form-item label="真实姓名">
          <el-input v-model="form.real_name" placeholder="请输入真实姓名" />
        </el-form-item>

        <el-form-item label="手机号" required>
          <el-row :gutter="10">
            <el-col :span="16">
              <el-input v-model="form.phone" placeholder="请输入手机号" />
            </el-col>
            <el-col :span="8">
              <el-button
                :disabled="phoneCountdown > 0 || !isPhoneValid"
                :loading="phoneSending"
                @click="sendPhoneCode"
                style="width: 100%"
              >
                {{ phoneCountdown > 0 ? `${phoneCountdown}s` : '获取验证码' }}
              </el-button>
            </el-col>
          </el-row>
        </el-form-item>

        <el-form-item label="手机验证码" required>
          <el-input v-model="form.phone_code" placeholder="请输入6位验证码" maxlength="6" />
        </el-form-item>

        <el-form-item label="邮箱" required>
          <el-row :gutter="10">
            <el-col :span="16">
              <el-input v-model="form.email" placeholder="请输入邮箱" />
            </el-col>
            <el-col :span="8">
              <el-button
                :disabled="emailCountdown > 0 || !isEmailValid"
                :loading="emailSending"
                @click="sendEmailCode"
                style="width: 100%"
              >
                {{ emailCountdown > 0 ? `${emailCountdown}s` : '获取验证码' }}
              </el-button>
            </el-col>
          </el-row>
        </el-form-item>

        <el-form-item label="邮箱验证码" required>
          <el-input v-model="form.email_code" placeholder="请输入6位验证码" maxlength="6" />
        </el-form-item>

        <el-button type="primary" native-type="submit" :loading="loading" style="width: 100%">
          注册
        </el-button>
      </el-form>
      <div class="auth-link">
        已有账号？<router-link to="/login">立即登录</router-link>
      </div>
    </el-card>
  </div>
</template>

<script setup>
import { reactive, ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useUserStore } from '../store'
import { ElMessage } from 'element-plus'
import api from '../api'

const router = useRouter()
const userStore = useUserStore()
const loading = ref(false)
const phoneSending = ref(false)
const emailSending = ref(false)
const phoneCountdown = ref(0)
const emailCountdown = ref(0)

const form = reactive({
  username: '',
  password: '',
  confirmPassword: '',
  role: 'user',
  real_name: '',
  phone: '',
  phone_code: '',
  email: '',
  email_code: ''
})

const PHONE_REGEX = /^1[3-9]\d{9}$/
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const isPhoneValid = computed(() => PHONE_REGEX.test(form.phone))
const isEmailValid = computed(() => EMAIL_REGEX.test(form.email))

// 发送手机验证码
const sendPhoneCode = async () => {
  if (!isPhoneValid.value) {
    ElMessage.warning('请输入正确的手机号')
    return
  }

  phoneSending.value = true
  try {
    await api.post('/verification/phone', { phone: form.phone, purpose: 'register' })
    ElMessage.success('手机验证码已发送，请查看控制台')
    startCountdown('phone')
  } catch (e) {
    ElMessage.error(e.response?.data?.error || '发送失败')
  } finally {
    phoneSending.value = false
  }
}

// 发送邮箱验证码
const sendEmailCode = async () => {
  if (!isEmailValid.value) {
    ElMessage.warning('请输入正确的邮箱地址')
    return
  }

  emailSending.value = true
  try {
    await api.post('/verification/email', { email: form.email, purpose: 'register' })
    ElMessage.success('邮箱验证码已发送，请查收邮件')
    startCountdown('email')
  } catch (e) {
    ElMessage.error(e.response?.data?.error || '发送失败')
  } finally {
    emailSending.value = false
  }
}

// 倒计时
const startCountdown = (type) => {
  const countdown = type === 'phone' ? phoneCountdown : emailCountdown
  countdown.value = 60
  const timer = setInterval(() => {
    countdown.value--
    if (countdown.value <= 0) {
      clearInterval(timer)
    }
  }, 1000)
}

// 注册
const handleRegister = async () => {
  if (!form.username || !form.password) {
    return ElMessage.warning('请填写用户名和密码')
  }
  if (form.password !== form.confirmPassword) {
    return ElMessage.warning('两次密码不一致')
  }
  if (!isPhoneValid.value) {
    return ElMessage.warning('请输入正确的手机号')
  }
  if (!form.phone_code) {
    return ElMessage.warning('请输入手机验证码')
  }
  if (!isEmailValid.value) {
    return ElMessage.warning('请输入正确的邮箱')
  }
  if (!form.email_code) {
    return ElMessage.warning('请输入邮箱验证码')
  }

  loading.value = true
  try {
    await userStore.register(form)
    ElMessage.success('注册成功')
    router.push('/')
  } catch (e) {
    ElMessage.error(e.response?.data?.error || '注册失败')
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.auth-page {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: calc(100vh - 140px);
  padding: 20px;
}
.auth-card {
  width: 500px;
}
.auth-card h2 {
  text-align: center;
  margin-bottom: 24px;
  color: #303133;
}
.auth-link {
  text-align: center;
  margin-top: 16px;
  font-size: 14px;
  color: #909399;
}
.auth-link a {
  color: #409eff;
  text-decoration: none;
}
</style>
