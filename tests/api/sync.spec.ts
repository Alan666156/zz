import { test } from '@playwright/test';

/**
 * 契约：docs/architecture/v1.0-baby-feeding.md §4.10、§2.4
 * 用例：docs/tests/v1.0.md §13（SYNC-01..SYNC-16）
 * 状态：TE-01b 骨架；TE-02 实现断言。
 */
test.describe('离线批量同步（SYNC）', () => {
  test.skip('SYNC-01 批量创建宝宝与喂养记录', async () => {});
  test.skip('SYNC-02 相同 batchId + 相同请求体回放', async () => {});
  test.skip('SYNC-03 相同 batchId + 不同请求体', async () => {});
  test.skip('SYNC-04 UPSERT baseRevision=0 且服务端已存在', async () => {});
  test.skip('SYNC-05 UPSERT baseRevision 等于当前 revision', async () => {});
  test.skip('SYNC-06 UPSERT baseRevision 不匹配 → 服务端胜出', async () => {});
  test.skip('SYNC-07 DELETE 服务端不存在', async () => {});
  test.skip('SYNC-08 DELETE baseRevision 匹配', async () => {});
  test.skip('SYNC-09 DELETE baseRevision 不匹配', async () => {});
  test.skip('SYNC-10 引用不可见宝宝 → 单条 REJECTED，整批 200', async () => {});
  test.skip('SYNC-11 单条校验失败不影响其他条', async () => {});
  test.skip('SYNC-12 同一批次重复 (entityType,id)', async () => {});
  test.skip('SYNC-13 changes 数量与 batchId 校验', async () => {});
  test.skip('SYNC-14 跨设备 id 不得被修改', async () => {});
  test.skip('SYNC-15 clientTime 不参与冲突裁决', async () => {});
  test.skip('SYNC-16 同步批次锁（确定性预占）', async () => {});
  test.skip('SYNC-17 已 tombstone 记录：DELETE 幂等、UPSERT 永不复活', async () => {});
});
