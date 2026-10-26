import { test } from '@playwright/test';

/**
 * 契约：docs/architecture/v1.0-baby-feeding.md §3.4、§4.7
 * 用例：docs/tests/v1.0.md §9（TZ-01..TZ-06）
 * 状态：TE-01 骨架；TE-02 实现断言。
 */
test.describe('时区与本地日期（TZ）', () => {
  test.skip('TZ-01 +08:00 午夜边界', async () => {});
  test.skip('TZ-02 同一 UTC 时刻、不同偏移 → 不同本地日期', async () => {});
  test.skip('TZ-03 夏令时偏移可用', async () => {});
  test.skip('TZ-04 响应保留原始偏移、审计时间用 UTC', async () => {});
  test.skip('TZ-05 统计按本地日期分组（跨月/跨年）', async () => {});
  test.skip('TZ-06 recordDate 由服务端计算，忽略客户端伪造字段', async () => {});
});
