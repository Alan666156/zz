<template>
  <div class="layout">
    <router-view />
    <van-tabbar route fixed placeholder safe-area-inset-bottom>
      <van-tabbar-item replace to="/">首页</van-tabbar-item>
      <van-tabbar-item replace to="/records">记录</van-tabbar-item>
      <van-tabbar-item replace to="/stats">统计</van-tabbar-item>
      <van-tabbar-item replace to="/growth">生长</van-tabbar-item>
      <van-tabbar-item replace to="/profile">我的</van-tabbar-item>
    </van-tabbar>
  </div>
</template>

<style scoped>
.layout {
  min-height: 100vh;
}
</style>
