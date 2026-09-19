<template>
  <main class="auth-page auth-page-register"><img class="auth-bg" src="/assets/auth-bg-weakcurrent.svg" alt="" />
    <div class="auth-mask" />

    <section class="auth-card">
      <div class="auth-card-main">
        <div class="auth-logo">
          <span class="logo-mark">▦</span>
          <span class="logo-text">弱电工程管理平台</span>
        </div>
        <h1>创建账号</h1>
        <p class="auth-subtitle">选择身份，加入工程协同平台</p>
      </div>

      <el-form class="cas-auth-form" :model="form" @submit.prevent="handleRegister" label-position="top">
        <div class="form-group">账号信息</div>

        <el-form-item label="用户名" required>
          <el-input v-model="form.username" placeholder="4-20位字母、数字或下划线" :prefix-icon="User" size="large" />
        </el-form-item>

        <el-row :gutter="14">
          <el-col :xs="24" :sm="12">
            <el-form-item label="密码" required>
              <el-input v-model="form.password" type="password" placeholder="至少6位，含字母和数字" show-password :prefix-icon="Lock" size="large" />
            </el-form-item>
          </el-col>
          <el-col :xs="24" :sm="12">
            <el-form-item label="确认密码" required>
              <el-input v-model="form.confirmPassword" type="password" placeholder="再次输入密码" show-password :prefix-icon="Lock" size="large" />
            </el-form-item>
          </el-col>
        </el-row>

        <el-form-item label="选择身份" required>
          <div class="role-cards">
            <div class="role-card" :class="{ on: form.role === 'user' }" @click="form.role = 'user'">
              <span class="rc-icon"><el-icon><OfficeBuilding /></el-icon></span>
              <div class="rc-text">
                <div class="rc-t">甲方 / 发包方</div>
                <div class="rc-d">发布工程、在线签约、验收结算</div>
              </div>
              <span class="rc-check"><el-icon><Check /></el-icon></span>
            </div>
            <div class="role-card" :class="{ on: form.role === 'engineer' }" @click="form.role = 'engineer'">
              <span class="rc-icon"><el-icon><Tools /></el-icon></span>
              <div class="rc-text">
                <div class="rc-t">工程师 / 承包方</div>
                <div class="rc-d">投标接活、施工留痕、按时回款</div>
              </div>
              <span class="rc-check"><el-icon><Check /></el-icon></span>
            </div>
          </div>
        </el-form-item>

        <el-form-item label="真实姓名">
          <el-input v-model="form.real_name" placeholder="请输入真实姓名" :prefix-icon="Postcard" size="large" />
        </el-form-item>

        <div class="form-group">安全验证</div>

        <el-form-item label="手机号" required>
          <div class="code-row">
            <el-input v-model="form.phone" placeholder="请输入手机号" :prefix-icon="Iphone" size="large" />
            <el-button
              class="code-btn"
              :disabled="phoneCountdown > 0 || !isPhoneValid"
              :loading="phoneSending"
              size="large"
              @click="sendPhoneCode"
            >
              {{ phoneCountdown > 0 ? `${phoneCountdown}s` : '获取验证码' }}
            </el-button>
          </div>
        </el-form-item>

        <el-form-item v-if="channels.sms" label="手机验证码" required>
          <el-input v-model="form.phone_code" placeholder="请输入6位验证码" maxlength="6" :prefix-icon="Key" size="large" />
        </el-form-item>
        <el-alert v-else type="info" :closable="false" style="margin-bottom: 12px"
          title="短信通道未开通：注册将通过邮箱验证码完成，手机号暂不验证（可后续补充）" />

        <el-form-item label="邮箱" required>
          <div class="code-row">
            <el-input v-model="form.email" placeholder="请输入邮箱" :prefix-icon="Message" size="large" />
            <el-button
              class="code-btn"
              :disabled="emailCountdown > 0 || !isEmailValid"
              :loading="emailSending"
              size="large"
              @click="sendEmailCode"
            >
              {{ emailCountdown > 0 ? `${emailCountdown}s` : '获取验证码' }}
            </el-button>
          </div>
        </el-form-item>

        <el-form-item label="邮箱验证码" required>
          <el-input v-model="form.email_code" placeholder="请输入6位验证码" maxlength="6" :prefix-icon="Key" size="large" />
        </el-form-item>

        <el-form-item>
          <el-checkbox v-model="form.accept_agreement">
            我已阅读并同意
            <router-link to="/agreement/user_agreement" target="_blank">《用户服务协议》</router-link>和
            <router-link to="/agreement/privacy" target="_blank">《隐私政策》</router-link>
          </el-checkbox>
        </el-form-item>

        <el-button type="primary" native-type="submit" :loading="loading" size="large" class="auth-submit">
          注 册
        </el-button>
      </el-form>

      <div class="auth-foot">
        <span></span>
        <span class="foot-sep">已有账号？<router-link to="/login" class="foot-link">立即登录</router-link></span>
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
  </main>
