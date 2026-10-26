import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import Components from 'unplugin-vue-components/vite'
import { VantResolver } from '@vant/auto-import-resolver'

export default defineConfig(({ mode }) => {
  // Vitest 以 Node ESM 加载依赖，Vant 的样式副作用导入会报 Unknown file extension ".css"。
  // 测试环境关闭自动样式导入（组件渲染不依赖样式）。
  const isTest = mode === 'test'

  return {
    plugins: [
      vue(),
      Components({
        resolvers: [VantResolver({ importStyle: !isTest })],
        dts: 'src/components.d.ts',
      }),
    ],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      port: 5173,
      proxy: {
        '/api': { target: 'http://127.0.0.1:8080', changeOrigin: true },
      },
    },
    preview: {
      port: 4173,
      proxy: {
        '/api': { target: 'http://127.0.0.1:8080', changeOrigin: true },
      },
    },
    build: {
      target: 'es2018',
      manifest: true,
      sourcemap: false,
    },
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./src/tests/setup.ts'],
      css: false,
      restoreMocks: true,
      clearMocks: true,
    },
  }
})
