<template>
  <div class="project-detail" v-if="project">
    <div class="detail-header">
      <div class="dh-left">
        <el-button link @click="router.back()">← 返回</el-button>
        <h2 class="dh-title">{{ project.title }} <StatusTag kind="project" :status="project.status" /></h2>
        <div class="dh-meta">
          {{ project.location || '未填写地点' }} · 预算 <AmountText :value="project.budget" /> · 截止 {{ project.deadline || '未设置' }} · {{ bids.length || project.bid_count || 0 }} 份投标
        </div>
      </div>
      <div class="dh-actions">
        <el-button v-if="isOwner && project.status === 'bidding'" type="success" @click="startProject">开始工程</el-button>
        <el-button v-if="isOwner && project.status === 'in_progress'" type="success" @click="completeProject">完成工程</el-button>
        <el-button v-if="canBid" type="primary" @click="showBidForm = true">立即投标</el-button>
      </div>
    </div>

    <el-row :gutter="24" style="margin-top: 20px">
      <el-col :xs="24" :md="16">
        <!-- 标签页切换 -->
        <el-tabs v-model="activeTab" class="detail-tabs">
          <!-- 工程详情标签 -->
          <el-tab-pane label="工程详情" name="detail">
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
              <el-descriptions :column="isMobile ? 1 : 2" border>
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
                <h4>
                  工程描述
                  <el-button v-if="isOwner" type="primary" size="small" link style="margin-left: 8px" @click="openDescDialog">编辑</el-button>
                </h4>
                <p>{{ project.description || '暂无描述' }}</p>
              </div>
            </el-card>

            <!-- 投标列表 -->
            <el-card style="margin-top: 16px" v-if="isOwner || bids.length > 0">
              <template #header>
                <div class="card-header-row">
                  <span>投标列表 ({{ bids.length }})</span>
                  <div>
                    <el-select v-model="bidSortField" size="small" style="width: 120px; margin-right: 8px">
                      <el-option label="按时间" value="created_at" />
                      <el-option label="按报价" value="price" />
                      <el-option label="按评分" value="total_score" />
                    </el-select>
                    <el-button size="small" @click="toggleSortOrder">
                      {{ bidSortOrder === 'desc' ? '降序' : '升序' }}
                    </el-button>
                  </div>
                </div>
              </template>
              <el-table :data="bids" style="width: 100%" @sort-change="handleSortChange">
                <el-table-column prop="username" label="工程师" width="120" />
                <el-table-column prop="real_name" label="真实姓名" width="100">
                  <template #default="{ row }">
                    {{ row.real_name || '-' }}
                  </template>
                </el-table-column>
                <el-table-column label="报价" width="130" sortable="custom" prop="price">
                  <template #default="{ row }">
                    <span style="color: #f56c6c; font-weight: bold">¥{{ row.price?.toLocaleString() }}</span>
                  </template>
                </el-table-column>
                <el-table-column label="工期" width="80">
                  <template #default="{ row }">
                    {{ row.duration ? `${row.duration}${row.duration_unit === 'days' ? '天' : row.duration_unit === 'weeks' ? '周' : '月'}` : '-' }}
                  </template>
                </el-table-column>
                <el-table-column label="经验" width="60">
                  <template #default="{ row }">
                    {{ row.experience_years ? `${row.experience_years}年` : '-' }}
                  </template>
                </el-table-column>
                <el-table-column prop="message" label="方案概述" min-width="150" show-overflow-tooltip />
                <el-table-column label="评分" width="80" sortable="custom" prop="total_score">
                  <template #default="{ row }">
                    <el-tag v-if="row.total_score > 0" :type="row.total_score >= 80 ? 'success' : row.total_score >= 60 ? '' : 'warning'">
                      {{ row.total_score }}
                    </el-tag>
                    <span v-else style="color: #909399">未评</span>
                  </template>
                </el-table-column>
                <el-table-column prop="status" label="状态" width="100">
                  <template #default="{ row }">
                    <el-tag :type="row.status === 'accepted' ? 'success' : row.status === 'rejected' ? 'danger' : 'warning'">
                      {{ { pending: '待定', accepted: '已中标', rejected: '已拒绝' }[row.status] }}
                    </el-tag>
                  </template>
                </el-table-column>
                <el-table-column label="操作" width="200" v-if="isOwner">
                  <template #default="{ row }">
                    <el-button v-if="row.status === 'pending'" type="success" size="small" @click="acceptBid(row.id)">接受</el-button>
                    <el-button v-if="row.status === 'pending'" type="warning" size="small" @click="openScoreDialog(row)">评分</el-button>
                    <el-button v-if="row.status === 'pending'" type="danger" size="small" @click="rejectBid(row.id)">拒绝</el-button>
                  </template>
                </el-table-column>
              </el-table>
            </el-card>
          </el-tab-pane>

          <!-- 进度管理标签 -->
          <el-tab-pane name="progress" v-if="project.status === 'in_progress' || project.status === 'completed'">
            <template #label>
              <span>
                进度管理
                <el-badge v-if="progressStats.overdue > 0" :value="progressStats.overdue" type="danger" style="margin-left: 5px" />
              </span>
            </template>

            <!-- 进度统计卡片 -->
            <el-row :gutter="14" style="margin-bottom: 14px">
              <el-col :xs="12" :sm="12" :md="6">
                <StatCard icon="📊" icon-bg="#EFF5FF" icon-color="#2563EB" :value="progressStats.overall_progress + '%'" label="总体进度" />
              </el-col>
              <el-col :xs="12" :sm="12" :md="6">
                <StatCard icon="📋" icon-bg="#F0F9FF" icon-color="#0EA5E9" :value="taskStats.total" label="任务总数" />
              </el-col>
              <el-col :xs="12" :sm="12" :md="6">
                <StatCard icon="✅" icon-bg="#F0FDF4" icon-color="#16A34A" :value="taskStats.completed" label="已完成" />
              </el-col>
              <el-col :xs="12" :sm="12" :md="6">
                <StatCard icon="⏰" icon-bg="#FEF2F2" icon-color="#DC2626" :value="taskStats.overdue" label="已逾期" />
              </el-col>
            </el-row>

            <!-- 甘特图区域 -->
            <el-card style="margin-bottom: 16px">
              <template #header>
                <div class="card-header-row">
                  <span>项目进度甘特图</span>
                  <el-button type="primary" size="small" @click="refreshProgress" :loading="progressLoading">
                    <el-icon><Refresh /></el-icon> 刷新
                  </el-button>
                </div>
              </template>
              <div ref="ganttChart" class="gantt-chart"></div>
            </el-card>

            <!-- 任务和里程碑管理 -->
            <el-row :gutter="16">
              <!-- 任务列表 -->
              <el-col :xs="24" :md="14">
                <el-card>
                  <template #header>
                    <div class="card-header-row">
                      <span>任务列表 ({{ tasks.length }})</span>
                      <el-button v-if="isOwner" type="primary" size="small" @click="showTaskDialog()">
                        <el-icon><Plus /></el-icon> 新建任务
                      </el-button>
                    </div>
                  </template>
                  <el-table :data="tasks" style="width: 100%" max-height="400">
                    <el-table-column prop="name" label="任务名称" min-width="150" />
                    <el-table-column prop="assignee_name" label="负责人" width="100">
                      <template #default="{ row }">
                        {{ row.assignee_real_name || row.assignee_name || '未分配' }}
                      </template>
                    </el-table-column>
                    <el-table-column prop="status" label="状态" width="100">
                      <template #default="{ row }">
                        <el-tag :type="taskStatusType(row.status)" size="small">
                          {{ taskStatusText(row.status) }}
                        </el-tag>
                      </template>
                    </el-table-column>
                    <el-table-column prop="progress" label="进度" width="120">
                      <template #default="{ row }">
                        <el-progress
                          :percentage="row.progress"
                          :stroke-width="8"
                          :color="row.progress === 100 ? '#67c23a' : row.end_date && new Date(row.end_date) < new Date() ? '#f56c6c' : '#409eff'"
                        />
                      </template>
                    </el-table-column>
                    <el-table-column prop="end_date" label="截止日期" width="110">
                      <template #default="{ row }">
                        <span :class="{ 'text-danger': isOverdue(row) }">
                          {{ row.end_date || '未设置' }}
                        </span>
                      </template>
                    </el-table-column>
                    <el-table-column label="操作" width="120" v-if="isOwner">
                      <template #default="{ row }">
                        <el-button type="primary" size="small" link @click="showTaskDialog(row)">编辑</el-button>
                        <el-button type="danger" size="small" link @click="deleteTask(row.id)">删除</el-button>
                      </template>
                    </el-table-column>
                  </el-table>
                </el-card>
              </el-col>

              <!-- 里程碑列表 -->
              <el-col :xs="24" :md="10">
                <el-card>
                  <template #header>
                    <div class="card-header-row">
                      <span>里程碑 ({{ milestones.length }})</span>
                      <el-button v-if="isOwner" type="primary" size="small" @click="showMilestoneDialog()">
                        <el-icon><Plus /></el-icon> 新建
                      </el-button>
                    </div>
                  </template>
                  <el-timeline>
                    <el-timeline-item
                      v-for="m in milestones"
                      :key="m.id"
                      :type="milestoneStatusType(m.status)"
                      :timestamp="m.due_date || '未设置'"
                      placement="top"
                    >
                      <el-card shadow="hover" size="small">
                        <div class="milestone-content">
                          <div class="milestone-header">
                            <span class="milestone-name">{{ m.name }}</span>
                            <el-tag :type="milestoneStatusType(m.status)" size="small">
                              {{ milestoneStatusText(m.status) }}
                            </el-tag>
                          </div>
                          <p v-if="m.description" class="milestone-desc">{{ m.description }}</p>
                          <el-alert
                            v-if="m.alert"
                            :title="m.alert.message"
                            :type="m.alert.type"
                            show-icon
                            :closable="false"
                            style="margin-top: 8px; padding: 4px 8px"
                          />
                          <div v-if="isOwner" class="milestone-actions">
                            <el-button type="primary" size="small" link @click="showMilestoneDialog(m)">编辑</el-button>
                            <el-button type="danger" size="small" link @click="deleteMilestone(m.id)">删除</el-button>
                          </div>
                        </div>
                      </el-card>
                    </el-timeline-item>
                  </el-timeline>
                  <el-empty v-if="milestones.length === 0" description="暂无里程碑" />
                </el-card>
              </el-col>
            </el-row>
          </el-tab-pane>

          <el-tab-pane label="进度管理" name="progress-locked" v-else>
            <el-empty description="项目进行中才能查看进度管理">
              <el-tag type="info">请先将项目状态切换为"进行中"</el-tag>
            </el-empty>
          </el-tab-pane>

          <!-- 施工过程管理（所有者/中标工程师） -->
          <el-tab-pane label="施工管理" name="construction" v-if="showConstruction">
            <ConstructionPanel :project-id="route.params.id" />
          </el-tab-pane>

          <!-- 双方沟通 -->
          <el-tab-pane label="沟通" name="chat" v-if="userStore.isLoggedIn && (['in_progress', 'completed'].includes(project?.status) || isOwner)">
            <ChatPanel :project-id="route.params.id" />
          </el-tab-pane>
        </el-tabs>
      </el-col>

      <el-col :xs="24" :md="8">
        <!-- 投标按钮 -->
        <el-card v-if="canBid">
          <template #header><span>参与投标</span></template>
          <p style="color: #909399; margin-bottom: 16px">
            您可以参与此工程的投标，请填写详细的报价、工期和资质信息。
          </p>
          <el-button type="primary" @click="showBidForm = true" style="width: 100%" size="large">
            <el-icon><Edit /></el-icon>
            立即投标
          </el-button>
        </el-card>

        <!-- 未实名认证提示 -->
        <el-card v-if="userStore.isLoggedIn && !isVerified && !isOwner && project?.status === 'bidding'">
          <template #header><span>参与投标</span></template>
          <el-alert
            type="warning"
            title="需要实名认证"
            show-icon
            :closable="false"
            style="margin-bottom: 16px"
          >
            <template #default>
              <p>参与投标前需要完成实名认证。</p>
            </template>
          </el-alert>
          <el-button type="primary" @click="router.push('/profile')" style="width: 100%" size="large">
            前往认证
          </el-button>
        </el-card>

        <!-- 工程操作 -->
        <el-card style="margin-top: 16px" v-if="isOwner">
          <template #header><span>工程操作</span></template>
          <el-space direction="vertical" fill style="width: 100%">
            <el-button v-if="project.status === 'bidding'" type="success" @click="startProject" style="width: 100%">开始工程</el-button>
            <el-button v-if="project.status === 'in_progress'" type="success" @click="completeProject" style="width: 100%">完成工程</el-button>
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

    <!-- 任务编辑对话框 -->
    <el-dialog v-model="taskDialogVisible" :title="editingTask ? '编辑任务' : '新建任务'" width="500px">
      <el-form :model="taskForm" label-width="80px">
        <el-form-item label="任务名称" required>
          <el-input v-model="taskForm.name" placeholder="请输入任务名称" />
        </el-form-item>
        <el-form-item label="任务描述">
          <el-input v-model="taskForm.description" type="textarea" :rows="3" placeholder="请输入任务描述" />
        </el-form-item>
        <el-form-item label="负责人">
          <el-select
            v-model="taskForm.assignee_id"
            clearable
            filterable
            placeholder="选择负责人（可选）"
            style="width: 100%"
          >
            <el-option
              v-for="u in assigneeOptions"
              :key="u.id"
              :label="u.label"
              :value="u.id"
            />
          </el-select>
        </el-form-item>
        <el-row :gutter="16">
          <el-col :xs="24" :md="12">
            <el-form-item label="开始日期">
              <el-date-picker v-model="taskForm.start_date" type="date" placeholder="选择日期" style="width: 100%" value-format="YYYY-MM-DD" />
            </el-form-item>
          </el-col>
          <el-col :xs="24" :md="12">
            <el-form-item label="截止日期">
              <el-date-picker v-model="taskForm.end_date" type="date" placeholder="选择日期" style="width: 100%" value-format="YYYY-MM-DD" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="16">
          <el-col :xs="24" :md="12">
            <el-form-item label="优先级">
              <el-select v-model="taskForm.priority" style="width: 100%">
                <el-option label="低" value="low" />
                <el-option label="普通" value="normal" />
                <el-option label="高" value="high" />
                <el-option label="紧急" value="urgent" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :xs="24" :md="12">
            <el-form-item label="状态">
              <el-select v-model="taskForm.status" style="width: 100%">
                <el-option label="待开始" value="pending" />
                <el-option label="进行中" value="in_progress" />
                <el-option label="已完成" value="completed" />
                <el-option label="已取消" value="cancelled" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="进度">
          <el-slider v-model="taskForm.progress" :marks="{ 0: '0%', 50: '50%', 100: '100%' }" show-input />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="taskDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="saveTask" :loading="taskSaving">确定</el-button>
      </template>
    </el-dialog>

    <!-- 里程碑编辑对话框 -->
    <el-dialog v-model="milestoneDialogVisible" :title="editingMilestone ? '编辑里程碑' : '新建里程碑'" width="500px">
      <el-form :model="milestoneForm" label-width="80px">
        <el-form-item label="里程碑名称" required>
          <el-input v-model="milestoneForm.name" placeholder="请输入里程碑名称" />
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="milestoneForm.description" type="textarea" :rows="3" placeholder="请输入描述" />
        </el-form-item>
        <el-form-item label="目标日期">
          <el-date-picker v-model="milestoneForm.due_date" type="date" placeholder="选择日期" style="width: 100%" value-format="YYYY-MM-DD" />
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="milestoneForm.status" style="width: 100%">
            <el-option label="待开始" value="pending" />
            <el-option label="进行中" value="in_progress" />
            <el-option label="已完成" value="completed" />
            <el-option label="已延期" value="delayed" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="milestoneDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="saveMilestone" :loading="milestoneSaving">确定</el-button>
      </template>
    </el-dialog>

    <!-- 工程描述编辑对话框 -->
    <el-dialog v-model="descDialogVisible" title="编辑工程描述" width="560px">
      <el-form label-width="80px">
        <el-form-item label="工程描述">
          <el-input
            v-model="descForm.description"
            type="textarea"
            :rows="8"
            maxlength="5000"
            show-word-limit
            placeholder="请输入工程描述（支持换行）"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="descDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="descSaving" @click="saveDescription">保存</el-button>
      </template>
    </el-dialog>

    <!-- 多步投标表单 -->
    <BidForm
      v-model="showBidForm"
      :project-id="project?.id"
      :project-budget="project?.budget"
      @success="fetchProject"
    />

    <!-- 评分对话框 -->
    <BidScoreDialog
      v-model="showScoreDialog"
      :bid="scoringBid"
      :project-id="project?.id"
      @success="fetchProject"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useUserStore } from '../store'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Refresh, Plus, Edit } from '@element-plus/icons-vue'
