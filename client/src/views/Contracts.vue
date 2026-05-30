<template>
  <div>
    <el-card>
      <template #header><h2>合同管理</h2></template>
      <el-table :data="contracts" style="width: 100%">
        <el-table-column prop="project_title" label="工程名称" min-width="180" />
        <el-table-column prop="category" label="分类" width="120" />
        <el-table-column label="甲方" width="120">
          <template #default="{ row }">{{ row.owner_real_name || row.owner_name }}</template>
        </el-table-column>
        <el-table-column label="工程师" width="120">
          <template #default="{ row }">{{ row.engineer_real_name || row.engineer_name }}</template>
        </el-table-column>
        <el-table-column prop="amount" label="合同金额" width="120">
          <template #default="{ row }">
            <span style="color: #f56c6c; font-weight: bold">¥{{ row.amount?.toLocaleString() }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="{ active: 'warning', completed: 'success', terminated: 'danger' }[row.status]">
              {{ { active: '履行中', completed: '已完成', terminated: '已终止' }[row.status] }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="signed_at" label="签约时间" width="180" />
        <el-table-column label="操作" width="200">
          <template #default="{ row }">
            <template v-if="row.status === 'active'">
              <el-button v-if="row.owner_id === userStore.user?.id" type="success" size="small" @click="completeContract(row.id)">确认完工</el-button>
              <el-button type="danger" size="small" @click="terminateContract(row.id)">终止合同</el-button>
            </template>
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-if="contracts.length === 0" description="暂无合同" />
    </el-card>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useUserStore } from '../store'
import { ElMessage, ElMessageBox } from 'element-plus'
import api from '../api'

const userStore = useUserStore()
const contracts = ref([])

const fetchContracts = async () => {
  try {
    contracts.value = await api.get('/contracts/my')
  } catch (e) {
    ElMessage.error('加载合同列表失败')
  }
}

const completeContract = async (id) => {
  try {
    await ElMessageBox.confirm('确认工程已完工？将自动结算款项。', '确认')
    await api.post(`/contracts/${id}/complete`)
    ElMessage.success('已确认完工，款项已结算')
    fetchContracts()
  } catch (e) { /* user cancelled */ }
}

const terminateContract = async (id) => {
  try {
    await ElMessageBox.confirm('确定终止此合同？', '确认')
    await api.post(`/contracts/${id}/terminate`)
    ElMessage.success('合同已终止')
    fetchContracts()
  } catch (e) { /* user cancelled or error */ }
}

onMounted(fetchContracts)
</script>

<style scoped>
h2 { margin: 0; }
</style>
