import { defineConfig, devices } from '@playwright/test';

/**
 * 婴儿喂养 App V1.0 验收测试配置（TE-01 骨架）。
 *
 * 设计约束（见 docs/tests/v1.0.md §2）：
 * - 使用本机 Chrome：channel: 'chrome'，不下载 Chromium。
 * - E2E baseURL: http://127.0.0.1:4173（vite preview）。
 * - API baseURL: http://127.0.0.1:8080。
 * - 数据隔离：MySQL zz_e2e + Redis DB 14；运行前 npm run reset:env。
 * - workers=1 / fullyParallel=false：限流、清库、同步锁用例需要确定性。
 */

const API_BASE_URL = process.env.API_BASE_URL ?? 'http://127.0.0.1:8080';
const WEB_BASE_URL = process.env.WEB_BASE_URL ?? 'http://127.0.0.1:4173';
const isCI = !!process.env.CI;

export default defineConfig({
  testDir: '.',
  testMatch: ['api/**/*.spec.ts', 'e2e/**/*.spec.ts'],
  testIgnore: ['**/node_modules/**', '**/test-results/**', '**/playwright-report/**'],
  fullyParallel: false,
  workers: 1,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  outputDir: 'test-results',
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
  ],
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 10_000,
    navigationTimeout: 20_000,
    locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai',
    acceptDownloads: true,
  },
  projects: [
    {
      name: 'api',
      testMatch: /api[\\/].*\.spec\.ts$/,
      use: {
        baseURL: API_BASE_URL,
        extraHTTPHeaders: {
          'X-Client-Version': '1.0.0-e2e',
        },
      },
    },
    {
      name: 'e2e',
      testMatch: /e2e[\\/].*\.spec\.ts$/,
      use: {
        ...devices['Pixel 5'],
        channel: 'chrome',
        baseURL: WEB_BASE_URL,
        deviceScaleFactor: 2,
      },
    },
  ],
});
