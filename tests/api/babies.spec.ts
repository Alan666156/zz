import { test } from '@playwright/test';

/**
 * 契约：docs/architecture/v1.0-baby-feeding.md §4.5、§4.3、§3.4
 * 用例：docs/tests/v1.0.md §7（BABY-01..BABY-17）
 * 状态：TE-01b 骨架；TE-02 实现断言。
 */
test.describe('宝宝档案（BABY）', () => {
  test.skip('BABY-01 创建第一个宝宝自动成为默认', async () => {});
  test.skip('BABY-02 名称去空格与 Unicode 长度边界', async () => {});
  test.skip('BABY-03 相同 id 重复创建幂等', async () => {});
  test.skip('BABY-04 性别默认值与非法枚举', async () => {});
  test.skip('BABY-05 出生日期边界（UTC + ±1 天容差）', async () => {});
  test.skip('BABY-06 最多 5 个宝宝', async () => {});
  test.skip('BABY-07 默认宝宝切换是原子的', async () => {});
  test.skip('BABY-08 列表排序、排除已删除、设备隔离', async () => {});
  test.skip('BABY-09 读取单个宝宝与跨设备 404', async () => {});
  test.skip('BABY-10 PATCH 部分更新与 revision 递增', async () => {});
  test.skip('BABY-11 PATCH baseRevision 冲突', async () => {});
  test.skip('BABY-12 试图取消唯一默认宝宝', async () => {});
  test.skip('BABY-13 缺少 baseRevision 或类型非法', async () => {});
  test.skip('BABY-14 删除宝宝级联软删除', async () => {});
  test.skip('BABY-15 删除幂等与默认宝宝重新指派', async () => {});
  test.skip('BABY-16 跨设备修改/删除 404', async () => {});
  test.skip('BABY-17 宝宝 id 由客户端生成且不回写替换', async () => {});
});
