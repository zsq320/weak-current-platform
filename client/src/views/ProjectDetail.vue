<template>
  <div class="project-detail" v-if="project">
    <el-page-header @back="router.back()">
      <template #content>
        <span class="page-title">{{ project.title }}</span>
      </template>
    </el-page-header>

    <el-row :gutter="24" style="margin-top: 20px">
      <el-col :span="16">
        <el-card>
          <template #header>
            <div class="card-header-row">
              <span>工程详情</span>
              <div>
                <el-tag :type="statusType" style="margin-right: 8px">{{ statusText }}</el-tag>
                <el-tag type="info">{{ project.category }}</el-tag>
              </div>
            </div>
          </template>
          <el-descriptions :column="2" border>
            <el-descriptions-item label="发布者">{{ project.publisher_name || project.publisher }}</el-descriptions-item>
            <el-descriptions-item label="联系电话">{{ project.publisher_phone || '未填写' }}</el-descriptions-item>
            <el-descriptions-item label="工程地点">{{ project.location || '未填写' }}</el-descriptions-item>
            <el-descriptions-item label="截止日期">{{ project.deadline || '未设置' }}</el-descriptions-item>
            <el-descriptions-item label="预算金额">
              <span style="color: #f56c6c; font-weight: bold; font-size: 18px">¥{{ project.budget?.toLocaleString() || '面议' }}</span>
            </el-descriptions-item>
            <el-descriptions-item label="发布时间">{{ project.created_at }}</el-descriptions-item>
          </el-descriptions>
          <div class="description">
            <h4>工程描述</h4>
            <p>{{ project.description || '暂无描述' }}</p>
          </div>
        </el-card>

        <!-- 投标列表 -->
        <el-card style="margin-top: 16px" v-if="isOwner || bids.length > 0">
          <template #header><span>投标列表 ({{ bids.length }})</span></template>
          <el-table :data="bids" style="width: 100%">
            <el-table-column prop="engineer_name" label="工程师" width="120" />
            <el-table-column prop="engineer_real_name" label="真实姓名" width="120" />
            <el-table-column prop="price" label="报价" width="120">
              <template #default="{ row }">
                <span style="color: #f56c6c; font-weight: bold">¥{{ row.price?.toLocaleString() }}</span>
              </template>
            </el-table-column>
            <el-table-column prop="message" label="投标说明" />
            <el-table-column prop="status" label="状态" width="100">
              <template #default="{ row }">
                <el-tag :type="row.status === 'accepted' ? 'success' : row.status === 'rejected' ? 'danger' : 'warning'">
                  {{ { pending: '待定', accepted: '已中标', rejected: '已拒绝' }[row.status] }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="160" v-if="isOwner && project.status === 'bidding'">
              <template #default="{ row }">
                <template v-if="row.status === 'pending'">
                  <el-button type="success" size="small" @click="acceptBid(row.id)">接受</el-button>
                  <el-button type="danger" size="small" @click="rejectBid(row.id)">拒绝</el-button>
                </template>
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-col>

      <el-col :span="8">
        <!-- 投标表单 -->
        <el-card v-if="canBid">
          <template #header><span>我要投标</span></template>
          <el-form :model="bidForm" label-position="top">
            <el-form-item label="报价金额 (元)">
              <el-input-number v-model="bidForm.price" :min="1" :max="9999999" style="width: 100%" />
            </el-form-item>
            <el-form-item label="投标说明">
              <el-input v-model="bidForm.message" type="textarea" :rows="3" placeholder="介绍您的优势和方案..." />
            </el-form-item>
            <el-button type="primary" @click="submitBid" :loading="bidLoading" style="width: 100%">提交投标</el-button>
          </el-form>
        </el-card>

        <!-- 工程操作 -->
        <el-card style="margin-top: 16px" v-if="isOwner">
          <template #header><span>工程操作</span></template>
          <el-space direction="vertical" fill style="width: 100%">
            <el-button v-if="project.status === 'bidding' || project.status === 'pending'" type="warning" @click="cancelProject" style="width: 100%">取消工程</el-button>
            <el-button v-if="project.status !== 'in_progress'" type="danger" @click="deleteProject" style="width: 100%">删除工程</el-button>
          </el-space>
        </el-card>

        <!-- 评价 (仅对合同参与者显示) -->
        <el-card style="margin-top: 16px" v-if="canReview">
          <template #header><span>发表评价</span></template>
          <el-form :model="reviewForm" label-position="top">
            <el-form-item label="评分">
              <el-rate v-model="reviewForm.rating" show-text />
            </el-form-item>
            <el-form-item label="评价内容">
              <el-input v-model="reviewForm.comment" type="textarea" :rows="3" placeholder="请写下您的评价..." />
            </el-form-item>
            <el-button type="primary" @click="submitReview" style="width: 100%">提交评价</el-button>
          </el-form>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useUserStore } from '../store'
