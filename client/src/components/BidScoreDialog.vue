<template>
  <el-dialog
    v-model="visible"
    title="投标评分"
    width="600px"
    :close-on-click-modal="false"
  >
    <div v-if="bid" class="score-content">
      <!-- 投标人信息 -->
      <el-descriptions :column="2" border size="small" style="margin-bottom: 20px">
        <el-descriptions-item label="工程师">{{ bid.real_name || bid.username }}</el-descriptions-item>
        <el-descriptions-item label="报价">
          <span class="price">¥{{ bid.price?.toLocaleString() }}</span>
        </el-descriptions-item>
        <el-descriptions-item label="工期">
          {{ bid.duration }} {{ durationText }}
        </el-descriptions-item>
        <el-descriptions-item label="经验">{{ bid.experience_years }} 年</el-descriptions-item>
      </el-descriptions>

      <!-- 评分表单 -->
      <el-form :model="form" label-position="left" label-width="100px">
        <!-- 价格评分 -->
        <el-form-item label="价格评分">
          <div class="score-row">
            <el-slider
              v-model="form.price_score"
              :max="25"
              show-stops
              :marks="{ 0: '0', 13: '中', 25: '优' }"
              style="flex: 1; margin-right: 16px"
            />
            <span class="score-value">{{ form.price_score }}/25</span>
          </div>
          <el-input
            v-model="form.price_comment"
            placeholder="价格评语（可选）"
            size="small"
            style="margin-top: 8px"
          />
        </el-form-item>

        <!-- 工期评分 -->
        <el-form-item label="工期评分">
          <div class="score-row">
            <el-slider
              v-model="form.duration_score"
              :max="25"
              show-stops
              :marks="{ 0: '0', 13: '中', 25: '优' }"
              style="flex: 1; margin-right: 16px"
            />
            <span class="score-value">{{ form.duration_score }}/25</span>
          </div>
          <el-input
            v-model="form.duration_comment"
            placeholder="工期评语（可选）"
            size="small"
            style="margin-top: 8px"
          />
        </el-form-item>

        <!-- 资质评分 -->
        <el-form-item label="资质评分">
          <div class="score-row">
            <el-slider
              v-model="form.qualification_score"
              :max="25"
              show-stops
              :marks="{ 0: '0', 13: '中', 25: '优' }"
              style="flex: 1; margin-right: 16px"
            />
            <span class="score-value">{{ form.qualification_score }}/25</span>
          </div>
          <el-input
            v-model="form.qualification_comment"
            placeholder="资质评语（可选）"
            size="small"
            style="margin-top: 8px"
          />
        </el-form-item>

        <!-- 技术评分 -->
        <el-form-item label="技术评分">
          <div class="score-row">
            <el-slider
              v-model="form.technical_score"
              :max="25"
              show-stops
              :marks="{ 0: '0', 13: '中', 25: '优' }"
              style="flex: 1; margin-right: 16px"
            />
            <span class="score-value">{{ form.technical_score }}/25</span>
          </div>
          <el-input
            v-model="form.technical_comment"
            placeholder="技术评语（可选）"
            size="small"
            style="margin-top: 8px"
          />
        </el-form-item>
      </el-form>

      <!-- 总分显示 -->
      <div class="total-score">
        <span>总分：</span>
        <span class="score-number" :class="scoreClass">{{ totalScore }}</span>
        <span>/ 100</span>
      </div>
    </div>

    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button type="primary" @click="handleSubmit" :loading="loading">提交评分</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, computed } from 'vue'
import { ElMessage } from 'element-plus'
import api from '../api'

const props = defineProps({
  modelValue: Boolean,
  bid: Object,
  projectId: Number
})

const emit = defineEmits(['update:modelValue', 'success'])

const visible = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val)
})

const loading = ref(false)

const form = ref({
  price_score: 0,
  duration_score: 0,
  qualification_score: 0,
  technical_score: 0,
  price_comment: '',
  duration_comment: '',
  qualification_comment: '',
  technical_comment: ''
})

const totalScore = computed(() => {
  return form.value.price_score +
    form.value.duration_score +
    form.value.qualification_score +
    form.value.technical_score
})

const scoreClass = computed(() => {
  const score = totalScore.value
  if (score >= 80) return 'excellent'
  if (score >= 60) return 'good'
  if (score >= 40) return 'average'
  return 'poor'
})

const durationText = computed(() => {
  const unit = { days: '天', weeks: '周', months: '月' }
  return unit[props.bid?.duration_unit] || '天'
})

// 提交评分
const handleSubmit = async () => {
  loading.value = true
  try {
    await api.post(`/bids/${props.bid.id}/score`, form.value)
    ElMessage.success('评分提交成功')
    emit('success')
    visible.value = false
  } catch (err) {
    ElMessage.error(err.response?.data?.error || '评分失败')
  } finally {
    loading.value = false
  }
}

// 重置表单
const resetForm = () => {
  form.value = {
    price_score: 0,
    duration_score: 0,
    qualification_score: 0,
    technical_score: 0,
    price_comment: '',
    duration_comment: '',
    qualification_comment: '',
    technical_comment: ''
  }
}

// 监听弹窗打开
import { watch } from 'vue'
watch(visible, (val) => {
  if (val && props.bid) {
    // 如果已有评分，填充表单
    if (props.bid.price_score !== undefined) {
      form.value = {
        price_score: props.bid.price_score || 0,
        duration_score: props.bid.duration_score || 0,
        qualification_score: props.bid.qualification_score || 0,
        technical_score: props.bid.technical_score || 0,
        price_comment: props.bid.price_comment || '',
        duration_comment: props.bid.duration_comment || '',
        qualification_comment: props.bid.qualification_comment || '',
        technical_comment: props.bid.technical_comment || ''
      }
    } else {
      resetForm()
    }
  }
})
</script>

<style scoped>
.score-content {
  padding: 10px 0;
}

.score-row {
  display: flex;
  align-items: center;
}

.score-value {
  font-size: 16px;
  font-weight: bold;
  color: #409eff;
  min-width: 50px;
  text-align: right;
}

.price {
  color: #f56c6c;
  font-weight: bold;
}

.total-score {
  text-align: center;
  padding: 20px;
  background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%);
  border-radius: 8px;
  margin-top: 20px;
}

.total-score span {
  font-size: 16px;
  color: #606266;
}

.score-number {
  font-size: 36px !important;
  font-weight: bold;
  margin: 0 8px;
}

.score-number.excellent { color: #67c23a; }
.score-number.good { color: #409eff; }
.score-number.average { color: #e6a23c; }
.score-number.poor { color: #f56c6c; }
</style>
