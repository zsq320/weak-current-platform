<template>
  <div class="filter-bar">
    <div class="filters"><slot /></div>
    <div class="ops">
      <el-button size="small" @click="$emit('reset')">重置</el-button>
      <el-button type="primary" size="small" @click="$emit('search')">查询</el-button>
    </div>
  </div>
</template>

<script setup>
// 列表筛选条：左侧筛选控件、右侧查询/重置
defineEmits(['search', 'reset'])
</script>

<style scoped>
.filter-bar{
  display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;
  background:#fff;border:1px solid #E2E8F0;border-radius:10px;padding:12px 16px;margin-bottom:14px;
  box-shadow:0 1px 2px rgba(15,42,67,.06);
}
.filters{ display:flex;gap:10px;flex-wrap:wrap;align-items:center;flex:1;min-width:0; }
.ops{ display:flex;gap:8px;flex:none; }
</style>
