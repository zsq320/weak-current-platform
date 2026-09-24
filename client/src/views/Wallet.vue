<template>
  <div>
    <el-row :gutter="16">
      <!-- 余额卡 -->
      <el-col :xs="24" :md="8">
        <el-card class="balance-card">
          <div class="bc-label">账户余额（元）</div>
          <div class="bc-value">¥{{ (wallet.balance || 0).toLocaleString() }}</div>
          <el-space style="margin-top: 16px">
            <el-button class="bc-btn light" @click="depositDialog = true">充值</el-button>
            <el-button v-if="userStore.user?.role === 'engineer'" class="bc-btn ghost" @click="openWithdraw">提现</el-button>
          </el-space>
        </el-card>
      </el-col>
      <!-- 质保金 -->
      <el-col :xs="24" :md="8">
        <el-card>
          <template #header>质保金（结算留存）</template>
          <div v-if="retentions.length === 0"><el-empty description="暂无留存质保金" :image-size="60" /></div>
          <div v-for="r in retentions" :key="r.id" class="retention-item">
            <div>{{ r.title }}</div>
            <div class="retention-meta">
              <span style="color: var(--warn-600); font-weight: 700">¥{{ r.retention_amount?.toLocaleString() }}</span>
              <span>{{ r.retention_released_at ? '已释放' : `预计 ${String(r.release_due || '').slice(0, 10)} 释放` }}</span>
            </div>
          </div>
        </el-card>
      </el-col>
      <!-- 我的提现 -->
      <el-col :xs="24" :md="8">
        <el-card>
          <template #header>提现记录</template>
          <el-table :data="withdrawals" size="small" max-height="220">
            <el-table-column prop="amount" label="金额" width="90">
              <template #default="{ row }">¥{{ row.amount?.toLocaleString() }}</template>
            </el-table-column>
            <el-table-column prop="status" label="状态" width="90">
              <template #default="{ row }">
                <el-tag size="small" :type="{ pending: 'warning', paid: 'success', rejected: 'danger', approved: 'success' }[row.status]">
                  {{ { pending: '审核中', paid: '已打款', rejected: '已驳回', approved: '待打款' }[row.status] }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="reject_reason" label="备注" min-width="110">
              <template #default="{ row }">{{ row.reject_reason || '-' }}</template>
            </el-table-column>
          </el-table>
          <el-empty v-if="withdrawals.length === 0" description="暂无提现记录" :image-size="60" />
        </el-card>
      </el-col>
    </el-row>

    <!-- 流水 -->
    <el-card style="margin-top: 16px">
      <template #header>
        <div class="header-row">
          <span>资金流水</span>
          <el-button size="small" @click="fetchWallet">刷新</el-button>
        </div>
      </template>
      <el-table :data="ledger" size="small">
        <el-table-column prop="created_at" label="时间" width="170" />
        <el-table-column prop="type" label="类型" width="120">
          <template #default="{ row }">{{ typeText(row.type) }}</template>
        </el-table-column>
        <el-table-column prop="amount" label="金额" width="120">
          <template #default="{ row }">
            <span :style="{ color: row.amount > 0 ? 'var(--success-600)' : 'var(--danger-600)', fontWeight: '700' }">
              {{ row.amount > 0 ? '+' : '' }}{{ row.amount?.toLocaleString() }}
            </span>
          </template>
        </el-table-column>
        <el-table-column prop="balance_after" label="余额" width="110" />
        <el-table-column prop="remark" label="说明" min-width="200" show-overflow-tooltip />
      </el-table>
      <el-empty v-if="ledger.length === 0" description="暂无流水" />
    </el-card>

    <!-- 发票 -->
    <el-card style="margin-top: 16px">
      <template #header>
        <div class="header-row">
          <span>发票申请</span>
          <el-button type="primary" size="small" @click="invoiceDialog = true">申请开票</el-button>
        </div>
      </template>
      <el-table :data="invoices" size="small">
        <el-table-column prop="created_at" label="申请时间" width="170" />
        <el-table-column prop="title" label="抬头" min-width="150" show-overflow-tooltip />
        <el-table-column prop="amount" label="金额" width="110">
          <template #default="{ row }">¥{{ row.amount?.toLocaleString() }}</template>
        </el-table-column>
        <el-table-column prop="invoice_type" label="类型" width="90">
          <template #default="{ row }">{{ row.invoice_type === 'special' ? '专票' : '普票' }}</template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="90">
          <template #default="{ row }">
            <el-tag size="small" :type="{ pending: 'warning', approved: 'success', rejected: 'danger', issued: 'success' }[row.status]">
              {{ { pending: '待处理', approved: '已审核', rejected: '已驳回', issued: '已开具' }[row.status] }}
            </el-tag>
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-if="invoices.length === 0" description="暂无发票申请" />
    </el-card>

    <!-- 充值对话框 -->
    <el-dialog v-model="depositDialog" title="账户充值" width="420px">
      <el-alert type="info" :closable="false" title="当前为平台内部充值通道，支付网关对接中" style="margin-bottom: 14px" />
      <el-form label-width="80px">
        <el-form-item label="金额">
          <el-input-number v-model="depositAmount" :min="1" :max="100000" :step="100" style="width: 100%" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="depositDialog = false">取消</el-button>
        <el-button type="primary" :loading="paying" @click="doDeposit">确认支付</el-button>
      </template>
    </el-dialog>

    <!-- 提现对话框 -->
    <el-dialog v-model="withdrawDialog" title="申请提现" width="460px">
      <el-form label-width="90px">
        <el-form-item label="提现金额">
          <el-input-number v-model="withdrawAmount" :min="1" :max="wallet.balance || 0" style="width: 100%" />
        </el-form-item>
        <el-form-item label="收款账户">
          <el-input v-model="withdrawBank" type="textarea" :rows="2" placeholder="银行卡号 + 开户行 + 户名" />
        </el-form-item>
        <el-form-item label="登录密码">
          <el-input v-model="withdrawPassword" type="password" show-password placeholder="输入登录密码确认提现" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="withdrawDialog = false">取消</el-button>
        <el-button type="primary" :loading="withdrawing" @click="doWithdraw">提交申请</el-button>
      </template>
    </el-dialog>

    <!-- 开票对话框 -->
    <el-dialog v-model="invoiceDialog" title="申请开票" width="480px">
      <el-form label-width="90px">
        <el-form-item label="抬头类型">
          <el-radio-group v-model="invoiceForm.title_type">
            <el-radio value="company">企业</el-radio>
            <el-radio value="personal">个人</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="发票抬头">
          <el-input v-model="invoiceForm.title" />
        </el-form-item>
        <el-form-item v-if="invoiceForm.title_type === 'company'" label="税号">
          <el-input v-model="invoiceForm.tax_no" placeholder="纳税人识别号" />
        </el-form-item>
        <el-form-item label="金额">
          <el-input-number v-model="invoiceForm.amount" :min="1" style="width: 100%" />
        </el-form-item>
        <el-form-item label="发票类型">
          <el-radio-group v-model="invoiceForm.invoice_type">
            <el-radio value="normal">普通发票</el-radio>
            <el-radio value="special">专用发票</el-radio>
          </el-radio-group>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="invoiceDialog = false">取消</el-button>
        <el-button type="primary" @click="doInvoice">提交</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { useUserStore } from '../store'
import api from '../api'

const userStore = useUserStore()
const wallet = ref({})
const ledger = ref([])
const withdrawals = ref([])
const retentions = ref([])
const invoices = ref([])

const depositDialog = ref(false)
const depositAmount = ref(1000)
const paying = ref(false)

const withdrawDialog = ref(false)
const withdrawAmount = ref(100)
const withdrawBank = ref('')
const withdrawPassword = ref('')
const withdrawing = ref(false)

const invoiceDialog = ref(false)
const invoiceForm = reactive({ title_type: 'company', title: '', tax_no: '', amount: 1000, invoice_type: 'normal' })

const typeText = (t) => ({
  opening: '期初建账', deposit: '充值', withdraw: '提现冻结', withdraw_refund: '提现退回',
  pay_escrow: '工程款托管', release_escrow: '托管释放', settlement: '结算',
  refund: '退款', retention_release: '质保金释放', penalty: '罚扣'
}[t] || t)

const fetchWallet = async () => {
  try {
    const [w, wd, rt, inv] = await Promise.all([
      api.get('/finance/ledger', { params: { pageSize: 50 } }),
      api.get('/finance/withdrawals'),
      api.get('/finance/retentions'),
      api.get('/biz/invoices')
    ])
    wallet.value = w
    ledger.value = w.items || []
    withdrawals.value = wd.items || []
    retentions.value = rt.items || []
    invoices.value = inv.items || []
  } catch (e) {
    // 加载失败保持已有数据不变，错误提示由 axios 拦截器统一给出
  }
}

const doDeposit = async () => {
  paying.value = true
  try {
    const order = await api.post('/finance/deposit/orders', { amount: depositAmount.value })
    await api.post(`/finance/deposit/orders/${order.order.order_no}/confirm`)
    ElMessage.success('充值成功')
    depositDialog.value = false
    fetchWallet()
  } catch (e) {
    ElMessage.error(e.response?.data?.error || '充值失败')
  } finally {
    paying.value = false
  }
}

const openWithdraw = () => {
  withdrawAmount.value = Math.min(100, wallet.value.balance || 0)
  withdrawPassword.value = ''
  withdrawDialog.value = true
}

const doWithdraw = async () => {
  if (!withdrawBank.value.trim()) return ElMessage.warning('请填写收款账户信息')
  if (!withdrawPassword.value) return ElMessage.warning('请输入登录密码确认提现')
  withdrawing.value = true
  try {
    await api.post('/finance/withdrawals', {
      amount: withdrawAmount.value,
      bank_info: withdrawBank.value,
      password: withdrawPassword.value
    })
    ElMessage.success('提现申请已提交')
    withdrawDialog.value = false
    fetchWallet()
  } catch (e) {
    ElMessage.error(e.response?.data?.error || '提交失败')
  } finally {
    withdrawing.value = false
  }
}

const doInvoice = async () => {
  try {
    await api.post('/biz/invoices', invoiceForm)
    ElMessage.success('发票申请已提交')
    invoiceDialog.value = false
    fetchWallet()
  } catch (e) {
    ElMessage.error(e.response?.data?.error || '提交失败')
  }
}

onMounted(fetchWallet)
</script>

<style scoped>
/* 余额卡：深色工程蓝图质感 */
.balance-card{
  border:none !important;
  background-color:var(--brand-900) !important;
  background-image:
    linear-gradient(rgba(255,255,255,.05) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255,255,255,.05) 1px, transparent 1px) !important;
  background-size:26px 26px !important;
}
.balance-card :deep(.el-card__body){ background:transparent; }
.bc-label{ font-size:13px; color:rgba(255,255,255,.66); }
.bc-value{ font-size:32px; font-weight:700; color:#fff; margin-top:6px; font-variant-numeric:tabular-nums; letter-spacing:.5px; }
.bc-btn.light{ background:#fff; color:var(--brand-800); border-color:#fff; font-weight:600; }
.bc-btn.light:hover{ background:#EAF1F8; color:var(--brand-800); border-color:#EAF1F8; }
.bc-btn.ghost{ background:transparent; color:#fff; border-color:rgba(255,255,255,.5); }
.bc-btn.ghost:hover{ background:rgba(255,255,255,.12); color:#fff; border-color:#fff; }

.header-row { display: flex; justify-content: space-between; align-items: center; }
.retention-item { padding: 8px 0; border-bottom: 1px dashed var(--line); }
.retention-item:last-child{ border-bottom:none; }
.retention-meta { display: flex; justify-content: space-between; font-size: 12px; color: var(--ink-400); margin-top: 2px; gap:10px; }
</style>
