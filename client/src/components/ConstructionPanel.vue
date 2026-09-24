<template>
  <el-alert v-if="noAccess" type="info" :closable="false" show-icon
    title="施工过程数据仅对项目所有者与中标工程师开放" style="margin-bottom: 12px" />
  <el-tabs v-else v-model="subTab" type="border-card">
    <!-- 施工日志 -->
    <el-tab-pane label="施工日志" name="logs">
      <div v-if="canWork" style="margin-bottom: 10px">
        <el-space wrap>
          <el-date-picker v-model="logForm.log_date" type="date" value-format="YYYY-MM-DD" placeholder="日期" style="width: 130px" />
          <el-input v-model="logForm.weather" placeholder="天气" style="width: 90px" />
          <el-input-number v-model="logForm.workers_count" :min="0" placeholder="人数" style="width: 110px" />
        </el-space>
        <el-input v-model="logForm.content" type="textarea" :rows="2" placeholder="今日施工内容" style="margin-top: 8px" />
        <el-button type="primary" size="small" style="margin-top: 8px" @click="addLog">提交日志</el-button>
        <el-button size="small" style="margin-top: 8px; margin-left: 8px" :loading="exportingType === 'logs'" @click="exportCsv('logs')">导出CSV</el-button>
      </div>
      <el-timeline>
        <el-timeline-item v-for="l in logs" :key="l.id" :timestamp="`${l.log_date} · ${l.real_name || l.username} · ${l.workers_count || 0}人 · ${l.weather || '-'}`">
          {{ l.content }}
        </el-timeline-item>
      </el-timeline>
      <el-empty v-if="logs.length === 0" description="暂无施工日志" :image-size="60" />
    </el-tab-pane>

    <!-- 现场打卡 -->
    <el-tab-pane label="现场打卡" name="checkins">
      <div v-if="canWork" style="margin-bottom: 10px">
        <el-button type="primary" :loading="checkinLoading" @click="doCheckin">
          <el-icon style="margin-right: 4px"><Aim /></el-icon>现场定位打卡
        </el-button>
        <el-button size="small" style="margin-left: 8px" :loading="exportingType === 'checkins'" @click="exportCsv('checkins')">导出CSV</el-button>
      </div>
      <el-table :data="checkins" size="small" max-height="360">
        <el-table-column prop="checkin_at" label="时间" width="170" />
        <el-table-column label="人员" width="110">
          <template #default="{ row }">{{ row.real_name || row.username }}</template>
        </el-table-column>
        <el-table-column prop="address" label="定位" min-width="180" show-overflow-tooltip>
          <template #default="{ row }">{{ row.address || `${row.latitude?.toFixed(5)}, ${row.longitude?.toFixed(5)}` }}</template>
        </el-table-column>
        <el-table-column prop="remark" label="备注" min-width="120" show-overflow-tooltip />
      </el-table>
      <el-empty v-if="checkins.length === 0" description="暂无打卡记录" :image-size="60" />
    </el-tab-pane>

    <!-- 工程照片 -->
    <el-tab-pane label="工程照片" name="photos">
      <div v-if="canWork" style="margin-bottom: 10px">
        <el-radio-group v-model="photoCategory" size="small">
          <el-radio-button value="construction">施工</el-radio-button>
          <el-radio-button value="hidden">隐蔽</el-radio-button>
          <el-radio-button value="acceptance">验收</el-radio-button>
          <el-radio-button value="material">材料</el-radio-button>
        </el-radio-group>
        <el-upload :action="uploadUrl" :headers="uploadHeaders" :data="{ category: photoCategory }"
          multiple accept="image/*" :show-file-list="false" :on-success="onPhotoUploaded" :on-error="onUploadError" style="display: inline-block; margin-left: 10px">
          <el-button type="primary" size="small">上传照片</el-button>
        </el-upload>
      </div>
      <el-image v-for="p in photos" :key="p.id" :src="p.url" :preview-src-list="[p.url]"
        fit="cover" style="width: 100px; height: 100px; margin: 4px; border-radius: 6px" />
      <el-empty v-if="photos.length === 0" description="暂无照片" :image-size="60" />
    </el-tab-pane>

    <!-- 隐蔽工程 -->
    <el-tab-pane label="隐蔽工程" name="hidden">
      <div v-if="role === 'engineer'" style="margin-bottom: 10px">
        <el-input v-model="hiddenForm.name" placeholder="部位名称，如：一楼吊顶内桥架" style="margin-bottom: 6px" />
        <el-input v-model="hiddenForm.location_desc" placeholder="具体位置描述" style="margin-bottom: 6px" />
        <el-input v-model="hiddenForm.content" type="textarea" :rows="2" placeholder="施工工艺与覆盖情况" />
        <el-button type="primary" size="small" style="margin-top: 6px" @click="addHidden">报验（等待甲方核验）</el-button>
      </div>
      <el-table :data="hidden" size="small">
        <el-table-column prop="name" label="部位" min-width="130" />
        <el-table-column prop="location_desc" label="位置" min-width="130" show-overflow-tooltip />
        <el-table-column prop="status" label="状态" width="90">
          <template #default="{ row }">
            <el-tag size="small" :type="{ pending: 'warning', approved: 'success', rework: 'danger' }[row.status]">
              {{ { pending: '待核验', approved: '通过', rework: '需整改' }[row.status] }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="150" v-if="role === 'owner' && hidden.some(h => h.status === 'pending')">
          <template #default="{ row }">
            <template v-if="row.status === 'pending'">
              <el-button type="success" size="small" @click="reviewHidden(row, 'approved')">通过</el-button>
              <el-button type="danger" size="small" @click="reviewHidden(row, 'rework')">整改</el-button>
            </template>
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-if="hidden.length === 0" description="暂无隐蔽工程记录" :image-size="60" />
    </el-tab-pane>

    <!-- 材料进场 -->
    <el-tab-pane label="材料进场" name="materials">
      <div v-if="canWork" style="margin-bottom: 10px">
        <el-space wrap>
          <el-input v-model="materialForm.name" placeholder="材料名称" style="width: 140px" />
          <el-input v-model="materialForm.spec" placeholder="规格型号" style="width: 130px" />
          <el-input-number v-model="materialForm.qty" :min="0" placeholder="数量" style="width: 110px" />
          <el-input v-model="materialForm.unit" placeholder="单位" style="width: 70px" />
          <el-input-number v-model="materialForm.amount" :min="0" :step="100" placeholder="金额" style="width: 130px" />
          <el-input v-model="materialForm.supplier" placeholder="供应商" style="width: 120px" />
        </el-space>
        <el-button type="primary" size="small" style="margin-top: 6px" @click="addMaterial">登记进场</el-button>
        <el-button size="small" style="margin-top: 6px; margin-left: 8px" :loading="exportingType === 'materials'" @click="exportCsv('materials')">导出CSV</el-button>
      </div>
      <el-table :data="materials" size="small" show-summary :summary-method="sumMaterial">
        <el-table-column prop="entry_date" label="日期" width="100" />
        <el-table-column prop="name" label="材料" min-width="120" />
        <el-table-column prop="spec" label="规格" min-width="100" />
        <el-table-column prop="qty" label="数量" width="70" />
        <el-table-column prop="unit" label="单位" width="60" />
        <el-table-column prop="amount" label="金额" width="90" />
        <el-table-column prop="supplier" label="供应商" min-width="100" />
      </el-table>
      <el-empty v-if="materials.length === 0" description="暂无材料进场记录" :image-size="60" />
    </el-tab-pane>

    <!-- 工程量清单 -->
    <el-tab-pane label="工程量清单" name="boq">
      <el-alert :title="`清单合计 ¥${boqTotal.toLocaleString()} / 工程预算 ¥${(budget || 0).toLocaleString()}`"
        :type="boqTotal > budget ? 'error' : 'success'" :closable="false" style="margin-bottom: 10px" />
      <div v-if="canWork" style="margin-bottom: 10px">
        <el-space wrap>
          <el-input v-model="boqForm.name" placeholder="清单项目" style="width: 160px" />
          <el-input v-model="boqForm.unit" placeholder="单位" style="width: 70px" />
          <el-input-number v-model="boqForm.qty" :min="0" placeholder="工程量" style="width: 110px" />
          <el-input-number v-model="boqForm.unit_price" :min="0" :step="10" placeholder="单价" style="width: 130px" />
        </el-space>
        <el-button type="primary" size="small" style="margin-top: 6px" @click="addBoq">添加清单项</el-button>
        <el-button size="small" style="margin-top: 6px; margin-left: 8px" :loading="exportingType === 'boq'" @click="exportCsv('boq')">导出CSV</el-button>
      </div>
      <el-table :data="boq" size="small" show-summary :summary-method="sumBoq">
        <el-table-column prop="name" label="项目" min-width="150" />
        <el-table-column prop="spec" label="规格" min-width="100" />
        <el-table-column prop="qty" label="工程量" width="80" />
        <el-table-column prop="unit" label="单位" width="60" />
        <el-table-column prop="unit_price" label="单价" width="90" />
        <el-table-column label="合价" width="100">
          <template #default="{ row }">¥{{ (row.qty * row.unit_price).toLocaleString() }}</template>
        </el-table-column>
        <el-table-column label="" width="70" v-if="canWork">
          <template #default="{ row }">
            <el-button type="danger" size="small" link @click="delBoq(row.id)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-if="boq.length === 0" description="暂无清单，可按图纸/方案分项录入" :image-size="60" />
    </el-tab-pane>

    <!-- 验收管理 -->
    <el-tab-pane label="验收管理" name="acceptances">
      <div v-if="canWork" style="margin-bottom: 10px">
        <el-space wrap>
          <el-radio-group v-model="accForm.type" size="small">
            <el-radio-button value="stage">阶段验收</el-radio-button>
            <el-radio-button value="final">竣工验收</el-radio-button>
          </el-radio-group>
          <el-input v-model="accForm.name" placeholder="验收名称" style="width: 180px" />
          <el-input v-model="accForm.content" placeholder="验收内容说明" style="width: 220px" />
          <el-button type="primary" size="small" @click="addAcceptance">提交验收申请</el-button>
        </el-space>
      </div>
      <el-timeline>
        <el-timeline-item v-for="a in acceptances" :key="a.id"
          :type="{ pending: 'warning', approved: 'success', rework: 'danger' }[a.status]"
          :timestamp="`${a.created_at} · ${a.type === 'final' ? '竣工验收' : '阶段验收'} · ${a.name}`">
          <div>{{ a.content || '' }}</div>
          <div v-if="a.status === 'rework'" style="color: var(--danger-600); font-size: 12px">整改要求：{{ a.rework_reason }}</div>
          <div v-if="a.status === 'pending' && role === 'owner'" style="margin-top: 4px">
            <el-button type="success" size="small" @click="reviewAcceptance(a, 'approved')">验收通过</el-button>
            <el-button type="danger" size="small" @click="reviewAcceptance(a, 'rework')">退回整改</el-button>
          </div>
        </el-timeline-item>
      </el-timeline>
      <el-empty v-if="acceptances.length === 0" description="暂无验收记录" :image-size="60" />
    </el-tab-pane>

    <!-- 工程文件 -->
    <el-tab-pane label="工程文件" name="files">
      <el-upload v-if="canWork" :action="fileUploadUrl" :headers="uploadHeaders"
        :on-success="onFileUploaded" :on-error="onUploadError" :show-file-list="false" style="margin-bottom: 10px">
        <el-button type="primary" size="small">上传图纸/方案/文档</el-button>
      </el-upload>
      <el-table :data="files" size="small">
        <el-table-column prop="name" label="文件名" min-width="200" />
        <el-table-column prop="size" label="大小" width="100">
          <template #default="{ row }">{{ (row.size / 1024).toFixed(0) }} KB</template>
        </el-table-column>
        <el-table-column prop="created_at" label="上传时间" width="170" />
        <el-table-column label="下载" width="80">
          <template #default="{ row }">
            <el-link type="primary" :href="withToken(row.path)" target="_blank">下载</el-link>
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-if="files.length === 0" description="暂无工程文件" :image-size="60" />
    </el-tab-pane>
  </el-tabs>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Aim } from '@element-plus/icons-vue'
