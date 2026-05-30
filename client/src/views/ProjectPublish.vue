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
          <span style="margin-left: 8px; color: #909399">元</span>
        </el-form-item>
        <el-form-item label="截止日期">
          <el-date-picker v-model="form.deadline" type="date" placeholder="选择截止日期" value-format="YYYY-MM-DD" />
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
import { ElMessage } from 'element-plus'
import api from '../api'

const router = useRouter()
const formRef = ref()
const loading = ref(false)
const categories = ['安防监控', '网络布线', '门禁系统', '楼宇对讲', '停车场系统', '广播系统', '综合布线', '其他']

const form = reactive({ title: '', category: '', description: '', location: '', budget: 0, deadline: '' })
const rules = {
  title: [{ required: true, message: '请输入工程标题', trigger: 'blur' }],
  category: [{ required: true, message: '请选择分类', trigger: 'change' }]
}

const handleSubmit = async () => {
  await formRef.value.validate()
  loading.value = true
  try {
    const res = await api.post('/projects', form)
    ElMessage.success('发布成功')
    router.push(`/project/${res.id}`)
  } catch (e) {} finally { loading.value = false }
}
</script>

<style scoped>
.publish-page { max-width: 700px; margin: 0 auto; }
h2 { margin: 0; }
</style>
