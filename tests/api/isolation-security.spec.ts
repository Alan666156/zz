import { test } from '@playwright/test';

/**
 * 契约：docs/architecture/v1.0-baby-feeding.md §2.5、§4.5、§4.6、§4.7、§4.8、§4.9
 * 用例：docs/tests/v1.0.md §15（ISO-01..ISO-05）、§16（SEC-01..SEC-03）
 * 状态：TE-01b 骨架；TE-02 实现断言。
 */
test.describe('设备隔离（ISO）', () => {
  test.skip('ISO-01 列表、统计、趋势不泄露其他设备数据', async () => {});
  test.skip('ISO-02 跨设备单条读取与“不存在”响应完全一致', async () => {});
  test.skip('ISO-03 跨设备创建子资源', async () => {});
  test.skip('ISO-04 跨设备修改/删除', async () => {});
  test.skip('ISO-05 导出只允许本设备宝宝', async () => {});
});

test.describe('安全（SEC）', () => {
  test.skip('SEC-01 宝宝名中的 HTML 原样存储、由前端转义渲染', async () => {});
  test.skip('SEC-02 导出 token 路径穿越/畸形输入', async () => {});
  test.skip('SEC-03 错误响应不泄露内部实现', async () => {});
});
