import { test } from '@playwright/test';

/**
 * 契约：docs/architecture/v1.0-baby-feeding.md §2.4
 * 用例：docs/tests/v1.0.md §14（RL-01..RL-06）
 * 状态：TE-01 骨架；TE-02 实现断言。
 *
 * 独立运行（不要与其他 API 用例同轮）：
 *   npm run reset:env
 *   RUN_RATE_LIMIT=1 npx playwright test --project=api api/rate-limit.spec.ts
 */
const runRateLimit = process.env.RUN_RATE_LIMIT === '1';

test.describe('限流（RL）', () => {
  test.skip(!runRateLimit, '设置 RUN_RATE_LIMIT=1 并在运行前重置 Redis DB14');

  test.skip('RL-01 API 设备额度 120 次/分钟', async () => {});
  test.skip('RL-02 设备 init 额度 10 次/小时/IP', async () => {});
  test.skip('RL-03 导出额度 5 次/小时/设备', async () => {});
  test.skip('RL-04 同步额度 30 次/分钟/设备', async () => {});
  test.skip('RL-05 健康检查与 CSV 下载不占设备额度', async () => {});
  test.skip('RL-06 Redis 故障时限流 fail-open（非导出）', async () => {});
});
