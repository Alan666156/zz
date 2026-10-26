<script setup lang="ts">
import OfflineBanner from '@/components/common/OfflineBanner.vue'
</script>

<template>
  <div class="layout">
    <div class="layout__banner">
      <OfflineBanner />
    </div>
    <router-view />
    <van-tabbar route fixed placeholder safe-area-inset-bottom data-testid="tabbar">
      <!-- 用 name 匹配：子路由的父记录 path 为 ''（解析成 '/'），用 to="/" 会让首页 Tab 在所有页面恒为 active -->
      <van-tabbar-item replace :to="{ name: 'home' }" data-testid="tabbar-home">首页</van-tabbar-item>
      <van-tabbar-item replace :to="{ name: 'records' }" data-testid="tabbar-records">记录</van-tabbar-item>
      <van-tabbar-item replace :to="{ name: 'stats' }" data-testid="tabbar-stats">统计</van-tabbar-item>
      <van-tabbar-item replace :to="{ name: 'growth' }" data-testid="tabbar-growth">生长</van-tabbar-item>
      <van-tabbar-item replace :to="{ name: 'profile' }" data-testid="tabbar-profile">我的</van-tabbar-item>
    </van-tabbar>
  </div>
</template>

<style scoped>
.layout {
  min-height: 100vh;
}

.layout__banner {
  padding: 0 12px;
}

.layout__banner:empty {
  display: none;
}
</style>