import BidForm from '../components/BidForm.vue'
import BidScoreDialog from '../components/BidScoreDialog.vue'
import ConstructionPanel from '../components/ConstructionPanel.vue'
import StatCard from '../components/ui/StatCard.vue'
import StatusTag from '../components/ui/StatusTag.vue'
import AmountText from '../components/ui/AmountText.vue'
import ChatPanel from '../components/ChatPanel.vue'
import echarts from '../utils/echarts'
import api from '../api'

const route = useRoute()
const router = useRouter()
const userStore = useUserStore()
const project = ref(null)
const bids = ref([])
const reviewForm = ref({ rating: 5, comment: '' })
const myContract = ref(null)
const activeTab = ref('detail')

// 投标相关
const showBidForm = ref(false)
const showScoreDialog = ref(false)
const scoringBid = ref(null)
const bidSortField = ref('created_at')
const bidSortOrder = ref('desc')

// 进度管理相关
const tasks = ref([])
const milestones = ref([])
const taskStats = ref({ total: 0, pending: 0, in_progress: 0, completed: 0, overdue: 0, overall_progress: 0 })
const progressStats = computed(() => ({
  ...taskStats.value,
  overall_progress: tasks.value.length > 0
    ? Math.round(tasks.value.reduce((sum, t) => sum + (t.progress || 0), 0) / tasks.value.length)
    : 0
}))
const progressLoading = ref(false)
const ganttChart = ref(null)
let ganttChartInstance = null