import api from '../api'
import { useUserStore } from '../store'

const props = defineProps({ projectId: { type: [Number, String], required: true } })

const userStore = useUserStore()
const subTab = ref('logs')
const role = ref('viewer')
const noAccess = ref(false)
const canWork = computed(() => role.value === 'owner' || role.value === 'engineer')

const logs = ref([])
const checkins = ref([])
const photos = ref([])
const hidden = ref([])
const materials = ref([])
const boq = ref([])
const boqTotal = ref(0)
const budget = ref(0)
const acceptances = ref([])
const files = ref([])
const photoCategory = ref('construction')

const logForm = reactive({ log_date: new Date().toISOString().slice(0, 10), weather: '', workers_count: 1, content: '' })
const hiddenForm = reactive({ name: '', location_desc: '', content: '' })
const materialForm = reactive({ name: '', spec: '', qty: 1, unit: '', amount: 0, supplier: '' })
const boqForm = reactive({ name: '', unit: '', qty: 1, unit_price: 0 })
const accForm = reactive({ type: 'stage', name: '', content: '' })

const uploadUrl = `/api/projects/${props.projectId}/construction/photos`
const fileUploadUrl = `/api/projects/${props.projectId}/construction/files`
const uploadHeaders = computed(() => ({ Authorization: `Bearer ${localStorage.getItem('accessToken')}` }))

