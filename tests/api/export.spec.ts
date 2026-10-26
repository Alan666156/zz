import { test } from '@playwright/test';

/**
 * 契约：docs/architecture/v1.0-baby-feeding.md §4.9、§2.5
 * 用例：docs/tests/v1.0.md §12（EXP-01..EXP-12）
 * 状态：TE-01b 骨架；TE-02 实现断言。
 */
test.describe('CSV 导出（EXP）', () => {
  test.skip('EXP-01 申请导出返回签名下载信息', async () => {});
  test.skip('EXP-02 下载 CSV 不需要设备头且响应头精确', async () => {});
  test.skip('EXP-03 BOM、CRLF 与表头', async () => {});
  test.skip('EXP-04 数据行内容、中文标签与排序', async () => {});
  test.skip('EXP-05 CSV 引号、逗号、换行转义', async () => {});
  test.skip('EXP-06 公式注入转义', async () => {});
  test.skip('EXP-07 空结果仍返回表头', async () => {});
  test.skip('EXP-08 导出只含指定宝宝未删除记录；已删除宝宝 404', async () => {});
  test.skip('EXP-09 导出参数校验与设备归属', async () => {});
  test.skip('EXP-10 token 篡改与过期（测试密钥自签 canonical）', async () => {});
  test.skip('EXP-11 token payload 不含原始设备 ID', async () => {});
  test.skip('EXP-12 超过 10,000 行拒绝导出', async () => {});
});