// 任务对话框
const taskDialogVisible = ref(false)
const editingTask = ref(null)
const taskSaving = ref(false)
const taskForm = ref({
  name: '',
  description: '',
  assignee_id: null,
  start_date: '',
  end_date: '',
  status: 'pending',
  progress: 0,
  priority: 'normal'
})

// 里程碑对话框
const milestoneDialogVisible = ref(false)
const editingMilestone = ref(null)
const milestoneSaving = ref(false)
const milestoneForm = ref({
  name: '',
  description: '',
  due_date: '',
  status: 'pending'
})

// 移动端检测（描述列表单列显示）
const isMobile = ref(window.innerWidth < 768)
const handleIsMobileResize = () => { isMobile.value = window.innerWidth < 768 }
window.addEventListener('resize', handleIsMobileResize)
onBeforeUnmount(() => window.removeEventListener('resize', handleIsMobileResize))

const statusMap = {
  pending: { text: '待发布', type: 'info' },
  bidding: { text: '招标中', type: 'success' },
  in_progress: { text: '进行中', type: 'warning' },
  completed: { text: '已完成', type: '' },
  cancelled: { text: '已取消', type: 'danger' }
}

const statusText = computed(() => statusMap[project.value?.status]?.text)
const statusType = computed(() => statusMap[project.value?.status]?.type)
const isOwner = computed(() => userStore.user?.id === project.value?.user_id || userStore.user?.role === 'admin')
const isVerified = computed(() => !!userStore.user?.real_name_verified)
// 施工管理标签：所有者/管理员可见；工程师在工程进行中可见（由后端按中标关系授权操作）
const showConstruction = computed(() => isOwner.value
  || ['in_progress', 'completed'].includes(project.value?.status))
