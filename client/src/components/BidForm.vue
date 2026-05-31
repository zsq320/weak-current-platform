<template>
  <el-dialog
    v-model="visible"
    title="提交投标"
    width="700px"
    :close-on-click-modal="false"
    @close="handleClose"
  >
    <!-- 步骤条 -->
    <el-steps :active="currentStep" finish-status="success" align-center style="margin-bottom: 30px">
      <el-step title="基本信息" description="报价与工期" />
      <el-step title="资质证明" description="上传资质材料" />
      <el-step title="方案说明" description="详细方案描述" />
      <el-step title="确认提交" description="核对并提交" />
    </el-steps>

    <!-- 步骤1: 基本信息 -->
    <div v-show="currentStep === 0" class="step-content">
      <el-form :model="form" :rules="rules" ref="formRef" label-position="top">
        <el-form-item label="报价金额（元）" prop="price">
          <el-input-number
            v-model="form.price"
            :min="1"
            :max="99999999"
            :precision="2"
            :step="1000"
            style="width: 100%"
            placeholder="请输入您的报价"
          />
          <div class="form-tip" v-if="projectBudget">
            项目预算：<span class="highlight">¥{{ projectBudget?.toLocaleString() }}</span>
          </div>
        </el-form-item>

        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="预计工期" prop="duration">
              <el-input-number
                v-model="form.duration"
                :min="1"
                :max="9999"
                style="width: 100%"
                placeholder="工期数值"
              />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="工期单位" prop="duration_unit">
              <el-select v-model="form.duration_unit" style="width: 100%">
                <el-option label="天" value="days" />
                <el-option label="周" value="weeks" />
                <el-option label="月" value="months" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>

        <el-form-item label="相关工作经验（年）" prop="experience_years">
          <el-slider
            v-model="form.experience_years"
            :min="0"
            :max="30"
            :marks="{ 0: '0', 5: '5年', 10: '10年', 20: '20年', 30: '30年+' }"
            show-input
          />
        </el-form-item>
      </el-form>
    </div>

    <!-- 步骤2: 资质证明 -->
    <div v-show="currentStep === 1" class="step-content">
      <el-form :model="form" label-position="top">
        <el-form-item label="资质证明材料">
          <el-upload
            class="qualification-upload"
            drag
            :auto-upload="false"
            :limit="5"
            accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
            :on-change="handleFileChange"
            :file-list="fileList"
          >
            <el-icon class="el-icon--upload"><upload-filled /></el-icon>
            <div class="el-upload__text">
              拖拽文件到此处，或 <em>点击上传</em>
            </div>
            <template #tip>
              <div class="el-upload__tip">
                支持 PDF、图片、Word 文档，单个文件不超过 10MB，最多 5 个文件
              </div>
            </template>
          </el-upload>
        </el-form-item>

        <el-alert
          title="资质证明提示"
          type="info"
          :closable="false"
          show-icon
          style="margin-top: 16px"
        >
          <template #default>
            <ul style="margin: 8px 0 0; padding-left: 20px; font-size: 12px;">
              <li>营业执照、资质证书等</li>
              <li>相关项目经验证明</li>
              <li>专业技术人员证书</li>
              <li>其他能证明能力的材料</li>
            </ul>
          </template>
        </el-alert>
      </el-form>
    </div>

    <!-- 步骤3: 方案说明 -->
    <div v-show="currentStep === 2" class="step-content">
      <el-form :model="form" :rules="rules" ref="formRef2" label-position="top">
        <el-form-item label="项目理解与方案概述" prop="message">
          <el-input
            v-model="form.message"
            type="textarea"
            :rows="6"
            placeholder="请详细描述您对项目的理解、实施计划、技术方案、质量保证措施等"
            :maxlength="2000"
            show-word-limit
          />
        </el-form-item>

        <el-form-item label="您的优势">
          <el-input
            v-model="form.advantages"
            type="textarea"
            :rows="4"
            placeholder="请描述您的团队优势、技术优势、成本优势等"
            :maxlength="1000"
            show-word-limit
          />
        </el-form-item>

        <el-form-item label="风险与应对">
          <el-input
            v-model="form.risks"
            type="textarea"
            :rows="3"
            placeholder="可选：描述可能的风险及应对措施"
            :maxlength="500"
            show-word-limit
          />
        </el-form-item>
      </el-form>
    </div>

    <!-- 步骤4: 确认提交 -->
    <div v-show="currentStep === 3" class="step-content">
      <el-descriptions title="投标信息确认" :column="2" border>
        <el-descriptions-item label="报价金额">
          <span class="price-highlight">¥{{ form.price?.toLocaleString() }}</span>
        </el-descriptions-item>
        <el-descriptions-item label="预计工期">
          {{ form.duration }} {{ durationText }}
        </el-descriptions-item>
        <el-descriptions-item label="工作经验">
          {{ form.experience_years }} 年
        </el-descriptions-item>
        <el-descriptions-item label="资质材料">
          {{ fileList.length }} 个文件
        </el-descriptions-item>
        <el-descriptions-item label="方案概述" :span="2">
          {{ form.message || '未填写' }}
        </el-descriptions-item>
      </el-descriptions>

      <el-checkbox v-model="agreed" style="margin-top: 20px">
        我已阅读并同意投标协议，保证所提交信息真实有效
      </el-checkbox>
    </div>

    <!-- 底部按钮 -->
    <template #footer>
      <div class="dialog-footer">
        <el-button @click="currentStep--" v-if="currentStep > 0" :disabled="loading">
          上一步
        </el-button>
        <el-button type="primary" @click="handleNext" :loading="loading">
          {{ currentStep === 3 ? '提交投标' : '下一步' }}
        </el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { UploadFilled } from '@element-plus/icons-vue'
