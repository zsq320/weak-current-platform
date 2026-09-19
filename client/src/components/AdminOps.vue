<template>
  <el-tabs v-model="subTab" type="border-card">
    <!-- 提现审核 -->
    <el-tab-pane label="提现审核" name="withdrawals">
      <el-table :data="withdrawals" size="small">
        <el-table-column prop="id" label="ID" width="60" />
        <el-table-column label="申请人" width="110">
          <template #default="{ row }">{{ row.real_name || row.username }}</template>
        </el-table-column>
        <el-table-column prop="amount" label="金额" width="110">
          <template #default="{ row }"><span class="amount">¥{{ row.amount?.toLocaleString() }}</span></template>
        </el-table-column>
        <el-table-column prop="bank_info" label="收款账户" min-width="200" show-overflow-tooltip />
        <el-table-column prop="created_at" label="申请时间" width="170" />
        <el-table-column prop="status" label="状态" width="90">
          <template #default="{ row }">
            <el-tag size="small" :type="{ pending: 'warning', paid: 'success', rejected: 'danger' }[row.status]">
              {{ { pending: '待审核', paid: '已打款', rejected: '已驳回' }[row.status] }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="170" v-if="withdrawals.some(w => w.status === 'pending')">
          <template #default="{ row }">
            <template v-if="row.status === 'pending'">
              <el-button type="success" size="small" @click="processWithdraw(row, 'approve')">确认打款</el-button>
              <el-button type="danger" size="small" @click="processWithdraw(row, 'reject')">驳回</el-button>
            </template>
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-if="withdrawals.length === 0" description="暂无提现申请" :image-size="60" />
    </el-tab-pane>

    <!-- 纠纷仲裁 -->
    <el-tab-pane label="纠纷仲裁" name="disputes">
      <el-table :data="disputes" size="small">
        <el-table-column prop="id" label="ID" width="60" />
        <el-table-column prop="project_title" label="工程" min-width="150" show-overflow-tooltip />
        <el-table-column prop="reporter_name" label="投诉人" width="100" />
        <el-table-column prop="against_name" label="被投诉方" width="100" />
        <el-table-column prop="reason" label="事由" min-width="130" show-overflow-tooltip />
        <el-table-column prop="status" label="状态" width="90">
          <template #default="{ row }">
            <el-tag size="small" :type="{ open: 'danger', arbitrating: 'warning', resolved: 'success', closed: 'info' }[row.status]">
              {{ { open: '待受理', arbitrating: '仲裁中', resolved: '已办结', closed: '已关闭' }[row.status] }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="120">
          <template #default="{ row }">
            <el-button v-if="!['resolved', 'closed'].includes(row.status)" type="primary" size="small" @click="openArbitrate(row)">仲裁</el-button>
            <el-tooltip v-else placement="top" :content="row.resolution || ''">
              <el-link type="info">处理意见</el-link>
            </el-tooltip>
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-if="disputes.length === 0" description="暂无纠纷工单" :image-size="60" />
    </el-tab-pane>

    <!-- 发票处理 -->
    <el-tab-pane label="发票处理" name="invoices">
      <el-table :data="invoices" size="small">
        <el-table-column prop="id" label="ID" width="60" />
        <el-table-column prop="username" label="申请人" width="100" />
        <el-table-column prop="title" label="抬头" min-width="150" show-overflow-tooltip />
        <el-table-column prop="tax_no" label="税号" width="140" />
        <el-table-column prop="amount" label="金额" width="100">
          <template #default="{ row }"><span class="amount">¥{{ row.amount?.toLocaleString() }}</span></template>
        </el-table-column>
        <el-table-column prop="invoice_type" label="类型" width="70">
          <template #default="{ row }">{{ row.invoice_type === 'special' ? '专票' : '普票' }}</template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="80">
          <template #default="{ row }">
            <el-tag size="small" :type="{ pending: 'warning', approved: '', rejected: 'danger', issued: 'success' }[row.status]">
              {{ { pending: '待处理', approved: '已审核', rejected: '已驳回', issued: '已开具' }[row.status] }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="200" v-if="invoices.some(i => i.status === 'pending')">
          <template #default="{ row }">
            <template v-if="row.status === 'pending'">
              <el-button type="success" size="small" @click="processInvoice(row, 'approve')">审核</el-button>
              <el-button type="danger" size="small" @click="processInvoice(row, 'reject')">驳回</el-button>
            </template>
            <el-button v-else-if="row.status === 'approved'" type="primary" size="small" @click="processInvoice(row, 'issue')">标记已开具</el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-if="invoices.length === 0" description="暂无发票申请" :image-size="60" />
    </el-tab-pane>

    <!-- 企业认证 -->
    <el-tab-pane label="企业认证" name="companies">
      <el-table :data="companies" size="small">
        <el-table-column prop="company_name" label="企业名称" min-width="160" />
        <el-table-column prop="license_no" label="信用代码" width="170" />
        <el-table-column prop="qualification_level" label="资质等级" width="130" />
        <el-table-column prop="username" label="申请人" width="100" />
        <el-table-column prop="status" label="状态" width="80">
          <template #default="{ row }">
            <el-tag size="small" :type="{ pending: 'warning', approved: 'success', rejected: 'danger' }[row.status]">
              {{ { pending: '待审核', approved: '已通过', rejected: '已驳回' }[row.status] }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="160" v-if="companies.some(c => c.status === 'pending')">
          <template #default="{ row }">
            <template v-if="row.status === 'pending'">
              <el-button type="success" size="small" @click="reviewCompany(row, 'approve')">通过</el-button>
              <el-button type="danger" size="small" @click="reviewCompany(row, 'reject')">驳回</el-button>
            </template>
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-if="companies.length === 0" description="暂无企业认证申请" :image-size="60" />
    </el-tab-pane>

    <!-- 评价申诉 -->
    <el-tab-pane label="评价申诉" name="appeals">
      <el-table :data="appeals" size="small">
        <el-table-column prop="id" label="ID" width="60" />
        <el-table-column prop="appellant_name" label="申诉人" width="100" />
        <el-table-column prop="rating" label="被诉评分" width="90">
          <template #default="{ row }">{{ row.rating }} 星「{{ row.review_comment }}」</template>
        </el-table-column>
        <el-table-column prop="reason" label="申诉理由" min-width="180" show-overflow-tooltip />
        <el-table-column prop="status" label="状态" width="80">
          <template #default="{ row }">
            <el-tag size="small" :type="{ pending: 'warning', approved: 'success', rejected: 'info' }[row.status]">
              {{ { pending: '待处理', approved: '申诉成立', rejected: '已维持' }[row.status] }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="170" v-if="appeals.some(a => a.status === 'pending')">
          <template #default="{ row }">
            <template v-if="row.status === 'pending'">
              <el-button type="danger" size="small" @click="processAppeal(row, 'revoke')">撤销评价</el-button>
              <el-button type="info" size="small" @click="processAppeal(row, 'uphold')">维持</el-button>
            </template>
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-if="appeals.length === 0" description="暂无申诉" :image-size="60" />
    </el-tab-pane>

    <!-- 平台设置 -->
    <el-tab-pane label="平台设置" name="settings">
      <el-form label-width="200px" style="max-width: 560px">
        <el-form-item label="平台服务费率（%）">
          <el-input-number v-model="settingsForm.commission_rate" :min="0" :max="50" :step="0.5" />
        </el-form-item>
        <el-form-item label="质保金留存率（%）">
          <el-input-number v-model="settingsForm.retention_rate" :min="0" :max="50" :step="0.5" />
        </el-form-item>
        <el-form-item label="默认质保期（月）">
          <el-input-number v-model="settingsForm.warranty_months" :min="1" :max="60" />
        </el-form-item>
        <el-form-item label="完工须先通过竣工验收">
          <el-switch v-model="settingsForm.require_final_acceptance" :active-value="'1'" :inactive-value="'0'" />
        </el-form-item>
        <el-form-item label="完工须双方签署合同">
          <el-switch v-model="settingsForm.require_both_signatures" :active-value="'1'" :inactive-value="'0'" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="saveSettings">保存设置</el-button>
        </el-form-item>
      </el-form>
    </el-tab-pane>

    <!-- 对账与备份 -->
    <el-tab-pane label="对账与备份" name="reports">
      <el-card style="margin-bottom: 16px">
        <template #header>平台入账汇总</template>
        <el-table :data="platformIncome" size="small">
          <el-table-column prop="type" label="类型" width="130">
            <template #default="{ row }">{{ { commission: '平台服务费', retention: '质保金留存', withdraw: '提现打款' }[row.type] || row.type }}</template>
          </el-table-column>
          <el-table-column prop="total" label="累计金额" width="140">
            <template #default="{ row }"><span class="amount">¥{{ row.total?.toLocaleString() }}</span></template>
          </el-table-column>
          <el-table-column prop="count" label="笔数" width="90" />
        </el-table>
        <el-empty v-if="platformIncome.length === 0" description="暂无平台入账" :image-size="60" />
      </el-card>
      <el-space style="margin-bottom: 16px" wrap>
        <el-date-picker v-model="reportRange" type="daterange" value-format="YYYY-MM-DD"
          start-placeholder="开始日期" end-placeholder="结束日期" style="width: 260px" />
        <el-button type="primary" @click="exportLedger">导出对账CSV</el-button>
        <el-button type="success" @click="doBackup">立即备份数据库</el-button>
      </el-space>
      <el-table :data="backups" size="small">
        <el-table-column prop="name" label="备份文件" min-width="220" />
        <el-table-column prop="size" label="大小" width="110">
          <template #default="{ row }">{{ (row.size / 1024 / 1024).toFixed(2) }} MB</template>
        </el-table-column>
        <el-table-column prop="created" label="时间" width="180" />
      </el-table>
    </el-tab-pane>
  </el-tabs>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import api from '../api'

const subTab = ref('withdrawals')
const withdrawals = ref([])
const disputes = ref([])
const invoices = ref([])
const companies = ref([])
const appeals = ref([])
const platformIncome = ref([])
const backups = ref([])
const reportRange = ref([])
const settingsForm = reactive({
  commission_rate: 5, retention_rate: 5, warranty_months: 12,
  require_final_acceptance: '0', require_both_signatures: '0'
})

const fetchAll = async () => {
  const [wd, dp, inv, cp, ap, pi, bk, st] = await Promise.all([
    api.get('/admin/withdrawals'), api.get('/biz/disputes'), api.get('/biz/invoices'),
    api.get('/admin/companies'), api.get('/admin/review-appeals'), api.get('/finance/platform-income'),
    api.get('/admin/backups'), api.get('/admin/settings')
  ])
  withdrawals.value = wd.items
  disputes.value = dp.items
  invoices.value = inv.items
  companies.value = cp.items
  appeals.value = ap.items
  platformIncome.value = pi.items
  backups.value = bk.items
  st.items.forEach(s => {
    if (settingsForm[s.key] !== undefined) settingsForm[s.key] = s.value
  })
}

const processWithdraw = async (row, action) => {
  let reject_reason = null
  if (action === 'reject') {
    const { value } = await ElMessageBox.prompt('请填写驳回原因', '驳回提现')
    reject_reason = value
  } else {
    await ElMessageBox.confirm(`确认已向 ${row.real_name || row.username} 打款 ¥${row.amount}？`, '确认打款')
  }
  await api.post(`/admin/withdrawals/${row.id}/process`, { action, reject_reason })
  ElMessage.success('已处理')
  fetchAll()
}

const openArbitrate = async (row) => {
  const { value: resolution } = await ElMessageBox.prompt('请填写仲裁处理意见', `仲裁纠纷 #${row.id}`, { inputPlaceholder: '依据工程过程记录给出处理意见' })
  const { value: payout } = await ElMessageBox.prompt(
    '资金处置（可选）：输入金额并选择方向。留空则不涉及资金处置。',
    '资金处置', { inputPlaceholder: '金额（元），可留空' }
  )
  const { value: target } = await ElMessageBox.prompt('资金方向：输入 owner（退款给甲方）或 engineer（放款给乙方）', '资金方向', {
    inputPlaceholder: 'owner / engineer，可留空', inputValue: 'owner'
  })
  await api.post(`/admin/disputes/${row.id}/arbitrate`, {
    resolution,
    refund_amount: Number(payout) || 0,
    target: target === 'engineer' ? 'engineer' : 'owner'
  })
  ElMessage.success('仲裁已完成')
  fetchAll()
}

const processInvoice = async (row, action) => {
  await api.post(`/admin/invoices/${row.id}/process`, { action })
  ElMessage.success('已处理')
  fetchAll()
}

const reviewCompany = async (row, action) => {
  let reject_reason = null
  if (action === 'reject') {
    const { value } = await ElMessageBox.prompt('请填写驳回原因', '驳回企业认证')
    reject_reason = value
  }
  await api.post(`/admin/companies/${row.user_id}/review`, { action, reject_reason })
  ElMessage.success('已处理')
  fetchAll()
}

const processAppeal = async (row, action) => {
  await api.post(`/admin/review-appeals/${row.id}/process`, { action })
  ElMessage.success('已处理')
  fetchAll()
}

const saveSettings = async () => {
  await api.put('/admin/settings', { settings: { ...settingsForm } })
  ElMessage.success('设置已保存')
}

const exportLedger = async () => {
  const start = reportRange.value?.[0] || '2000-01-01'
  const end = reportRange.value?.[1] || new Date().toISOString().slice(0, 10)
  try {
    // window.open 无法携带 Authorization，改用 fetch + Blob 下载
    const res = await fetch(`/api/admin/reports/ledger.csv?start=${start}&end=${end}`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('accessToken')}` }
    })
    if (!res.ok) throw new Error('导出失败')
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `ledger-${start}-to-${end}.csv`
    a.click()
    URL.revokeObjectURL(url)
  } catch (e) {
    ElMessage.error('导出失败，请稍后重试')
  }
}

const doBackup = async () => {
  await api.post('/admin/backups')
  ElMessage.success('备份完成')
  fetchAll()
}

onMounted(fetchAll)
</script>
