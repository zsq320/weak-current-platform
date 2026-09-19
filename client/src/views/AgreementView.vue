<template>
  <div>
    <el-card>
      <template #header>
        <h2 style="margin: 0">{{ type === 'privacy' ? '隐私政策' : '用户服务协议' }} <el-tag size="small" type="info">V1.0</el-tag></h2>
      </template>
      <div class="legal-content">
        <pre>{{ content }}</pre>
      </div>
      <div style="text-align: center; margin-top: 20px">
        <el-button type="primary" @click="accept">我已阅读并同意</el-button>
      </div>
    </el-card>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import api from '../api'

const route = useRoute()
const router = useRouter()
const type = route.params.type === 'privacy' ? 'privacy' : 'user_agreement'
const content = ref('加载中...')

const fetchDoc = async () => {
  try {
    const res = await api.get(`/biz/agreements/${type}`)
    content.value = res.content
  } catch (e) {
    content.value = '文档加载失败'
  }
}

const accept = async () => {
  try {
    await api.post(`/biz/agreements/${type}/accept`)
    ElMessage.success('已记录签署')
    router.back()
  } catch (e) {
    router.back()
  }
}

onMounted(fetchDoc)
</script>

<style scoped>
.legal-content { line-height: 1.9; color: var(--ink-700); max-width: 860px; }
.legal-content pre { white-space: pre-wrap; font-family: inherit; font-size: 14px; }
</style>
