<template>
  <el-menu mode="horizontal" :router="true" class="navbar" :default-active="route.path">
    <div class="nav-brand" @click="router.push('/')">
      <el-icon><Monitor /></el-icon>
      <span>弱电工程管理平台</span>
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
            <el-avatar :size="32" :icon="UserFilled" />
            <span class="username">{{ userStore.user?.real_name || userStore.user?.username }}</span>
            <el-tag v-if="userStore.isClient" size="small" type="primary">甲方</el-tag>
            <el-tag v-else-if="userStore.isEngineer" size="small" type="success">工程师</el-tag>
            <el-tag v-else-if="userStore.isAdmin" size="small" type="danger">管理员</el-tag>
          </span>
          <template #dropdown>
            <el-dropdown-menu>
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
import { ref, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useUserStore } from '../store'
import { Monitor, Bell, UserFilled } from '@element-plus/icons-vue'
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
.navbar { display: flex; align-items: center; padding: 0 20px; background: #fff; box-shadow: 0 2px 8px rgba(0,0,0,0.08); position: sticky; top: 0; z-index: 100; }
.nav-brand { display: flex; align-items: center; gap: 8px; font-size: 18px; font-weight: bold; color: #409eff; cursor: pointer; margin-right: 20px; white-space: nowrap; }
.nav-right { margin-left: auto; display: flex; align-items: center; gap: 12px; }
.user-info { display: flex; align-items: center; gap: 8px; cursor: pointer; }
.username { font-size: 14px; }
.msg-badge { margin-right: 8px; }
</style>
