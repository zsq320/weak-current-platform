<template>
  <div class="auth-page">
    <el-card class="auth-card">
      <h2>登录</h2>

      <!-- 登录方式切换 -->
      <el-tabs v-model="loginType" class="login-tabs">
        <el-tab-pane label="账号密码登录" name="password" />
        <el-tab-pane label="手机验证码登录" name="phone" />
      </el-tabs>

      <!-- 账号密码登录 -->
      <el-form v-if="loginType === 'password'" :model="pwdForm" @submit.prevent="handlePwdLogin" label-position="top">
        <el-form-item label="用户名">
          <el-input v-model="pwdForm.username" placeholder="请输入用户名" />
        </el-form-item>
        <el-form-item label="密码">
          <el-input v-model="pwdForm.password" type="password" placeholder="请输入密码" show-password />
        </el-form-item>
        <el-button type="primary" native-type="submit" :loading="loading" style="width: 100%">
          登录
        </el-button>
      </el-form>

      <!-- 手机号验证码登录 -->
      <el-form v-else :model="phoneForm" @submit.prevent="handlePhoneLogin" label-position="top">
        <el-form-item label="手机号">
          <el-input v-model="phoneForm.phone" placeholder="请输入手机号" />
        </el-form-item>
        <el-form-item label="验证码">
          <el-row :gutter="10">
            <el-col :span="14">
              <el-input v-model="phoneForm.code" placeholder="请输入验证码" maxlength="6" />
            </el-col>
            <el-col :span="10">
              <el-button
                :disabled="countdown > 0 || !isPhoneValid"
                :loading="sending"
                @click="sendCode"
                style="width: 100%"
              >
                {{ countdown > 0 ? `${countdown}s` : '获取验证码' }}
              </el-button>
            </el-col>
          </el-row>
        </el-form-item>
        <el-button type="primary" native-type="submit" :loading="loading" style="width: 100%">
          登录
        </el-button>
      </el-form>

      <div class="auth-link">还没有账号？<router-link to="/register">立即注册</router-link></div>
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
const sending = ref(false)
const countdown = ref(0)
const loginType = ref('password')

const pwdForm = reactive({ username: '', password: '' })
const phoneForm = reactive({ phone: '', code: '' })

const PHONE_REGEX = /^1[3-9]\d{9}$/
const isPhoneValid = computed(() => PHONE_REGEX.test(phoneForm.phone))

// 发送手机验证码
const sendCode = async () => {
  if (!isPhoneValid.value) {
    ElMessage.warning('请输入正确的手机号')
    return
  }

  sending.value = true
  try {
    await api.post('/verification/phone', { phone: phoneForm.phone, purpose: 'login' })
    ElMessage.success('验证码已发送，请查看控制台')
    startCountdown()
  } catch (e) {
    ElMessage.error(e.response?.data?.error || '发送失败')
  } finally {
    sending.value = false
  }
}

// 倒计时
const startCountdown = () => {
  countdown.value = 60
  const timer = setInterval(() => {
    countdown.value--
    if (countdown.value <= 0) {
      clearInterval(timer)
    }
  }, 1000)
}

// 账号密码登录
const handlePwdLogin = async () => {
  if (!pwdForm.username || !pwdForm.password) {
    return ElMessage.warning('请填写用户名和密码')
  }

  loading.value = true
  try {
    await userStore.login(pwdForm.username, pwdForm.password)
    ElMessage.success('登录成功')
    router.push('/')
  } catch (e) {
    ElMessage.error(e.response?.data?.error || '登录失败，请检查用户名和密码')
  } finally {
    loading.value = false
  }
}

// 手机号验证码登录
const handlePhoneLogin = async () => {
  if (!isPhoneValid.value) {
    return ElMessage.warning('请输入正确的手机号')
  }
  if (!phoneForm.code) {
    return ElMessage.warning('请输入验证码')
  }

  loading.value = true
  try {
    const res = await api.post('/auth/login/phone', phoneForm)
    // 使用 store 的 saveTokens 方法保存令牌
    userStore.saveTokens(res.accessToken, res.refreshToken)
    userStore.user = res.user
    localStorage.setItem('user', JSON.stringify(res.user))
    ElMessage.success('登录成功')
    router.push('/')
  } catch (e) {
    ElMessage.error(e.response?.data?.error || '登录失败')
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
}
.auth-card {
  width: 420px;
}
.auth-card h2 {
  text-align: center;
  margin-bottom: 16px;
  color: #303133;
}
.login-tabs {
  margin-bottom: 20px;
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