</template>

<script setup>
import { reactive, ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useUserStore } from '../store'
import { ElMessage } from 'element-plus'
import { User, Lock, Iphone, Message, Key, Postcard, OfficeBuilding, Tools, Check, Connection } from '@element-plus/icons-vue'
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
  email_code: '',
  accept_agreement: false
})

const PHONE_REGEX = /^1[3-9]\d{9}$/

// 验证渠道探测：短信网关是否配置
const channels = ref({ sms: true, email: true })
api.get('/verification/channels').then(res => { channels.value = res }).catch(() => {})
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
  if (channels.sms && !form.phone_code) {
    return ElMessage.warning('请输入手机验证码')
  }
  if (!isEmailValid.value) {
    return ElMessage.warning('请输入正确的邮箱')
  }
  if (!form.email_code) {
    return ElMessage.warning('请输入邮箱验证码')
  }
  if (!form.accept_agreement) {
    return ElMessage.warning('请阅读并勾选同意《用户服务协议》和《隐私政策》')
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
/* 分组小标题：克制的灰字 + 上下分隔，不用彩色底条 */
.form-group{
  font-size:13px; font-weight:600; color:var(--ink-500); letter-spacing:1px;
  margin:6px 0 14px; padding-top:16px; border-top:1px solid var(--line-soft);
  position:relative;
}
.form-group:first-child{ border-top:none; padding-top:0; margin-top:0; }

/* 身份选择卡：去 emoji，线性图标 + 选中对勾 */
.role-cards{ display:flex; gap:12px; width:100%; }
.role-card{
  flex:1; display:flex; align-items:center; gap:12px; text-align:left;
  border:1.5px solid var(--line); border-radius:var(--r-lg);
  padding:13px 14px; cursor:pointer; transition:border-color .15s,background .15s;
  background:#fff; position:relative;
}
.role-card:hover{ border-color:var(--brand-300); }
.role-card.on{ border-color:var(--brand-700); background:var(--brand-50); }
.rc-icon{
  width:40px; height:40px; flex:none; border-radius:8px;
  display:inline-flex; align-items:center; justify-content:center; font-size:20px;
  background:var(--bg-muted); color:var(--ink-400);
}
.role-card.on .rc-icon{ background:var(--brand-100); color:var(--brand-700); }
.rc-text{ min-width:0; }
.rc-t{ font-weight:600; color:var(--ink-900); font-size:14px; }
.rc-d{ font-size:12px; color:var(--ink-500); margin-top:2px; line-height:1.4; }
.rc-check{
  position:absolute; top:8px; right:9px; font-size:13px;
  color:var(--brand-700); opacity:0; transition:opacity .15s;
}
.role-card.on .rc-check{ opacity:1; }

.auth-submit{ width:100%; margin-top:6px; letter-spacing:4px; font-weight:600; }
.code-row{ display:flex; gap:10px; width:100%; }
.code-row .el-input{ flex:1; }
.code-btn{ flex:none; width:128px; padding-left:8px; padding-right:8px; }

.auth-foot{
  display:flex; align-items:center; justify-content:space-between;
  margin-top:14px; font-size:13px;
}
.foot-sep{ color:var(--ink-400); }
.foot-link{ color:var(--brand-700); text-decoration:none; font-weight:500; }
.foot-link:hover{ color:var(--brand-800); }

.auth-copy{
  position:relative; z-index:2; margin-top:24px;
  color:rgba(255,255,255,.55); font-size:12.5px; letter-spacing:.5px; text-align:center;
}

@media (max-width:600px){
  .auth-shell{ padding:30px 12px; }
  .auth-card{ padding:24px 18px 20px; }
  .auth-topbar{ left:18px; top:16px; }
  .role-cards{ flex-direction:column; }
  .code-btn{ width:108px; }
}

</style>