import { ElMessage, ElMessageBox } from 'element-plus'
import api from '../api'

const route = useRoute()
const router = useRouter()
const userStore = useUserStore()
const project = ref(null)
const bids = ref([])
const bidLoading = ref(false)
const bidForm = ref({ price: 0, message: '' })
const reviewForm = ref({ rating: 5, comment: '' })
const myContract = ref(null)

const statusMap = {
  pending: { text: '待发布', type: 'info' },
  bidding: { text: '招标中', type: 'success' },
  in_progress: { text: '进行中', type: 'warning' },
  completed: { text: '已完成', type: '' },
  cancelled: { text: '已取消', type: 'danger' }
}

const statusText = computed(() => statusMap[project.value?.status]?.text)
const statusType = computed(() => statusMap[project.value?.status]?.type)
const isOwner = computed(() => userStore.user?.id === project.value?.user_id)
const hasBid = computed(() => bids.value.some(b => b.engineer_id === userStore.user?.id))
const canBid = computed(() => userStore.isLoggedIn && !isOwner.value && project.value?.status === 'bidding' && !hasBid.value)
const canReview = computed(() => {
  if (!userStore.isLoggedIn || !myContract.value || project.value?.status !== 'completed') return false
  // 检查是否已评价
  return true
})

const fetchProject = async () => {
  try {
    const res = await api.get(`/projects/${route.params.id}`)
    project.value = res
    bids.value = res.bids || []

    // 如果已登录，检查是否有相关合同
    if (userStore.isLoggedIn) {
      try {
        const contracts = await api.get('/contracts/my')
        myContract.value = contracts.find(c => c.project_id === Number(route.params.id) && c.status === 'completed')
      } catch (e) {}
    }
  } catch (e) {
    ElMessage.error('加载工程详情失败')
  }
}

const submitBid = async () => {
  if (!bidForm.value.price) return ElMessage.warning('请填写报价')
  bidLoading.value = true
  try {
    await api.post('/bids', { project_id: project.value.id, ...bidForm.value })
    ElMessage.success('投标成功')
    fetchProject()
  } catch (e) {} finally { bidLoading.value = false }
}

const acceptBid = async (bidId) => {
  try {
    await ElMessageBox.confirm('确定接受此投标？将自动生成合同。', '确认')
    await api.post(`/bids/${bidId}/accept`)
    ElMessage.success('已接受投标')
    fetchProject()
  } catch (e) {}
}

const rejectBid = async (bidId) => {
  try {
    await api.post(`/bids/${bidId}/reject`)
    ElMessage.success('已拒绝')
    fetchProject()
  } catch (e) {}
}

const cancelProject = async () => {
  try {
    await ElMessageBox.confirm('确定取消此工程？', '确认')
    await api.post(`/projects/${project.value.id}/cancel`)
    ElMessage.success('已取消')
    fetchProject()
  } catch (e) {}
}

const deleteProject = async () => {
  try {
    await ElMessageBox.confirm('确定删除此工程？此操作不可恢复。', '确认')
    await api.delete(`/projects/${project.value.id}`)
    ElMessage.success('已删除')
    router.push('/my-projects')
  } catch (e) {}
}

const submitReview = async () => {
  if (!reviewForm.value.rating) return ElMessage.warning('请选择评分')
  if (!myContract.value) return ElMessage.warning('未找到可评价的合同')
  try {
    await api.post('/reviews', { contract_id: myContract.value.id, ...reviewForm.value })
    ElMessage.success('评价成功')
    reviewForm.value = { rating: 5, comment: '' }
  } catch (e) {}
}

onMounted(fetchProject)
</script>

<style scoped>
.page-title { font-size: 18px; font-weight: bold; }
.card-header-row { display: flex; justify-content: space-between; align-items: center; }
.description { margin-top: 20px; }
.description h4 { margin-bottom: 8px; color: #303133; }
.description p { color: #606266; line-height: 1.8; white-space: pre-wrap; }
</style>
