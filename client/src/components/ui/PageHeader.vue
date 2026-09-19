<template>
  <div class="page-header">
    <div class="left">
      <div v-if="$slots.breadcrumb || breadcrumb" class="bc">
        <slot name="breadcrumb">{{ breadcrumb }}</slot>
      </div>
      <div class="title-row">
        <h2 class="title">{{ title }}</h2>
        <slot name="title-extra" />
      </div>
      <div v-if="$slots.desc || description" class="desc">
        <slot name="desc">{{ description }}</slot>
      </div>
    </div>
    <div class="actions"><slot name="actions" /></div>
  </div>
</template>

<script setup>
// 统一页头：标题 + 面包屑 + 描述 + 操作区
defineProps({ title: String, breadcrumb: String, description: String })
</script>

<style scoped>
.page-header{ display:flex;justify-content:space-between;align-items:flex-end;gap:16px;margin-bottom:16px;flex-wrap:wrap; }
.bc{ font-size:12.5px;color:#94A3B8;margin-bottom:4px; }
.title-row{ display:flex;align-items:center;gap:10px;flex-wrap:wrap; }
.title{ font-size:18px;font-weight:700;color:#0F172A;line-height:1.3; }
.desc{ font-size:12.5px;color:#64748B;margin-top:3px; }
.actions{ display:flex;align-items:center;gap:8px;flex-wrap:wrap; }
</style>
