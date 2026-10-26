import { test } from '@playwright/test';

/**
 * 契约：docs/architecture/v1.0-baby-feeding.md §4.8、§4.5
 * 用例：docs/tests/v1.0.md §11（GROWTH-01..GROWTH-12）
 * 状态：TE-01b 骨架；TE-02 实现断言。
 */
test.describe('生长记录（GROWTH）', () => {
  test.skip('GROWTH-01 创建单指标记录', async () => {});
  test.skip('GROWTH-02 至少提供一项指标', async () => {});
  test.skip('GROWTH-03 指标范围边界', async () => {});
  test.skip('GROWTH-04 小数位与超精度拒绝', async () => {});
  test.skip('GROWTH-05 measuredOn 边界与同日多条（±1 天）', async () => {});
  test.skip('GROWTH-06 相同 id 重复创建幂等', async () => {});
  test.skip('GROWTH-07 列表过滤、排序与跨度', async () => {});
  test.skip('GROWTH-08 latest', async () => {});
  test.skip('GROWTH-09 PATCH 部分更新与“至少一项”约束', async () => {});
  test.skip('GROWTH-10 revision 冲突、删除与幂等', async () => {});
  test.skip('GROWTH-11 跨设备隔离', async () => {});
  test.skip('GROWTH-12 删除宝宝后生长记录不可见', async () => {});
});