// 施工过程照片/文件目录已加令牌保护，静态访问需追加 ?token=（与认证材料一致）
const withToken = (p) => `${p}?token=${encodeURIComponent(localStorage.getItem('accessToken') || '')}`

const fetchAll = async () => {
  const base = `/projects/${props.projectId}/construction`
  const perm = await api.get(`${base}/logs`).catch(() => null)
  if (!perm || !perm.items) { noAccess.value = true; return }
  noAccess.value = false
  role.value = perm.role || 'viewer'
  try {
    const [ck, ph, hd, mt, bq, ac, fl] = await Promise.all([
      api.get(`${base}/checkins`), api.get(`${base}/photos`), api.get(`${base}/hidden`),
      api.get(`${base}/materials`), api.get(`${base}/boq`), api.get(`${base}/acceptances`),
      api.get(`${base}/files`)
    ])
    logs.value = perm.items
    checkins.value = ck.items
    photos.value = (ph.items || []).map(p => ({ ...p, url: withToken(p.file_path) }))
    hidden.value = hd.items
    materials.value = mt.items
    boq.value = bq.items
    boqTotal.value = bq.boq_total
    budget.value = bq.budget
    acceptances.value = ac.items
    files.value = fl.items
  } catch (e) {
    // 部分模块加载失败时保留日志数据，其余展示为空，错误提示由拦截器给出
  }
}

