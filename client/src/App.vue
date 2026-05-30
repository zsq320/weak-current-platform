<template>
  <div id="app">
    <Navbar />
    <div class="main-container">
      <router-view />
    </div>
  </div>
</template>

<script setup>
import Navbar from './components/Navbar.vue'
</script>

<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: 'Microsoft YaHei', sans-serif; background: #f5f7fa; }
.main-container { max-width: 1200px; margin: 0 auto; padding: 20px; min-height: calc(100vh - 60px); }
</style>
