<template>
  <div class="publish-page">
    <el-card>
      <template #header><h2>发布工程</h2></template>
      <el-form :model="form" :rules="rules" ref="formRef" label-width="100px">
        <el-form-item label="工程标题" prop="title">
          <el-input v-model="form.title" placeholder="请输入工程标题" />
        </el-form-item>
        <el-form-item label="工程分类" prop="category">
          <el-select v-model="form.category" placeholder="请选择分类">
            <el-option v-for="c in categories" :key="c" :label="c" :value="c" />
          </el-select>
        </el-form-item>
        <el-form-item label="工程描述" prop="description">
          <el-input v-model="form.description" type="textarea" :rows="5" placeholder="请详细描述工程需求..." />
        </el-form-item>
        <el-form-item label="工程地点">
          <el-input v-model="form.location" placeholder="请输入工程地点" />
        </el-form-item>
        <el-form-item label="预算金额">
          <el-input-number v-model="form.budget" :min="0" :max="99999999" :step="1000" style="width: 100%" />
          <span style="margin-left: 8px; color: var(--ink-400)">元</span>
        </el-form-item>
        <el-form-item label="截止日期">
          <el-date-picker v-model="form.deadline" type="date" placeholder="选择截止日期" value-format="YYYY-MM-DD" />
        </el-form-item>
        <el-form-item label="现场定位">
          <el-space wrap>
            <el-input-number v-model="form.site_lat" :min="-90" :max="90" :precision="6" :controls="false" placeholder="纬度" style="width: 130px" />
            <el-input-number v-model="form.site_lng" :min="-180" :max="180" :precision="6" :controls="false" placeholder="经度" style="width: 130px" />
            <el-input-number v-model="form.site_radius" :min="20" :max="5000" :step="50" placeholder="围栏半径(米)" style="width: 140px" />
          </el-space>
          <div style="width: 100%; color: var(--ink-400); font-size: 12px; margin-top: 2px">
            选填。配置后工程师现场打卡将校验 GPS 距离，防止远程代打卡（地图上右键可查坐标）
          </div>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="handleSubmit" :loading="loading">发布工程</el-button>
          <el-button @click="router.back()">取消</el-button>
        </el-form-item>
      </el-form>
    </el-card>
  </div>
</template>

<script setup>
import { ref, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { useUserStore } from '../store'
import { ElMessage, ElMessageBox } from 'element-plus'
import { checkVerificationWithPrompt } from '../utils/verification'
import { CATEGORIES } from '../constants'
import api from '../api'

const router = useRouter()
const userStore = useUserStore()
const formRef = ref()
const loading = ref(false)
const categories = CATEGORIES

const form = reactive({ title: '', category: '', description: '', location: '', budget: 0, deadline: '' ,
  site_lat: undefined,
  site_lng: undefined,
  site_radius: undefined
})
const rules = {
  title: [{ required: true, message: '请输入工程标题', trigger: 'blur' }],
  category: [{ required: true, message: '请选择分类', trigger: 'change' }]
}

const handleSubmit = async () => {
  // 检查实名认证状态
  const verified = await checkVerificationWithPrompt(userStore.user, router, { action: '发布工程' })
  if (!verified) return

  await formRef.value.validate()
  loading.value = true
  try {
    const { site_lat, site_lng, site_radius, ...projectData } = form
    const res = await api.post('/projects', projectData)
    // 电子围栏坐标通过更新接口设置（后端单独校验）
    if (site_lat != null && site_lng != null) {
      try {
        await api.put(`/projects/${res.id}`, { site_lat, site_lng, site_radius })
      } catch (e) { /* 坐标无效不阻塞发布 */ }
    }
    ElMessage.success('发布成功')
    router.push(`/project/${res.id}`)
  } catch (e) {} finally { loading.value = false }
}
</script>

<style scoped>
.publish-page { max-width: 700px; margin: 0 auto; }
@media (max-width: 768px) { .publish-page { padding: 0 4px; } }
h2 { margin: 0; }
</style>
