import { test } from '@playwright/test';

/**
 * 契约：docs/architecture/v1.0-baby-feeding.md §4.6、§4.3、§3.4
 * 用例：docs/tests/v1.0.md §8（FEED-01..FEED-24）
 * 状态：TE-01 骨架；TE-02 实现断言。
 */
test.describe('喂养记录（FEED）', () => {
  test.skip('FEED-01 创建母乳记录（精确响应）', async () => {});
  test.skip('FEED-02 创建配方奶记录', async () => {});
  test.skip('FEED-03 创建混合记录', async () => {});
  test.skip('FEED-04 创建辅食记录', async () => {});
  test.skip('FEED-05 相同 id 重复创建幂等', async () => {});
  test.skip('FEED-06 母乳校验矩阵', async () => {});
  test.skip('FEED-07 配方奶校验矩阵', async () => {});
  test.skip('FEED-08 混合校验矩阵', async () => {});
  test.skip('FEED-09 辅食校验矩阵', async () => {});
  test.skip('FEED-10 时间格式：必须带偏移', async () => {});
  test.skip('FEED-11 startedAt 不得晚于服务端当前时间 +5 分钟', async () => {});
  test.skip('FEED-12 startedAt 不得早于宝宝出生日期（本地日期）', async () => {});
  test.skip('FEED-13 endedAt 校验', async () => {});
  test.skip('FEED-14 备注与标签校验', async () => {});
  test.skip('FEED-15 babyId 不存在或不属于当前设备', async () => {});
  test.skip('FEED-16 GET by id 返回 tombstone', async () => {});
  test.skip('FEED-17 按本地日期回溯', async () => {});
  test.skip('FEED-18 from/to 闭区间与跨度上限', async () => {});
  test.skip('FEED-19 日期参数互斥、类型过滤与分页', async () => {});
  test.skip('FEED-20 PATCH 部分更新与合并后重校验', async () => {});
  test.skip('FEED-21 PATCH revision 冲突', async () => {});
  test.skip('FEED-22 删除记录：软删除、幂等、冲突', async () => {});
  test.skip('FEED-23 数值精度：amountValue 最多 1 位小数', async () => {});
  test.skip('FEED-24 非法 feedType', async () => {});
});
