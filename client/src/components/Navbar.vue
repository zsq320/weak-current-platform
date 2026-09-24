<template>
  <el-menu mode="horizontal" :router="true" class="navbar" :default-active="route.path">
    <div class="nav-brand" @click="router.push('/')">
      <span class="brand-logo"><el-icon><Connection /></el-icon></span>
      <span class="brand-name">弱电工程管理平台</span>
    </div>

    <!-- 甲方菜单 -->
    <template v-if="userStore.isLoggedIn && userStore.isClient">
      <el-menu-item index="/">首页</el-menu-item>
      <el-menu-item index="/publish">发布工程</el-menu-item>
      <el-menu-item index="/my-projects">我的工程</el-menu-item>
      <el-menu-item index="/contracts">合同管理</el-menu-item>
      <el-menu-item index="/dashboard">数据统计</el-menu-item>
    </template>

    <!-- 工程师菜单 -->
    <template v-else-if="userStore.isLoggedIn && userStore.isEngineer">
      <el-menu-item index="/">工程大厅</el-menu-item>
      <el-menu-item index="/my-bids">我的投标</el-menu-item>
      <el-menu-item index="/contracts">合同管理</el-menu-item>
      <el-menu-item index="/dashboard">数据统计</el-menu-item>
    </template>

    <!-- 管理员菜单 -->
    <template v-else-if="userStore.isLoggedIn && userStore.isAdmin">
      <el-menu-item index="/">首页</el-menu-item>
      <el-menu-item index="/admin">管理后台</el-menu-item>
    </template>

    <!-- 未登录 -->
    <template v-else>
      <el-menu-item index="/">首页</el-menu-item>
    </template>

    <div class="nav-right">
      <template v-if="userStore.isLoggedIn">
        <el-badge :value="unreadCount" :hidden="unreadCount === 0" class="msg-badge">
          <el-button :icon="Bell" circle @click="router.push('/messages')" />
        </el-badge>
        <el-dropdown @command="handleCommand">
          <span class="user-info">
            <el-avatar :size="32" :src="userStore.user?.avatar || ''" :icon="UserFilled" />
            <span class="username">{{ userStore.user?.real_name || userStore.user?.username }}</span>
            <el-tag v-if="userStore.isClient" size="small" type="primary">甲方</el-tag>
            <el-tag v-else-if="userStore.isEngineer" size="small" type="success">工程师</el-tag>
            <el-tag v-else-if="userStore.isAdmin" size="small" type="danger">管理员</el-tag>
          </span>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="wallet">我的钱包</el-dropdown-item>
              <el-dropdown-item command="profile">个人中心</el-dropdown-item>
              <el-dropdown-item v-if="!userStore.isAdmin" command="dashboard">数据统计</el-dropdown-item>
              <el-dropdown-item v-if="userStore.isAdmin" command="admin">管理后台</el-dropdown-item>
              <el-dropdown-item divided command="logout">退出登录</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </template>
      <template v-else>
        <el-button type="primary" @click="router.push('/login')">登录</el-button>
        <el-button @click="router.push('/register')">注册</el-button>
      </template>
    </div>
  </el-menu>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useUserStore } from '../store'
import { Connection, Bell, UserFilled } from '@element-plus/icons-vue'
import api from '../api'

const route = useRoute()
const router = useRouter()
const userStore = useUserStore()
const unreadCount = ref(0)

const fetchUnread = async () => {
  if (!userStore.isLoggedIn) return
  try {
    const res = await api.get('/messages', { params: { pageSize: 1, unread: 'true' } })
    unreadCount.value = res.unreadCount || 0
  } catch (e) {}
}

onMounted(fetchUnread)
watch(() => route.path, fetchUnread)

// ============ SSE 实时未读通知（后端 /api/notify/stream 每5秒推送未读数） ============
let sseSource = null
let sseRetryTimer = null

// 判断访问令牌是否已过期（解 JWT 载荷的 exp，仅用于决定是否先刷新令牌）
const isTokenExpired = (token) => {
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
    return payload.exp * 1000 < Date.now() + 5000
  } catch (err) {
    return false
  }
}

