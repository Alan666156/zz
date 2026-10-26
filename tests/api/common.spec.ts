import { test } from '@playwright/test';

/**
 * 契约：docs/architecture/v1.0-baby-feeding.md §4.1、§4.2、§4.3、§4.12、§2.5
 * 用例：docs/tests/v1.0.md §5（GEN-01..GEN-11）
 * 状态：TE-01 骨架；TE-02 实现断言。
 */
test.describe('API 通用协议（GEN）', () => {
  test.skip('GEN-01 成功响应包、requestId 回写与安全响应头', async () => {});
  test.skip('GEN-02 错误响应包结构与字段错误', async () => {});
  test.skip('GEN-03 未携带 X-Request-Id 时服务端生成', async () => {});
  test.skip('GEN-04 X-API-Version 与未知 JSON 字段忽略', async () => {});
  test.skip('GEN-05 非法 JSON 与错误 Content-Type', async () => {});
  test.skip('GEN-06 请求体超过 1 MB', async () => {});
  test.skip('GEN-07 分页默认值与 size 上限', async () => {});
  test.skip('GEN-08 ID 必须是 UUID v4 小写', async () => {});
  test.skip('GEN-09 CORS 白名单与预检', async () => {});
  test.skip('GEN-10 未知路由与不存在资源', async () => {});
  test.skip('GEN-11 SQL 注入式参数不导致 500', async () => {});
});
