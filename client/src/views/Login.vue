<template>
  <main class="auth-page">
    <img class="auth-bg" src="/assets/auth-bg-weakcurrent.svg" alt="" />
    <div class="auth-mask" />

    <section class="auth-card auth-card-no-heading" aria-label="登录">
      <div class="auth-card-main">
        <div class="auth-logo">
          <span class="logo-mark">▦</span>
          <span class="logo-text">弱电工程管理平台</span>
        </div>

        <nav class="cas-login-tabs" aria-label="登录方式">
          <button :class="{ active: loginType === 'password' }" type="button" @click="loginType = 'password'">
            账号登录
          </button>
          <button :class="{ active: loginType === 'phone' }" type="button" @click="loginType = 'phone'">
            手机验证码登录
          </button>
        </nav>

        <!-- 账号密码登录（含前端算术验证码） -->
        <form v-if="loginType === 'password'" class="cas-auth-form" @submit.prevent="handlePwdLogin">
          <el-form-item>
            <el-input v-model="pwdForm.username" autocomplete="username" placeholder="请输入用户名" size="large" :prefix-icon="User" />
          </el-form-item>
          <el-form-item>
            <el-input v-model="pwdForm.password" type="password" autocomplete="current-password" show-password placeholder="请输入密码" size="large" :prefix-icon="Lock" />
          </el-form-item>

          <div class="cas-captcha-row">
            <el-form-item>
              <el-input v-model="pwdForm.captcha" placeholder="请输入验证码" size="large" :prefix-icon="Key" autocomplete="off" />
            </el-form-item>
            <button
              class="cas-captcha"
              type="button"
              :aria-label="`验证码：${captcha.left} + ${captcha.right} =，点击刷新`"
              title="点击刷新验证码"
              @click="refreshCaptcha"
            >
              <span>{{ captcha.left }}</span>
              <b>+</b>
              <span>{{ captcha.right }}</span>
              <b>=</b>
            </button>
          </div>

          <div class="cas-form-options">
            <el-checkbox v-model="rememberUsername">记住账号</el-checkbox>
            <a href="javascript:void(0)" @click="forgotVisible = true">忘记密码？</a>
          </div>

          <button class="cas-submit el-button el-button--primary" type="submit" :disabled="loading">
            {{ loading ? '登录中…' : '登 录' }}
          </button>

          <p class="auth-switch">
            还没有账号？
            <router-link :to="`/register${redirectQuery}`">立即注册</router-link>
          </p>
        </form>

        <!-- 手机验证码登录 -->
        <form v-else class="cas-auth-form" @submit.prevent="handlePhoneLogin">
          <el-form-item>
            <el-input v-model="phoneForm.phone" placeholder="请输入手机号" size="large" :prefix-icon="Iphone" maxlength="11" />
          </el-form-item>
          <el-form-item>
            <el-row :gutter="12" style="width: 100%">
              <el-col :span="14">
                <el-input v-model="phoneForm.code" placeholder="6位验证码" size="large" :prefix-icon="Key" maxlength="6" />
              </el-col>
              <el-col :span="10">
                <el-button class="cas-send-btn" :disabled="countdown > 0 || !isPhoneValid" :loading="sending" @click="sendCode">
                  {{ countdown > 0 ? `${countdown}s` : '获取验证码' }}
                </el-button>
              </el-col>
            </el-row>
          </el-form-item>

          <div class="cas-form-options">
            <span></span>
            <a href="javascript:void(0)" @click="forgotVisible = true">忘记密码？</a>
          </div>

          <button class="cas-submit el-button el-button--primary" type="submit" :disabled="loading">
            {{ loading ? '登录中…' : '登 录' }}
          </button>

          <p class="auth-switch">
            还没有账号？
            <router-link :to="`/register${redirectQuery}`">立即注册</router-link>
          </p>
        </form>
      </div>

      <footer class="cas-auth-footer">
        <div class="cas-footer-links">
          <router-link class="cas-home-link" to="/">返回首页</router-link>
        </div>
        <div class="cas-browser-row">
          <span>推荐使用浏览器</span>
          <span class="cas-browser"><img src="/assets/browser-edge.png" alt="" /> Edge</span>
          <span class="cas-browser"><img src="/assets/browser-firefox.png" alt="" /> 火狐</span>
          <span class="cas-browser"><img src="/assets/browser-chrome.png" alt="" /> 谷歌</span>
        </div>
      </footer>
    </section>

    <!-- 忘记密码对话框（QQ邮箱验证码重置） -->
    <el-dialog v-model="forgotVisible" title="找回密码" width="440px">
      <el-steps :active="forgotStep" simple style="margin-bottom: 16px">
        <el-step title="验证邮箱" />
        <el-step title="设置新密码" />
      </el-steps>
      <el-form v-if="forgotStep === 0" label-position="top">
        <el-form-item label="注册邮箱">
          <el-input v-model="forgotForm.email" placeholder="请输入注册时绑定的邮箱" />
        </el-form-item>
        <el-form-item label="邮箱验证码">
          <el-row :gutter="10">
            <el-col :span="14"><el-input v-model="forgotForm.code" placeholder="6位验证码" maxlength="6" /></el-col>
            <el-col :span="10">
              <el-button style="width: 100%" :loading="forgotSending" @click="sendForgotCode">
                {{ forgotCountdown > 0 ? `${forgotCountdown}s` : '获取验证码' }}
              </el-button>
            </el-col>
          </el-row>
        </el-form-item>
      </el-form>
      <el-form v-else label-position="top">
        <el-form-item label="新密码">
          <el-input v-model="forgotForm.new_password" type="password" show-password placeholder="至少6位，含字母和数字" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="forgotVisible = false">取消</el-button>
        <el-button v-if="forgotStep === 0" type="primary" :disabled="!forgotForm.code" @click="forgotStep = 1">下一步</el-button>
        <el-button v-else type="primary" :loading="forgotLoading" @click="doResetPassword">重置密码</el-button>
      </template>
    </el-dialog>
  </main>
