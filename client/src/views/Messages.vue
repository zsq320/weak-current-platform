<template>
  <div>
    <el-card>
      <template #header>
        <div class="header-row">
          <h2>消息中心 <el-badge :value="unreadCount" :hidden="unreadCount === 0" /></h2>
          <el-button @click="markAllRead" :disabled="unreadCount === 0">全部已读</el-button>
        </div>
      </template>
      <el-table :data="messages" style="width: 100%">
        <el-table-column width="40">
          <template #default="{ row }">
            <div v-if="!row.is_read" class="unread-dot"></div>
          </template>
        </el-table-column>
        <el-table-column prop="title" label="标题" width="160" />
        <el-table-column prop="content" label="内容" min-width="300" show-overflow-tooltip />
        <el-table-column prop="type" label="类型" width="100">
          <template #default="{ row }">
            <el-tag :type="{ system: 'info', project: '', bid: 'success', contract: 'warning' }[row.type]" size="small">
              {{ { system: '系统', project: '工程', bid: '投标', contract: '合同' }[row.type] }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="created_at" label="时间" width="180" />
        <el-table-column label="操作" width="140">
          <template #default="{ row }">
            <el-button v-if="!row.is_read" type="primary" link size="small" @click="markRead(row.id)">标为已读</el-button>
            <el-button type="danger" link size="small" @click="deleteMsg(row.id)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-if="messages.length === 0" description="暂无消息" />
      <el-pagination
        v-if="total > pageSize"
        layout="prev, pager, next"
        :total="total"
        :page-size="pageSize"
        v-model:current-page="page"
        @current-change="fetchMessages"
        style="justify-content: center; margin-top: 16px"
      />
    </el-card>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import api from '../api'

const messages = ref([])
const unreadCount = ref(0)
const total = ref(0)
const page = ref(1)
const pageSize = 15

const fetchMessages = async () => {
  try {
    const res = await api.get('/messages', { params: { page: page.value, pageSize } })
    messages.value = res.data
    unreadCount.value = res.unreadCount
    total.value = res.total
  } catch (e) {
    ElMessage.error('加载消息失败')
  }
}

const markRead = async (id) => {
  await api.post(`/messages/${id}/read`)
  fetchMessages()
}

const markAllRead = async () => {
  await api.post('/messages/read-all')
  ElMessage.success('已全部标记已读')
  fetchMessages()
}

const deleteMsg = async (id) => {
  await api.delete(`/messages/${id}`)
  fetchMessages()
}

onMounted(fetchMessages)
</script>

<style scoped>
.header-row { display: flex; justify-content: space-between; align-items: center; }
h2 { margin: 0; display: flex; align-items: center; gap: 8px; }
.unread-dot { width: 8px; height: 8px; border-radius: 50%; background: #f56c6c; }
</style>