const addLog = async () => {
  if (!logForm.content.trim()) return ElMessage.warning('请填写施工内容')
  await api.post(`/projects/${props.projectId}/construction/logs`, logForm)
  ElMessage.success('日志已记录')
  logForm.content = ''
  fetchAll()
}

const doCheckin = () => {
  if (!navigator.geolocation) return ElMessage.error('浏览器不支持定位')
  checkinLoading.value = true
  navigator.geolocation.getCurrentPosition(async (pos) => {
    try {
      await api.post(`/projects/${props.projectId}/construction/checkins`, {
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        remark: '现场打卡'
      })
      ElMessage.success('打卡成功')
      fetchAll()
    } catch (e) {
      ElMessage.error(e.response?.data?.error || '打卡失败')
    } finally {
      checkinLoading.value = false
    }
  }, () => {
    checkinLoading.value = false
    ElMessage.error('获取定位失败，请检查浏览器定位权限')
  }, { enableHighAccuracy: true, timeout: 8000 })
}
const checkinLoading = ref(false)

const onPhotoUploaded = (resp) => {
  if (resp.message || resp.count) ElMessage.success('照片已上传')
  fetchAll()
}
const onFileUploaded = (resp) => {
  if (resp.message) ElMessage.success('文件已上传')
  fetchAll()
}
const onUploadError = () => ElMessage.error('上传失败，请检查文件类型与大小（≤20MB）')

