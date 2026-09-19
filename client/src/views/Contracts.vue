<template>
  <div>
    <el-card>
      <template #header>
        <div class="header-row">
          <h2 style="margin: 0">合同管理</h2>
          <el-tag size="small" type="info">结算规则：平台服务费5% + 质保金5%（质保期12个月）</el-tag>
        </div>
      </template>
      <el-table :data="contracts" style="width: 100%">
        <el-table-column prop="project_title" label="工程名称" min-width="170" show-overflow-tooltip />
        <el-table-column label="甲方" width="100">
          <template #default="{ row }">{{ row.owner_real_name || row.owner_name }}</template>
        </el-table-column>
        <el-table-column label="工程师" width="100">
          <template #default="{ row }">{{ row.engineer_real_name || row.engineer_name }}</template>
        </el-table-column>
        <el-table-column prop="amount" label="合同金额" width="105">
          <template #default="{ row }">
            <span style="color: #f56c6c; font-weight: bold">¥{{ row.amount?.toLocaleString() }}</span>
          </template>
        </el-table-column>
        <el-table-column label="签署" width="90">
          <template #default="{ row }">
            <el-tag size="small" :type="{ pending: 'info', partial: 'warning', signed: 'success' }[row.sign_status || 'pending']">
              {{ { pending: '未签署', partial: '一方已签', signed: '双方已签' }[row.sign_status || 'pending'] }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="资金" width="90">
          <template #default="{ row }">
            <el-tag size="small" :type="{ none: 'info', frozen: 'warning', settled: 'success', refunded: 'info' }[row.escrow_status || 'none']">
              {{ { none: '未托管', frozen: '已托管', settled: '已结算', refunded: '已退回' }[row.escrow_status || 'none'] }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="88">
          <template #default="{ row }">
            <el-tag :type="{ active: 'warning', completed: 'success', terminated: 'danger' }[row.status]">
              {{ { active: '履行中', completed: '已完成', terminated: '已终止' }[row.status] }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="230" fixed="right">
          <template #default="{ row }">
            <el-button size="small" @click="openDetail(row)">详情/签署</el-button>
            <el-button v-if="row.status === 'active' && row.owner_id === userStore.user?.id" type="success" size="small" @click="completeContract(row)">确认完工</el-button>
            <el-button v-if="row.status === 'active'" type="danger" size="small" plain @click="terminateContract(row.id)">终止</el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-if="contracts.length === 0" description="暂无合同" />
    </el-card>

    <!-- 合同详情对话框 -->
    <el-dialog v-model="detailVisible" title="合同详情" width="760px" top="4vh">
      <template v-if="detail">
        <el-descriptions :column="2" border size="small">
          <el-descriptions-item label="工程">{{ detail.contract.project_title }}</el-descriptions-item>
          <el-descriptions-item label="金额">¥{{ detail.contract.amount?.toLocaleString() }}</el-descriptions-item>
          <el-descriptions-item label="甲方">{{ detail.contract.owner_real_name || detail.contract.owner_name }}</el-descriptions-item>
          <el-descriptions-item label="乙方">{{ detail.contract.engineer_real_name || detail.contract.engineer_name }}</el-descriptions-item>
          <el-descriptions-item v-if="detail.contract.status === 'completed'" label="质保金">
            ¥{{ detail.contract.retention_amount }}（{{ detail.contract.warranty_months }}个月）
          </el-descriptions-item>
          <el-descriptions-item v-if="detail.contract.status === 'completed'" label="质保金状态">
            {{ detail.contract.retention_released_at ? '已释放' : '留存中' }}
          </el-descriptions-item>
        </el-descriptions>

        <h4 style="margin: 14px 0 6px">签署记录</h4>
        <el-timeline v-if="detail.signatures.length > 0">
          <el-timeline-item v-for="s in detail.signatures" :key="s.id"
            :timestamp="`${s.signed_at} · IP ${s.ip || '-'}`" :type="s.role === 'owner' ? 'primary' : 'success'">
            {{ s.role === 'owner' ? '甲方' : '乙方' }} {{ s.real_name || s.username }} 已签署（V{{ s.content_version }}，哈希 {{ s.content_hash?.slice(0, 12) }}…）
          </el-timeline-item>
        </el-timeline>
        <el-alert v-else type="info" :closable="false" title="尚未有任何一方签署。签署后合同具备双方确认的证据链。" style="margin-bottom: 10px" />

        <h4 style="margin: 14px 0 6px">合同正文 <el-tag size="small" type="info">V{{ detail.contract.content_version || 1 }}</el-tag></h4>
        <div class="contract-content">{{ detail.contract.content }}</div>

        <template v-if="detail.warranties.length > 0">
          <h4 style="margin: 14px 0 6px">质保工单</h4>
          <el-table :data="detail.warranties" size="small">
            <el-table-column prop="title" label="标题" min-width="120" />
            <el-table-column prop="description" label="描述" min-width="120" show-overflow-tooltip />
            <el-table-column prop="status" label="状态" width="80">
              <template #default="{ row }">
                <el-tag size="small" :type="{ open: 'warning', processing: 'warning', resolved: 'success', closed: 'info' }[row.status]">
                  {{ { open: '待处理', processing: '处理中', resolved: '已解决', closed: '已关闭' }[row.status] }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="handle_note" label="处理说明" min-width="110" show-overflow-tooltip />
            <el-table-column label="操作" width="170" fixed="right">
              <template #default="{ row }">
                <el-button v-if="isEngineerRole && row.status === 'open'" type="primary" size="small" @click="warrantyAction(row, 'accept')">接单</el-button>
                <el-button v-if="isEngineerRole && row.status === 'processing'" type="success" size="small" @click="warrantyAction(row, 'resolve')">完成维修</el-button>
                <el-button v-if="isOwnerRole && row.status === 'resolved'" type="info" size="small" @click="warrantyAction(row, 'close')">确认关闭</el-button>
              </template>
            </el-table-column>
          </el-table>
        </template>

        <el-alert v-if="detail.dispute" type="error" :closable="false"
          :title="`该合同存在纠纷（${{ open: '待受理', arbitrating: '仲裁中', resolved: '已办结' }[detail.dispute.status] || detail.dispute.status}）`"
          :description="detail.dispute.resolution ? `处理意见：${detail.dispute.resolution}` : '平台将依据工程过程记录（聊天/打卡/日志/照片/验收单）进行仲裁'"
          style="margin-top: 12px" />
      </template>
      <template #footer>
        <el-space wrap>
          <el-button @click="detailVisible = false">关闭</el-button>
          <el-button @click="printContract">打印/存为PDF</el-button>
          <el-button v-if="canWarranty" type="warning" plain @click="warrantyVisible = true">发起报修</el-button>
          <el-button v-if="canDispute" type="danger" plain @click="disputeVisible = true">发起纠纷</el-button>
          <el-button v-if="canEditContent" type="warning" @click="editContent">修改条款</el-button>
          <el-button v-if="canSign" type="primary" @click="openSign">签署合同</el-button>
        </el-space>
      </template>
    </el-dialog>

    <!-- 签署对话框 -->
    <el-dialog v-model="signVisible" title="签署合同" width="460px">
      <el-alert type="warning" :closable="false" style="margin-bottom: 12px"
        title="请仔细阅读合同正文。签署将记录账户、时间、IP 与合同内容哈希，作为双方确认的证据。" />
      <el-checkbox v-if="isOwnerRole && detail?.contract?.escrow_status === 'none'" v-model="escrowChecked">
        签署同时托管工程款 ¥{{ detail?.contract?.amount?.toLocaleString() }} 至平台（推荐，保障乙方权益）
      </el-checkbox>
      <el-form label-width="90px" style="margin-top: 12px">
        <el-form-item label="登录密码">
          <el-input v-model="signPassword" type="password" show-password placeholder="输入登录密码确认签署" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="signVisible = false">取消</el-button>
        <el-button type="primary" :loading="signing" @click="doSign">确认签署</el-button>
      </template>
    </el-dialog>

    <!-- 修改条款 -->
    <el-dialog v-model="contentEditVisible" title="修改合同条款" width="760px">
      <el-input v-model="contentDraft" type="textarea" :rows="16" />
      <template #footer>
        <el-button @click="contentEditVisible = false">取消</el-button>
        <el-button type="primary" @click="saveContent">保存新版本</el-button>
      </template>
    </el-dialog>

    <!-- 发起报修 -->
    <el-dialog v-model="warrantyVisible" title="质保报修" width="480px">
      <el-alert type="info" :closable="false" style="margin-bottom: 10px"
        title="质保期内的质量问题可发起报修：工程师接单维修后由您确认关闭。" />
      <el-form label-width="80px">
        <el-form-item label="标题">
          <el-input v-model="warrantyForm.title" placeholder="如：二楼监控画面闪烁" />
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="warrantyForm.description" type="textarea" :rows="3" placeholder="故障现象、发生时间等" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="warrantyVisible = false">取消</el-button>
        <el-button type="primary" @click="doWarranty">提交报修</el-button>
      </template>
    </el-dialog>

    <!-- 发起纠纷 -->
    <el-dialog v-model="disputeVisible" title="发起纠纷 / 投诉" width="480px">
      <el-form label-width="80px">
        <el-form-item label="事由">
          <el-input v-model="disputeForm.reason" placeholder="如：工程质量不达标 / 拖延付款" />
        </el-form-item>
        <el-form-item label="详细描述">
          <el-input v-model="disputeForm.description" type="textarea" :rows="4" placeholder="描述纠纷经过，平台将结合过程记录仲裁" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="disputeVisible = false">取消</el-button>
        <el-button type="danger" @click="doDispute">提交投诉</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useUserStore } from '../store'
import api from '../api'

const userStore = useUserStore()
const contracts = ref([])
const detail = ref(null)
const detailVisible = ref(false)

const signVisible = ref(false)
const signPassword = ref('')
const escrowChecked = ref(true)
const signing = ref(false)

const contentEditVisible = ref(false)
const contentDraft = ref('')
const disputeVisible = ref(false)
const disputeForm = ref({ reason: '', description: '' })

// 质保报修
const warrantyVisible = ref(false)
const warrantyForm = ref({ title: '', description: '' })

const isOwnerRole = computed(() => detail.value?.contract?.owner_id === userStore.user?.id)
const mySigned = computed(() => isOwnerRole.value
  ? !!detail.value?.contract?.owner_signed_at
  : !!detail.value?.contract?.engineer_signed_at)
const canSign = computed(() => {
  const c = detail.value?.contract
  return c && c.status === 'active' && !mySigned.value
    && (c.owner_id === userStore.user?.id || c.engineer_id === userStore.user?.id)
})
const canEditContent = computed(() => {
  const c = detail.value?.contract
  return c && c.status === 'active' && c.owner_id === userStore.user?.id
    && !c.owner_signed_at && !c.engineer_signed_at
})
const isEngineerRole = computed(() => detail.value?.contract?.engineer_id === userStore.user?.id)
// 质保报修入口：已结算合同 + 报修方（甲方）+ 质保期未结束
const canWarranty = computed(() => {
  const c = detail.value?.contract
  return c && c.status === 'completed' && isOwnerRole.value && !c.retention_released_at
})

const warrantyAction = async (row, action) => {
  let handle_note = null
  if (action === 'resolve') {
    const { value } = await ElMessageBox.prompt('请填写维修处理说明', '完成维修')
    handle_note = value
  }
  try {
    await api.post(`/biz/warranties/${row.id}/${action}`, handle_note ? { handle_note } : {})
    ElMessage.success('操作成功')
    await openDetail({ id: detail.value.contract.id })
  } catch (e) {
    ElMessage.error(e.response?.data?.error || '操作失败')
  }
}

const doWarranty = async () => {
  if (!warrantyForm.value.title.trim()) return ElMessage.warning('请填写报修标题')
  try {
    await api.post('/biz/warranties', {
      project_id: detail.value.contract.project_id,
      ...warrantyForm.value
    })
    ElMessage.success('报修工单已提交')
    warrantyVisible.value = false
    warrantyForm.value = { title: '', description: '' }
    await openDetail({ id: detail.value.contract.id })
  } catch (e) {
    ElMessage.error(e.response?.data?.error || '提交失败')
  }
}

// 打印合同（浏览器另存为 PDF，作为签署凭证留存）
const printContract = () => {
  const c = detail.value?.contract
  if (!c) return
  const win = window.open('', '_blank')
  win.document.write(`<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><title>合同 #${c.id}</title>
    <style>body{font-family:'Microsoft YaHei',sans-serif;line-height:1.9;padding:40px;max-width:800px;margin:0 auto;color:#1f2937}
    pre{white-space:pre-wrap;font-family:inherit}h3{text-align:center}
    .meta{color:#6b7280;font-size:12px;border-top:1px solid #ddd;padding-top:8px;margin-top:24px}</style></head><body>
    <h3>弱电工程服务合同（平台存档）</h3>
    <pre>${c.content || ''}</pre>
    <div class="meta">合同编号：#${c.id} ｜ 内容版本：V${c.content_version || 1} ｜ 内容哈希：${c.content_hash || '-'}<br/>
    甲方签署时间：${c.owner_signed_at || '未签署'} ｜ 乙方签署时间：${c.engineer_signed_at || '未签署'}</div>
    </body></html>`)
  win.document.close()
  win.focus()
  setTimeout(() => win.print(), 400)
}

const canDispute = computed(() => {
  const c = detail.value?.contract
  return c && !detail.value?.dispute
    && (c.owner_id === userStore.user?.id || c.engineer_id === userStore.user?.id)
})

const fetchContracts = async () => {
  try {
    contracts.value = await api.get('/contracts/my')
  } catch (e) {
    ElMessage.error('加载合同列表失败')
  }
}

const openDetail = async (row) => {
  const res = await api.get(`/contracts/${row.id}`)
  detail.value = res
  detailVisible.value = true
}

const openSign = () => {
  signPassword.value = ''
  signVisible.value = true
}

const doSign = async () => {
  if (!signPassword.value) return ElMessage.warning('请输入登录密码')
  signing.value = true
  try {
    await api.post(`/contracts/${detail.value.contract.id}/sign`, {
      password: signPassword.value,
      escrow: escrowChecked.value && isOwnerRole.value
    })
    ElMessage.success('签署成功')
    signVisible.value = false
    await openDetail({ id: detail.value.contract.id })
    fetchContracts()
  } catch (e) {
    ElMessage.error(e.response?.data?.error || '签署失败')
  } finally {
    signing.value = false
  }
}

const editContent = () => {
  contentDraft.value = detail.value.contract.content || ''
  contentEditVisible.value = true
}

const saveContent = async () => {
  try {
    await api.put(`/contracts/${detail.value.contract.id}/content`, { content: contentDraft.value })
    ElMessage.success('合同条款已更新')
    contentEditVisible.value = false
    await openDetail({ id: detail.value.contract.id })
  } catch (e) {
    ElMessage.error(e.response?.data?.error || '保存失败')
  }
}

const completeContract = async (row) => {
  try {
    await ElMessageBox.confirm(
      '确认完工将按合同结算：平台收取5%服务费，留存5%质保金（12个月质保期满后释放给工程师），其余划转给工程师。是否继续？',
      '确认完工结算', { type: 'warning' }
    )
    await api.post(`/contracts/${row.id}/complete`)
    ElMessage.success('结算完成')
    fetchContracts()
  } catch (e) {
    if (e !== 'cancel' && e?.response) ElMessage.error(e.response?.data?.error || '操作失败')
  }
}

const terminateContract = async (id) => {
  try {
    await ElMessageBox.confirm('确定终止此合同？已托管的资金将退回甲方账户。', '确认')
    await api.post(`/contracts/${id}/terminate`)
    ElMessage.success('合同已终止')
    fetchContracts()
  } catch (e) { /* cancelled */ }
}

const doDispute = async () => {
  try {
    await api.post('/biz/disputes', {
      contract_id: detail.value.contract.id,
      project_id: detail.value.contract.project_id,
      ...disputeForm.value
    })
    ElMessage.success('投诉已提交，平台将介入处理')
    disputeVisible.value = false
    await openDetail({ id: detail.value.contract.id })
  } catch (e) {
    ElMessage.error(e.response?.data?.error || '提交失败')
  }
}

onMounted(fetchContracts)
</script>

<style scoped>
.header-row { display: flex; justify-content: space-between; align-items: center; }
.contract-content {
  white-space: pre-wrap; background: #f8f9fb; border: 1px solid #ebeef5;
  border-radius: 8px; padding: 14px; max-height: 300px; overflow-y: auto;
  font-size: 13px; line-height: 1.8; color: #303133;
}
</style>