// has_bid 由服务端针对当前登录工程师返回，用于防止重复投标
const canBid = computed(() => userStore.isLoggedIn && isVerified.value && !isOwner.value
  && project.value?.status === 'bidding' && !project.value?.has_bid
  && !bids.value.some(b => b.engineer_id === userStore.user?.id))

// 负责人候选：参与投标的工程师 + 项目发布者自己
const assigneeOptions = computed(() => {
  const map = new Map()
  bids.value.forEach(b => {
    if (b.engineer_id) {
      map.set(b.engineer_id, {
        id: b.engineer_id,
        label: b.real_name ? `${b.real_name}（${b.username}）` : b.username
      })
    }
  })
  if (userStore.user && project.value) {
    map.set(userStore.user.id, {
      id: userStore.user.id,
      label: userStore.user.real_name ? `${userStore.user.real_name}（${userStore.user.username}）` : userStore.user.username
    })
  }
  return [...map.values()]
})

// 工程描述编辑
const descDialogVisible = ref(false)
const descSaving = ref(false)
const descForm = ref({ description: '' })

const openDescDialog = () => {
  descForm.value.description = project.value?.description || ''
  descDialogVisible.value = true
}

const saveDescription = async () => {
  if (!descForm.value.description.trim()) {
    return ElMessage.warning('描述不能为空')
  }
  descSaving.value = true
  try {
    await api.put(`/projects/${project.value.id}`, { description: descForm.value.description })
    ElMessage.success('描述已更新')
    descDialogVisible.value = false
    await fetchProject()
  } catch (e) {
    ElMessage.error(e.response?.data?.error || '保存失败')
  } finally {
    descSaving.value = false
  }
}
const canReview = computed(() => {
  if (!userStore.isLoggedIn || !myContract.value || project.value?.status !== 'completed') return false
  return true
})