// 过程数据导出 CSV（结算/纠纷留证）
const exportingType = ref('')
const exportCsv = async (type) => {
  exportingType.value = type
  try {
    const res = await fetch(`/api/projects/${props.projectId}/construction/export?type=${type}`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('accessToken')}` }
    })
    if (!res.ok) throw new Error('export failed')
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${type}_${props.projectId}_${Date.now()}.csv`
    a.click()
    URL.revokeObjectURL(url)
  } catch (e) {
    ElMessage.error('导出失败（可能暂无数据）')
  } finally {
    exportingType.value = ''
  }
}

const addHidden = async () => {
  if (!hiddenForm.name.trim()) return ElMessage.warning('请填写部位名称')
  await api.post(`/projects/${props.projectId}/construction/hidden`, hiddenForm)
  ElMessage.success('隐蔽工程报验已提交')
  fetchAll()
}

const reviewHidden = async (row, status) => {
  let rework_reason = null
  if (status === 'rework') {
    const { value } = await ElMessageBox.prompt('请填写整改要求', '退回整改')
    rework_reason = value
  }
  await api.put(`/projects/${props.projectId}/construction/hidden/${row.id}/review`, { status, rework_reason })
  ElMessage.success('已处理')
  fetchAll()
}

const addMaterial = async () => {
  if (!materialForm.name.trim()) return ElMessage.warning('请填写材料名称')
  await api.post(`/projects/${props.projectId}/construction/materials`, materialForm)
  ElMessage.success('材料进场已登记')
  materialForm.name = ''; materialForm.spec = ''; materialForm.amount = 0
  fetchAll()
}

const sumMaterial = ({ columns }) => {
  const sums = []
  columns.forEach((col, i) => {
    if (i === 0) { sums[i] = '合计'; return }
    if (col.property === 'amount') {
      sums[i] = '¥' + materials.value.reduce((s, m) => s + (m.amount || 0), 0).toLocaleString()
    } else sums[i] = ''
  })
  return sums
}
const sumBoq = ({ columns }) => {
  const sums = []
  columns.forEach((col, i) => {
    if (i === 0) { sums[i] = '合计'; return }
    if (col.label === '合价') {
      sums[i] = '¥' + boq.value.reduce((s, b) => s + b.qty * b.unit_price, 0).toLocaleString()
    } else sums[i] = ''
  })
  return sums
}

const addBoq = async () => {
  if (!boqForm.name.trim()) return ElMessage.warning('请填写清单项目')
  await api.post(`/projects/${props.projectId}/construction/boq`, boqForm)
  ElMessage.success('清单项已添加')
  boqForm.name = ''
  fetchAll()
}

const delBoq = async (id) => {
  await api.delete(`/projects/${props.projectId}/construction/boq/${id}`)
  fetchAll()
}

const addAcceptance = async () => {
  if (!accForm.name.trim()) return ElMessage.warning('请填写验收名称')
  await api.post(`/projects/${props.projectId}/construction/acceptances`, accForm)
  ElMessage.success('验收申请已提交')
  accForm.name = ''; accForm.content = ''
  fetchAll()
}

const reviewAcceptance = async (a, status) => {
  let rework_reason = null
  if (status === 'rework') {
    const { value } = await ElMessageBox.prompt('请填写整改要求', '退回整改')
    rework_reason = value
  }
  await api.put(`/projects/${props.projectId}/construction/acceptances/${a.id}/review`, { status, rework_reason })
  ElMessage.success('已处理')
  fetchAll()
}

onMounted(fetchAll)
</script>