</template>

<script setup>
import { reactive, ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useUserStore } from '../store'
import { ElMessage } from 'element-plus'
import { User, Lock, Iphone, Key } from '@element-plus/icons-vue'
import api from '../api'

const router = useRouter()
const route = useRoute()
const userStore = useUserStore()

const loading = ref(false)
const sending = ref(false)
const countdown = ref(0)
const loginType = ref('password')

const pwdForm = reactive({ username: '', password: '', captcha: '' })
const phoneForm = reactive({ phone: '', code: '' })

const PHONE_REGEX = /^1[3-9]\d{9}$/
const isPhoneValid = computed(() => PHONE_REGEX.test(phoneForm.phone))

// ============ 前端算术验证码（移植自参考实现） ============
const createCaptcha = () => {
  const left = Math.floor(Math.random() * 8) + 2
  const right = Math.floor(Math.random() * 8) + 2
  return { left, right, answer: left + right }
}
const captcha = ref(createCaptcha())
const refreshCaptcha = () => {
  captcha.value = createCaptcha()
  pwdForm.captcha = ''
}

// ============ redirect 安全跳转（防开放重定向） ============
const getRedirectPath = (search) => {
  const params = new URLSearchParams(search)
  const redirect = params.get('redirect')
  if (!redirect || !redirect.startsWith('/')) return '/'
  if (redirect.startsWith('//') || redirect.startsWith('/login') || redirect.startsWith('/register')) return '/'
  return redirect
}
const redirectQuery = computed(() => {
  const redirect = getRedirectPath(route.fullPath)
  return redirect && redirect !== '/' ? `?redirect=${encodeURIComponent(redirect)}` : ''
})

