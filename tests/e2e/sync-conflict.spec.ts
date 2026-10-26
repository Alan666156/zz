import { expect, test } from '@playwright/test';

import {
  expectToast,
  fillMilkAmount,
  onboardWithApi,
  openQuickRecord,
  openRecordEdit,
  openTab,
  pollUntil,
  resetE2eState,
  saveQuickRecord,
  saveRecordEdit,
  selectFeedType,
  setEditAmount,
  waitForFeedingCount,
  waitForToastToHide,
} from './helpers/app';

/**
 * 契约：docs/architecture/v1.0-baby-feeding.md §4.10、§5.4
 * 用例：docs/tests/v1.0.md §18（UI-17）
 * 状态：TE-03 可执行断言。
 */
test.describe('E2E 冲突（UI-17）', () => {
  test.describe.configure({ timeout: 120_000 });

  test.beforeEach(() => {
    resetE2eState();
  });

  test('UI-17 同步冲突：服务端胜出并提示', async ({ page, context, request }) => {
    const { api, baby, today } = await onboardWithApi(page, request);

    // 在线创建 100 ML，确认 rev1。
    await openQuickRecord(page);
    await selectFeedType(page, 'formula');
    await fillMilkAmount(page, 100);
    await saveQuickRecord(page);
    await expectToast(page, '已记录');
    const [created] = await waitForFeedingCount(api, baby.id, today, 1);
    expect(created).toMatchObject({ amountValue: 100, revision: 1 });

    await openTab(page, 'records');
    const item = page.getByTestId('feeding-record-item');
    await expect(item).toHaveCount(1);
    await expect(item).toContainText('100 毫升');

    // 离线编辑为 150（outbox baseRevision=1）。
    await context.setOffline(true);
    const banner = page.getByTestId('offline-banner');
    await expect(banner).toBeVisible({ timeout: 10_000 });
    await openRecordEdit(page);
    await setEditAmount(page, 150);
    await saveRecordEdit(page);
    await expectToast(page, '离线，修改待同步');
    await expect(banner).toContainText('待同步 1 条');
    await waitForToastToHide(page);

    // 另一端点（同设备）把服务端版本改为 200，revision=2。
    const patched = await api.patchFeeding(created.id, {
      baseRevision: 1,
      amountValue: 200,
    });
    expect(patched).toMatchObject({ amountValue: 200, revision: 2 });

    // 恢复网络触发同步：客户端 baseRevision=1 与 rev2 冲突，服务端胜出。
    // 契约文案（docs/tests/v1.0.md UI-17）为“该记录已在其他端更新”。
    // 当前 frontend/src/stores/sync.ts 渲染“1 条记录已在其他端更新”，
    // 此处按契约原文断言，不为了通过而放宽；差异已上报 Lead/architect。
    const conflictToast = expectToast(page, '该记录已在其他端更新', 20_000);
    await context.setOffline(false);
    await conflictToast;

    await expect(item).toContainText('200 毫升', { timeout: 15_000 });

    const final = await pollUntil(
      () => api.listFeedings(baby.id, today),
      (result) =>
        result.items.some(
          (record) =>
            record.id === created.id && record.amountValue === 200 && record.revision === 2,
        ),
      '等待服务端最终值 200 ML / revision=2',
      15_000,
    );
    expect(final.items.filter((record) => !record.deletedAt)).toHaveLength(1);
    expect(final.total).toBe(1);
    expect(final.items.find((record) => record.id === created.id)).toMatchObject({
      feedType: 'FORMULA',
      amountValue: 200,
      amountUnit: 'ML',
      revision: 2,
      deletedAt: null,
    });

    // outbox 清空。
    await expect(banner).toBeHidden({ timeout: 15_000 });
  });
});