const connectSSE = () => {
  if (sseSource || !userStore.isLoggedIn) return
  const token = localStorage.getItem('accessToken')
  if (!token) return
  try {
    sseSource = new EventSource(`/api/notify/stream?token=${encodeURIComponent(token)}`)
    sseSource.addEventListener('unread', (e) => {
      try {
        const data = JSON.parse(e.data)
        unreadCount.value = data.count ?? unreadCount.value
      } catch (err) { /* 忽略 */ }
    })
    sseSource.onerror = async () => {
      // 断线后先检查令牌：过期则刷新令牌再重连，避免带着过期令牌无限重连 401
      sseSource.close()
      sseSource = null
      clearTimeout(sseRetryTimer)
      const token = localStorage.getItem('accessToken')
      if (token && isTokenExpired(token)) {
        const ok = await userStore.refreshTokens()
        if (!ok) return // 刷新失败：会话已失效，由 axios 拦截器处理登出
      }
      if (!userStore.isLoggedIn) return
      sseRetryTimer = setTimeout(connectSSE, 5000)
    }
  } catch (err) { /* 浏览器不支持则退化为路由切换时轮询 */ }
}

watch(() => userStore.isLoggedIn, (v) => {
  if (v) connectSSE()
  else if (sseSource) { sseSource.close(); sseSource = null }
})

onMounted(() => {
  if (userStore.isLoggedIn) connectSSE()
})
onBeforeUnmount(() => {
  clearTimeout(sseRetryTimer)
  if (sseSource) sseSource.close()
})

const handleCommand = (cmd) => {
  if (cmd === 'logout') {
    userStore.logout()
    router.push('/login')
  } else {
    router.push(`/${cmd}`)
  }
}
</script>

<style scoped>
.navbar { height: 58px; display: flex; align-items: center; padding: 0 22px; background: #fff; box-shadow: var(--sh-1); border-bottom: 1px solid var(--line); position: sticky; top: 0; z-index: 100; }
.nav-brand { display: flex; align-items: center; gap: 9px; font-size: 16.5px; font-weight: 700; color: var(--ink-900); cursor: pointer; margin-right: 24px; white-space: nowrap; }
.brand-logo { width: 30px; height: 30px; border-radius: 7px; background: var(--brand-700); color: #fff; display: inline-flex; align-items: center; justify-content: center; font-size: 15px; }
.brand-name { letter-spacing: .5px; }
.nav-right { margin-left: auto; display: flex; align-items: center; gap: 12px; }
.user-info { display: flex; align-items: center; gap: 8px; cursor: pointer; }
.username { font-size: 14px; color: var(--ink-700); }
.msg-badge { margin-right: 8px; }

/* 移动端适配：导航可横向滑动，隐藏次要信息 */
@media (max-width: 768px) {
  .navbar { padding: 0 10px; overflow-x: auto; scrollbar-width: none; -webkit-overflow-scrolling: touch; }
  .navbar::-webkit-scrollbar { display: none; }
  .nav-brand { font-size: 15px; margin-right: 8px; gap: 5px; flex-shrink: 0; }
  .navbar :deep(.el-menu-item) { padding: 0 10px; flex-shrink: 0; }
  .nav-right { gap: 6px; margin-left: auto; flex-shrink: 0; }
  .username { display: none; }
  .user-info .el-tag { display: none; }
  .msg-badge { margin-right: 2px; }
}
</style>

<style>
/* Navbar 菜单项统一分段样式（全局，作用于 el-menu-item） */
.navbar .el-menu-item { height: 58px; line-height: 58px; border-bottom: 2px solid transparent; color: var(--ink-700); }
.navbar .el-menu-item:hover { background: var(--brand-50); color: var(--brand-700); }
.navbar .el-menu-item.is-active { color: var(--brand-700); border-bottom-color: var(--brand-700); background: transparent; font-weight: 600; }
</style>
