<template>
  <div>
    <el-card>
      <template #header>
        <div class="header-row">
          <h2>消息中心 <el-badge :value="unreadCount" :hidden="unreadCount === 0" /></h2>
          <el-button @click="markAllRead" :disabled="unreadCount === 0">全部已读</el-button>
        </div>
      </template>
      <el-table :data="messages" style="width: 100%" @row-click="goRef">
        <el-table-column width="40">
          <template #default="{ row }">
            <div v-if="!row.is_read" class="unread-dot"></div>
          </template>
        </el-table-column>
        <el-table-column prop="title" label="标题" width="160">
          <template #default="{ row }">
            <el-link v-if="refTarget(row)" type="primary" :underline="false">{{ row.title }}</el-link>
            <span v-else>{{ row.title }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="content" label="内容" min-width="300" show-overflow-tooltip />
        <el-table-column prop="type" label="类型" width="100">
          <template #default="{ row }">
            <el-tag :type="{ system: 'info', project: '', bid: 'success', contract: 'warning' }[row.type]" size="small">
              {{ { system: '系统', project: '工程', bid: '投标', contract: '合同' }[row.type] }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="created_at" label="时间" width="180" />
        <el-table-column label="操作" width="200">
          <template #default="{ row }">
            <el-button v-if="!row.is_read" type="primary" link size="small" @click.stop="markRead(row.id)">标为已读</el-button>
            <el-button v-if="row.from_user_id" type="success" link size="small" @click.stop="openReply(row)">回复</el-button>
            <el-button type="danger" link size="small" @click.stop="deleteMsg(row.id)">删除</el-button>
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

    <!-- 回复私信对话框 -->
    <el-dialog v-model="replyVisible" :title="`回复：${replyTo?.from_username || ''}`" width="460px">
      <el-form label-position="top">
        <el-form-item label="标题">
          <el-input v-model="replyForm.title" placeholder="可选" maxlength="100" />
        </el-form-item>
        <el-form-item label="内容" required>
          <el-input v-model="replyForm.content" type="textarea" :rows="4" maxlength="2000" show-word-limit />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="replyVisible = false">取消</el-button>
        <el-button type="primary" :loading="sending" @click="sendReply">发送</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import api from '../api'

const router = useRouter()
const messages = ref([])
const unreadCount = ref(0)
const total = ref(0)
const page = ref(1)
const pageSize = 15

const replyVisible = ref(false)
const replyTo = ref(null)
const sending = ref(false)
const replyForm = ref({ title: '', content: '' })

// 消息关联对象：点击跳转到对应工程/合同
const refTarget = (row) => {
  if (row.ref_type === 'project' && row.ref_id) return { path: `/project/${row.ref_id}` }
  if (row.ref_type === 'contract' && row.ref_id) return { path: `/contracts`, query: { focus: row.ref_id } }
  return null
}

const goRef = (row) => {
  const target = refTarget(row)
  if (target) router.push(target)
}

const openReply = (row) => {
  replyTo.value = row
  replyForm.value = { title: row.title?.startsWith('回复') ? row.title : `回复：${row.title || ''}`, content: '' }
  replyVisible.value = true
}

const sendReply = async () => {
  if (!replyForm.value.content.trim()) return ElMessage.warning('请填写消息内容')
  sending.value = true
  try {
    await api.post('/messages', { to_user_id: replyTo.value.from_user_id, ...replyForm.value })
    ElMessage.success('回复已发送')
    replyVisible.value = false
  } catch (e) {
    ElMessage.error(e.response?.data?.error || '发送失败')
  } finally {
    sending.value = false
  }
}

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
.unread-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--danger-600); }
</style>