// ============ 记住账号 ============
const rememberUsername = ref(false)
onMounted(() => {
  const saved = localStorage.getItem('cas_remember_username')
  if (saved) {
    pwdForm.username = saved
    rememberUsername.value = true
  }
})

// ============ 账号密码登录 ============
const handlePwdLogin = async () => {
  if (!pwdForm.username || !pwdForm.password) {
    return ElMessage.warning('请填写用户名和密码')
  }
  if (Number(pwdForm.captcha) !== captcha.value.answer) {
    ElMessage.error('验证码错误')
    refreshCaptcha()
    return
  }

  loading.value = true
  try {
    await userStore.login(pwdForm.username, pwdForm.password)
    if (rememberUsername.value) {
      localStorage.setItem('cas_remember_username', pwdForm.username)
    } else {
      localStorage.removeItem('cas_remember_username')
    }
    ElMessage.success('登录成功')
    router.push(getRedirectPath(route.fullPath))
  } catch (e) {
    ElMessage.error(e.response?.data?.error || '登录失败')
    refreshCaptcha()
  } finally {
    loading.value = false
  }
}

// ============ 手机验证码登录 ============
const sendCode = async () => {
  if (!isPhoneValid.value) {
    ElMessage.warning('请输入正确的手机号')
    return
  }
  sending.value = true
  try {
    await api.post('/verification/phone', { phone: phoneForm.phone, purpose: 'login' })
    ElMessage.success('验证码已发送')
    startCountdown()
  } catch (e) {
    ElMessage.error(e.response?.data?.error || '发送失败')
  } finally {
    sending.value = false
  }
}

const startCountdown = () => {
  countdown.value = 60
  const timer = setInterval(() => {
    countdown.value--
    if (countdown.value <= 0) clearInterval(timer)
  }, 1000)
}

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
    userStore.saveTokens(res.accessToken, res.refreshToken)
    userStore.user = res.user
    localStorage.setItem('user', JSON.stringify(res.user))
    ElMessage.success('登录成功')
    router.push(getRedirectPath(route.fullPath))
  } catch (e) {
    ElMessage.error(e.response?.data?.error || '登录失败')
  } finally {
    loading.value = false
  }
}

// ============ 忘记密码（QQ邮箱验证码重置） ============
const forgotVisible = ref(false)
const forgotStep = ref(0)
const forgotSending = ref(false)
const forgotLoading = ref(false)
const forgotCountdown = ref(0)
const forgotForm = reactive({ email: '', code: '', new_password: '' })
let forgotTimer = null

const startForgotCountdown = () => {
  forgotCountdown.value = 60
  forgotTimer = setInterval(() => {
    forgotCountdown.value--
    if (forgotCountdown.value <= 0) clearInterval(forgotTimer)
  }, 1000)
}

const sendForgotCode = async () => {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(forgotForm.email)) {
    return ElMessage.warning('请输入有效的邮箱地址')
  }
  forgotSending.value = true
  try {
    await api.post('/auth/forgot-password', { email: forgotForm.email })
    ElMessage.success('验证码已发送，请查收邮件')
    startForgotCountdown()
  } catch (e) {
    ElMessage.error(e.response?.data?.error || '发送失败')
  } finally {
    forgotSending.value = false
  }
}

const doResetPassword = async () => {
  if (!/^(?=.*[A-Za-z])(?=.*\d).{6,}$/.test(forgotForm.new_password)) {
    return ElMessage.warning('新密码需至少6位且包含字母和数字')
  }
  forgotLoading.value = true
  try {
    await api.post('/auth/reset-password', forgotForm)
    ElMessage.success('密码已重置，请使用新密码登录')
    forgotVisible.value = false
    forgotStep.value = 0
  } catch (e) {
    ElMessage.error(e.response?.data?.error || '重置失败')
  } finally {
    forgotLoading.value = false
  }
}

onBeforeUnmount(() => clearInterval(forgotTimer))
</script>
