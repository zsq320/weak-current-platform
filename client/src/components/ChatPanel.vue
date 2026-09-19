<template>
  <el-card>
    <template #header>
      <div class="header-row">
        <span>工程沟通（平台留痕，可作为纠纷仲裁依据）</span>
        <el-tag size="small" type="info" v-if="peerName">对方：{{ peerName }}</el-tag>
      </div>
    </template>

    <div ref="msgBox" class="chat-box">
      <div v-for="m in messages" :key="m.id" class="chat-msg" :class="{ mine: m.from_user_id === userStore.user?.id }">
        <div class="chat-meta">{{ m.real_name || m.username }} · {{ m.created_at }}</div>
        <div class="chat-bubble">{{ m.content }}</div>
      </div>
      <el-empty v-if="messages.length === 0" description="暂无消息，发一条打个招呼吧" :image-size="60" />
    </div>

    <div class="chat-input" v-if="peerId">
      <el-input v-model="draft" type="textarea" :rows="2" placeholder="输入消息…" @keydown.enter.ctrl="send" />
      <el-button type="primary" :disabled="!draft.trim()" @click="send">发送</el-button>
    </div>
    <el-alert v-else type="info" :closable="false" title="该工程还没有中标工程师，中标后可开启双方沟通" />
  </el-card>
</template>

<script setup>
import { ref, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { ElMessage } from 'element-plus'
import { useUserStore } from '../store'
import api from '../api'

const props = defineProps({ projectId: { type: [Number, String], required: true } })
const userStore = useUserStore()

const messages = ref([])
const peerId = ref(null)
const peerName = ref('')
const draft = ref('')
const msgBox = ref(null)
let lastId = 0
let pollTimer = null

const scrollToBottom = () => {
  nextTick(() => {
    if (msgBox.value) msgBox.value.scrollTop = msgBox.value.scrollHeight
  })
}

const poll = async () => {
  try {
    const res = await api.get(`/biz/projects/${props.projectId}/chat`, { params: { after_id: lastId } })
    peerId.value = res.peer_id
    if (res.items && res.items.length > 0) {
      messages.value.push(...res.items)
      lastId = res.items[res.items.length - 1].id
      const other = res.items.find(m => m.from_user_id !== userStore.user?.id)
      if (other) peerName.value = other.real_name || other.username
      scrollToBottom()
    }
  } catch (e) { /* 轮询失败忽略 */ }
}

const send = async () => {
  if (!draft.value.trim()) return
  try {
    const res = await api.post(`/biz/projects/${props.projectId}/chat`, { content: draft.value.trim() })
    draft.value = ''
    poll()
  } catch (e) {
    ElMessage.error(e.response?.data?.error || '发送失败')
  }
}

onMounted(() => {
  poll()
  pollTimer = setInterval(poll, 4000)
})
onBeforeUnmount(() => clearInterval(pollTimer))
</script>

<style scoped>
.header-row { display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; }
.chat-box { height: 340px; overflow-y: auto; background: var(--bg-muted); border:1px solid var(--line-soft); border-radius: var(--r-md); padding: 12px; }
.chat-msg { margin-bottom: 10px; }
.chat-msg.mine { text-align: right; }
.chat-meta { font-size: 11px; color: var(--ink-400); margin-bottom: 2px; }
.chat-bubble {
  display: inline-block; background: #fff; border: 1px solid var(--line);
  border-radius: var(--r-md); padding: 7px 11px; max-width: 75%; text-align: left;
  font-size: 13px; white-space: pre-wrap; word-break: break-word; color: var(--ink-700);
}
.chat-msg.mine .chat-bubble { background: var(--brand-700); border-color: var(--brand-700); color: #fff; }
.chat-input { display: flex; gap: 8px; margin-top: 10px; align-items: flex-end; }
</style>
