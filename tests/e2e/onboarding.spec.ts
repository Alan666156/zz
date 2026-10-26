import { test } from '@playwright/test';

/**
 * 契约：docs/architecture/v1.0-baby-feeding.md §5.2、§5.4、§4.4、§4.5
 * 用例：docs/tests/v1.0.md §18（UI-01..UI-03）
 * 状态：TE-01b 骨架；TE-03 实现断言。
 */
test.describe('E2E 首次使用（UI-01..03）', () => {
  test.skip('UI-01 首次打开：设备初始化 + 创建宝宝 + 首页', async () => {});
  test.skip('UI-02 刷新后设备与默认宝宝保持', async () => {});
  test.skip('UI-03 跳过昵称使用默认“宝宝”', async () => {});
});
