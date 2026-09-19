// Copyright (c) 2026 ZSQ320
// weak-current-platform is licensed under Mulan PSL v2.
// You can use this software according to the terms and conditions of the Mulan PSL v2.
// You may obtain a copy of Mulan PSL v2 at:
//          http://license.coscl.org.cn/MulanPSL2
// THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY
// KIND, EITHER EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO
// NON-INFRINGEMENT, MERCHANTABILITY OR FIT FOR A PARTICULAR PURPOSE.
// See the Mulan PSL v2 for more details.
<template>
  <div id="app">
    <Navbar v-if="!isAuthPage" />
    <div class="main-container" :class="{ 'full-bleed': isAuthPage }">
      <router-view />
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import Navbar from './components/Navbar.vue'

// 登录/注册页全屏沉浸式：隐藏顶部导航、容器全出血
const route = useRoute()
const isAuthPage = computed(() => ['/login', '/register'].includes(route.path))
</script>

<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: 'PingFang SC', 'Microsoft YaHei', 'Segoe UI', sans-serif; background: #F4F6FA; color: #334155; }
.main-container { max-width: 1200px; margin: 0 auto; padding: 20px; min-height: calc(100vh - 60px); }
.main-container.full-bleed { max-width: none; padding: 0; margin: 0; min-height: 100vh; }

/* ============ 移动端全局适配 ============ */
@media (max-width: 768px) {
  .main-container { padding: 12px; }

  /* 对话框不超屏 */
  .el-dialog {
    width: 92% !important;
    max-width: 92vw !important;
    margin-top: 6vh !important;
  }
  .el-message-box { width: 90vw !important; max-width: 90vw !important; }

  /* 表格紧凑，内部横向滚动 */
  .el-table { font-size: 13px; }
  .el-table .cell { padding: 0 6px; }

  /* 描述列表标签不换行挤压 */
  .el-descriptions__label { min-width: 72px; }

  /* 表单元素占满宽度 */
  .el-form-item .el-input-number, .el-form-item .el-cascader, .el-form-item .el-date-editor {
    width: 100% !important;
  }

  /* 分页组件换行居中 */
  .el-pagination { flex-wrap: wrap; justify-content: center; row-gap: 6px; }

  /* 消息提示不超屏 */
  .el-message { max-width: 90vw; }
}
</style>
