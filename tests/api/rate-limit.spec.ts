import { test } from '@playwright/test';
import {
  RATE_LIMIT_API_PER_MINUTE,
  RATE_LIMIT_EXPORT_PER_HOUR,
  RATE_LIMIT_INIT_PER_HOUR,
  RATE_LIMIT_SYNC_PER_MINUTE,
  RUN_RATE_LIMIT,
} from './helpers/env';

/**
 * 契约：docs/architecture/v1.0-baby-feeding.md §2.4、addendum Q-12/Q-18
 * 用例：docs/tests/v1.0.md §14（RL-01..RL-06）
 * 状态：TE-01b 骨架；TE-02 实现断言。
 *
 * 独立运行（不要与其他 API 用例同轮），后端必须使用同一组低阈值环境变量启动：
 *   npm run reset:env
 *   APP_RATE_LIMIT_API_PER_MINUTE=5 APP_RATE_LIMIT_INIT_PER_HOUR=3 \
 *   APP_RATE_LIMIT_EXPORT_PER_HOUR=2 APP_RATE_LIMIT_SYNC_PER_MINUTE=3 \
 *   RUN_RATE_LIMIT=1 npm run test:rate-limit
 */
test.describe('限流（RL）', () => {
  test.skip(!RUN_RATE_LIMIT, '设置 RUN_RATE_LIMIT=1 并使用低阈值上下文，运行前重置 Redis DB14');

  test.skip(`RL-01 API 设备额度与限流响应头（N=${RATE_LIMIT_API_PER_MINUTE}）`, async () => {});
  test.skip(`RL-02 设备 init 额度（按 IP，M=${RATE_LIMIT_INIT_PER_HOUR}）`, async () => {});
  test.skip(`RL-03 导出额度（按设备，E=${RATE_LIMIT_EXPORT_PER_HOUR}）`, async () => {});
  test.skip(`RL-04 同步额度（按设备，S=${RATE_LIMIT_SYNC_PER_MINUTE}）`, async () => {});
  test.skip('RL-05 健康检查与 CSV 下载不占设备额度', async () => {});
  test.skip('RL-06 Redis 故障时限流 fail-open（非导出）', async () => {});
});