// 任务状态
const taskStatusText = (status) => ({
  pending: '待开始',
  in_progress: '进行中',
  completed: '已完成',
  cancelled: '已取消'
}[status] || status)

const taskStatusType = (status) => ({
  pending: 'info',
  in_progress: 'warning',
  completed: 'success',
  cancelled: 'danger'
}[status] || 'info')

// 里程碑状态
const milestoneStatusText = (status) => ({
  pending: '待开始',
  in_progress: '进行中',
  completed: '已完成',
  delayed: '已延期'
}[status] || status)

const milestoneStatusType = (status) => ({
  pending: 'info',
  in_progress: 'warning',
  completed: 'success',
  delayed: 'danger'
}[status] || 'info')

// 检查是否逾期
const isOverdue = (task) => {
  if (task.status === 'completed' || !task.end_date) return false
  return new Date(task.end_date) < new Date()
}

// 获取项目详情
const fetchProject = async () => {
  try {
    const res = await api.get(`/projects/${route.params.id}`)
    project.value = res
    bids.value = res.bids || []

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

// 获取任务列表
const fetchTasks = async () => {
  try {
    const res = await api.get(`/projects/${route.params.id}/tasks`)
    tasks.value = res.tasks || []
    taskStats.value = res.stats || {}
    await nextTick()
    updateGanttChart()
  } catch (e) {
    console.error('获取任务列表失败:', e)
  }
}

// 获取里程碑列表
const fetchMilestones = async () => {
  try {
    const res = await api.get(`/projects/${route.params.id}/milestones`)
    milestones.value = res.milestones || []
  } catch (e) {
    console.error('获取里程碑列表失败:', e)
  }
}

// 排序处理
const handleSortChange = ({ prop, order }) => {
  bidSortField.value = prop || 'created_at'
  bidSortOrder.value = order === 'ascending' ? 'asc' : 'desc'
  fetchBidsWithSort()
}

const toggleSortOrder = () => {
  bidSortOrder.value = bidSortOrder.value === 'desc' ? 'asc' : 'desc'
  fetchBidsWithSort()
}

const fetchBidsWithSort = async () => {
  try {
    const res = await api.get(`/bids/project/${route.params.id}`, {
      params: { sort: bidSortField.value, order: bidSortOrder.value }
    })
    bids.value = res.bids || []
  } catch (e) {
    console.error('获取投标列表失败:', e)
  }
}

// 打开评分对话框
const openScoreDialog = (bid) => {
  scoringBid.value = bid
  showScoreDialog.value = true
}

// 刷新进度数据
const refreshProgress = async () => {
  progressLoading.value = true
  await Promise.all([fetchTasks(), fetchMilestones()])
  await nextTick()
  updateGanttChart()
  progressLoading.value = false
}

// 更新甘特图
const updateGanttChart = () => {
  if (!ganttChart.value) return

  if (!ganttChartInstance) {
    ganttChartInstance = echarts.init(ganttChart.value, 'app')
  }
  // 切换标签页后容器才可见，先 resize 保证画布尺寸正确
  ganttChartInstance.resize()

  // 无任务时显示占位提示
  if (tasks.value.length === 0) {
    ganttChartInstance.clear()
    ganttChartInstance.setOption({
      title: {
        text: '暂无任务，请先创建任务',
        left: 'center',
        top: 'middle',
        textStyle: { color: '#909399', fontSize: 14, fontWeight: 'normal' }
      }
    })
    return
  }

  // 时间域取任务/里程碑/项目日期的并集，避免条形被裁切
  const dates = [project.value?.created_at?.split(' ')[0], project.value?.deadline]
    .filter(Boolean)
  tasks.value.forEach(t => {
    if (t.start_date) dates.push(t.start_date)
    if (t.end_date) dates.push(t.end_date)
  })
  milestones.value.forEach(m => {
    if (m.due_date) dates.push(m.due_date)
  })
  const parsed = dates.map(d => new Date(d).getTime()).filter(t => !Number.isNaN(t))
  // 至少留出 7 天跨度，避免单日任务宽度为 0
  const minTime = parsed.length ? Math.min(...parsed) : Date.now()
  const maxTime = parsed.length ? Math.max(...parsed) + 7 * 24 * 60 * 60 * 1000 : Date.now() + 7 * 24 * 60 * 60 * 1000

  const categories = tasks.value.map(t => t.name)
  const data = tasks.value.map((task, index) => {
    const start = task.start_date || new Date(minTime).toISOString().split('T')[0]
    const end = task.end_date || new Date(maxTime).toISOString().split('T')[0]
    let color = '#409eff'

    if (task.status === 'completed') color = '#67c23a'
    else if (isOverdue(task)) color = '#f56c6c'
    else if (task.status === 'in_progress') color = '#e6a23c'

    return {
      name: task.name,
      value: [index, start, end, task.progress],
      itemStyle: { color }
    }
  })

  const milestoneLines = milestones.value
    .filter(m => m.due_date)
    .map(m => ({
      xAxis: m.due_date,
      lineStyle: { color: m.status === 'completed' ? '#67c23a' : '#e6a23c', type: 'dashed', width: 2 },
      label: {
        formatter: `◆ ${m.name}`,
        position: 'insideEndTop',
        color: m.status === 'completed' ? '#67c23a' : '#e6a23c',
        fontSize: 11
      },
      emphasis: { disabled: false }
    }))

  const priorityText = { low: '低', normal: '普通', high: '高', urgent: '紧急' }

  const option = {
    title: {
      text: '任务进度甘特图',
      left: 'center',
      textStyle: { fontSize: 14 }
    },
    tooltip: {
      formatter: function (params) {
        const task = tasks.value[params.value[0]]
        if (!task) return ''
        return `
          <strong>${task.name}</strong><br/>
          状态: ${taskStatusText(task.status)}<br/>
          优先级: ${priorityText[task.priority] || '普通'}<br/>
          负责人: ${task.assignee_real_name || task.assignee_name || '未分配'}<br/>
          进度: ${task.progress}%<br/>
          开始: ${task.start_date || '未设置'}<br/>
          结束: ${task.end_date || '未设置'}
        `
      }
    },
    grid: {
      left: '3%',
      right: '4%',
      top: 50,
      bottom: '3%',
      containLabel: true
    },
    xAxis: {
      type: 'time',
      min: minTime,
      max: maxTime
    },
    yAxis: {
      type: 'category',
      data: categories,
      inverse: true
    },
    series: [{
      type: 'custom',
      renderItem: function (params, api) {
        const categoryIndex = api.value(0)
        const start = api.coord([api.value(1), categoryIndex])
        const end = api.coord([api.value(2), categoryIndex])
        const height = api.size([0, 1])[1] * 0.6

        return {
          type: 'rect',
          shape: {
            x: start[0],
            y: start[1] - height / 2,
            width: Math.max(end[0] - start[0], 2),
            height: height,
            r: 4
          },
          style: api.style()
        }
      },
      encode: {
        x: [1, 2],
        y: 0
      },
      // 里程碑以竖直虚线标注在图上
      markLine: milestoneLines.length > 0 ? {
        symbol: 'none',
        silent: false,
        data: milestoneLines
      } : undefined,
      data: data
    }]
  }

  ganttChartInstance.setOption(option, true)
}

// 显示任务对话框
const showTaskDialog = (task = null) => {
  editingTask.value = task
  if (task) {
    taskForm.value = { ...task }
  } else {
    taskForm.value = {
      name: '',
      description: '',
      assignee_id: null,
      start_date: '',
      end_date: '',
      status: 'pending',
      progress: 0,
      priority: 'normal'
    }
  }
  taskDialogVisible.value = true
}

// 保存任务
const saveTask = async () => {
  if (!taskForm.value.name) {
    return ElMessage.warning('请输入任务名称')
  }
  if (taskForm.value.start_date && taskForm.value.end_date
    && taskForm.value.end_date < taskForm.value.start_date) {
    return ElMessage.warning('截止日期不能早于开始日期')
  }
  taskSaving.value = true
  try {
    const payload = {
      ...taskForm.value,
      assignee_id: taskForm.value.assignee_id ? Number(taskForm.value.assignee_id) : null
    }
    if (editingTask.value) {
      await api.put(`/projects/${route.params.id}/tasks/${editingTask.value.id}`, payload)
      ElMessage.success('任务更新成功')
    } else {
      await api.post(`/projects/${route.params.id}/tasks`, payload)
      ElMessage.success('任务创建成功')
    }
    taskDialogVisible.value = false
    await fetchTasks()
  } catch (e) {
    ElMessage.error(e.response?.data?.error || '操作失败')
  } finally {
    taskSaving.value = false
  }
}

// 删除任务
const deleteTask = async (taskId) => {
  try {
    await ElMessageBox.confirm('确定删除此任务？', '确认')
    await api.delete(`/projects/${route.params.id}/tasks/${taskId}`)
    ElMessage.success('删除成功')
    await fetchTasks()
  } catch (e) {
    if (e !== 'cancel') {
      ElMessage.error(e.response?.data?.error || '删除失败')
    }
  }
}

// 显示里程碑对话框
const showMilestoneDialog = (milestone = null) => {
  editingMilestone.value = milestone
  if (milestone) {
    milestoneForm.value = { ...milestone }
  } else {
    milestoneForm.value = {
      name: '',
      description: '',
      due_date: '',
      status: 'pending'
    }
  }
  milestoneDialogVisible.value = true
}

// 保存里程碑
const saveMilestone = async () => {
  if (!milestoneForm.value.name) {
    return ElMessage.warning('请输入里程碑名称')
  }
  milestoneSaving.value = true
  try {
    if (editingMilestone.value) {
      await api.put(`/projects/${route.params.id}/milestones/${editingMilestone.value.id}`, milestoneForm.value)
      ElMessage.success('里程碑更新成功')
    } else {
      await api.post(`/projects/${route.params.id}/milestones`, milestoneForm.value)
      ElMessage.success('里程碑创建成功')
    }
    milestoneDialogVisible.value = false
    await fetchMilestones()
  } catch (e) {
    ElMessage.error(e.response?.data?.error || '操作失败')
  } finally {
    milestoneSaving.value = false
  }
}

// 删除里程碑
const deleteMilestone = async (milestoneId) => {
  try {
    await ElMessageBox.confirm('确定删除此里程碑？', '确认')
    await api.delete(`/projects/${route.params.id}/milestones/${milestoneId}`)
    ElMessage.success('删除成功')
    await fetchMilestones()
  } catch (e) {
    if (e !== 'cancel') {
      ElMessage.error(e.response?.data?.error || '删除失败')
    }
  }
}

// 开始工程
const startProject = async () => {
  try {
    await ElMessageBox.confirm('确定开始此工程？', '确认')
    await api.put(`/projects/${project.value.id}`, { status: 'in_progress' })
    ElMessage.success('工程已开始')
    await fetchProject()
  } catch (e) {}
}

// 完成工程
const completeProject = async () => {
  try {
    await ElMessageBox.confirm('确定完成此工程？', '确认')
    await api.put(`/projects/${project.value.id}`, { status: 'completed' })
    ElMessage.success('工程已完成')
    await fetchProject()
  } catch (e) {}
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

// 监听标签切换，加载进度数据
watch(activeTab, (newVal) => {
  if (newVal === 'progress') {
    refreshProgress()
  }
})

// 窗口大小变化时重绘图表
const handleChartResize = () => {
  if (ganttChartInstance) {
    ganttChartInstance.resize()
  }
}
window.addEventListener('resize', handleChartResize)

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleChartResize)
  if (ganttChartInstance) {
    ganttChartInstance.dispose()
    ganttChartInstance = null
  }
})