import api from '../api'

const props = defineProps({
  modelValue: Boolean,
  projectId: Number,
  projectBudget: Number
})

const emit = defineEmits(['update:modelValue', 'success'])

const visible = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val)
})

const currentStep = ref(0)
const loading = ref(false)
const agreed = ref(false)
const fileList = ref([])

const form = ref({
  price: null,
  duration: null,
  duration_unit: 'days',
  experience_years: 3,
  message: '',
  advantages: '',
  risks: '',
  qualifications: ''
})

const rules = {
  price: [
    { required: true, message: '请输入报价金额', trigger: 'blur' },
    { type: 'number', min: 1, message: '报价必须大于0', trigger: 'blur' }
  ],
  duration: [
    { required: true, message: '请输入预计工期', trigger: 'blur' }
  ],
  message: [
    { required: true, message: '请填写方案概述', trigger: 'blur' },
    { min: 20, message: '方案概述至少20个字符', trigger: 'blur' }
  ]
}

const durationText = computed(() => ({
  days: '天',
  weeks: '周',
  months: '月'
}[form.value.duration_unit] || '天'))

const formRef = ref(null)
const formRef2 = ref(null)

// 步骤验证
const validateStep = async (step) => {
  if (step === 0) {
    if (!form.value.price) {
      ElMessage.warning('请输入报价金额')
      return false
    }
    if (!form.value.duration) {
      ElMessage.warning('请输入预计工期')
      return false
    }
    return true
  }
  if (step === 2) {
    if (!form.value.message || form.value.message.length < 20) {
      ElMessage.warning('方案概述至少20个字符')
      return false
    }
    return true
  }
  return true
}

// 下一步
const handleNext = async () => {
  if (currentStep.value === 3) {
    await submitBid()
    return
  }

  const valid = await validateStep(currentStep.value)
  if (valid) {
    currentStep.value++
  }
}

// 处理文件变化
const handleFileChange = (file, files) => {
  fileList.value = files
}

// 提交投标
const submitBid = async () => {
  if (!agreed.value) {
    ElMessage.warning('请先同意投标协议')
    return
  }

  loading.value = true
  try {
    const submitData = {
      project_id: props.projectId,
      price: form.value.price,
      duration: form.value.duration,
      duration_unit: form.value.duration_unit,
      experience_years: form.value.experience_years,
      message: [form.value.message, form.value.advantages, form.value.risks]
        .filter(Boolean)
        .join('\n\n'),
      qualifications: fileList.value.map(f => f.name).join(',')
    }

    await api.post('/bids', submitData)
    ElMessage.success('投标提交成功！')
    emit('success')
    handleClose()
  } catch (err) {
    ElMessage.error(err.response?.data?.error || '提交失败')
  } finally {
    loading.value = false
  }
}

// 关闭处理
const handleClose = () => {
  currentStep.value = 0
  agreed.value = false
  fileList.value = []
  form.value = {
    price: null,
    duration: null,
    duration_unit: 'days',
    experience_years: 3,
    message: '',
    advantages: '',
    risks: '',
    qualifications: ''
  }
  visible.value = false
}

// 重置表单
watch(visible, (val) => {
  if (val) {
    form.value.price = props.projectBudget ? Math.round(props.projectBudget * 0.9) : null
  }
})
</script>

<style scoped>
.step-content {
  min-height: 300px;
  padding: 20px 0;
}

.form-tip {
  font-size: 12px;
  color: #909399;
  margin-top: 8px;
}

.form-tip .highlight {
  color: #f56c6c;
  font-weight: bold;
}

.price-highlight {
  font-size: 24px;
  font-weight: bold;
  color: #f56c6c;
}

.qualification-upload {
  width: 100%;
}

.qualification-upload :deep(.el-upload-dragger) {
  width: 100%;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}
</style>