onMounted(async () => {
  await fetchProject()
  // 如果是进行中或已完成的项目，预加载进度数据
  if (project.value?.status === 'in_progress' || project.value?.status === 'completed') {
    await refreshProgress()
  }
})
</script>

<style scoped>
.detail-header{
  background:#fff;border:1px solid #E2E8F0;border-radius:10px;padding:16px 20px;margin-bottom:16px;
  display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap;
  box-shadow:0 1px 2px rgba(15,42,67,.06);
}
.dh-left{ min-width:0; }
.dh-title{ font-size:18px;font-weight:700;color:#0F172A;display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:0 0 4px; }
.dh-meta{ font-size:12.5px;color:#64748B; }
.dh-actions{ display:flex;gap:8px;flex-wrap:wrap; }
.detail-tabs .el-tabs__header{ background:transparent; border:none; margin-bottom:14px; }
.detail-tabs .el-tabs__item{ font-size:14.5px; }
.page-title { font-size: 18px; font-weight: bold; }
.card-header-row { display: flex; justify-content: space-between; align-items: center; }
.description { margin-top: 20px; }
.description h4 { margin-bottom: 8px; color: #303133; }
.description p { color: #606266; line-height: 1.8; white-space: pre-wrap; }

.stat-card {
  text-align: center;
}
.stat-value {
  font-size: 28px;
  font-weight: bold;
  color: #303133;
}
.stat-label {
  font-size: 12px;
  color: #909399;
  margin: 8px 0;
}

.gantt-chart {
  width: 100%;
  height: 300px;
}

.milestone-content {
  padding: 4px 0;
}
.milestone-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.milestone-name {
  font-weight: bold;
  color: #303133;
}
.milestone-desc {
  color: #909399;
  font-size: 12px;
  margin: 4px 0 0;
}
.milestone-actions {
  margin-top: 8px;
  display: flex;
  gap: 8px;
}

.text-danger {
  color: #f56c6c;
  font-weight: bold;
}
</style>
