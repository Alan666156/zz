import { expect, test } from '@playwright/test';

import {
  SYNC_LOCK_KEY,
  browserToday,
  editAmountInput,
  expectToast,
  fillMilkAmount,
  onboardWithApi,
  openQuickRecord,
  openRecordEdit,
  openTab,
  pollUntil,
  readLocalStorage,
  resetE2eState,
  saveQuickRecord,
  saveRecordEdit,
  selectFeedType,
  setEditAmount,
  waitForFeedingCount,
  waitForToastToHide,
} from './helpers/app';
import { collectPageErrors, expectNoPageErrors } from './helpers/page';

/**
 * 契约：docs/architecture/v1.0-baby-feeding.md §5.4、§4.10
 * 用例：docs/tests/v1.0.md §18（UI-15、UI-16）
 * 状态：TE-03 可执行断言。
 */
test.describe('E2E 离线（UI-15..16）', () => {
  test.describe.configure({ timeout: 120_000 });

  test.beforeEach(() => {
    resetE2eState();
  });

  test('UI-15 离线创建 → 待同步横幅 → 恢复自动同步', async ({ page, context, request }) => {
    const errors = collectPageErrors(page);
    const { api, baby, today } = await onboardWithApi(page, request);
    expect(today).toBe(await browserToday(page));

    await context.setOffline(true);
    const banner = page.getByTestId('offline-banner');
    await expect(banner).toBeVisible({ timeout: 10_000 });
    await expect(banner).toContainText('当前离线，记录会先保存在本机，联网后自动同步');

    await openQuickRecord(page);
    await selectFeedType(page, 'formula');
    await fillMilkAmount(page, 100);
    await saveQuickRecord(page);
    await expectToast(page, '已记录');

    await expect(banner).toContainText('待同步 1 条');
    expect(await readLocalStorage(page, SYNC_LOCK_KEY)).toBeNull();

    // 独立 API 上下文不受浏览器离线影响，确认后端尚未收到记录。
    const beforeSync = await api.listFeedings(baby.id, today);
    expect(beforeSync.items.filter((item) => !item.deletedAt)).toHaveLength(0);

    await context.setOffline(false);
    const synced = await pollUntil(
      () => api.listFeedings(baby.id, today),
      (result) => result.items.filter((item) => !item.deletedAt).length === 1,
      '恢复网络后 10 秒内应自动同步 1 条记录',
      15_000,
    );
    expect(synced.items[0]).toMatchObject({
      feedType: 'FORMULA',
      amountValue: 100,
      amountUnit: 'ML',
      breastSide: null,
      recordDate: today,
      revision: 1,
      deletedAt: null,
    });

    await expect(banner).toBeHidden({ timeout: 15_000 });
    await expect(page.getByTestId('feeding-record-item')).toHaveCount(1);
    await expect(page.getByTestId('feeding-record-item')).toContainText('100 毫升');
    expect(await readLocalStorage(page, SYNC_LOCK_KEY)).toBeNull();

    expectNoPageErrors(errors);
  });

  test('UI-16 离线编辑折叠为一条', async ({ page, context, request }) => {
    const errors = collectPageErrors(page);
    const { api, baby, today } = await onboardWithApi(page, request);
    const banner = page.getByTestId('offline-banner');

    await context.setOffline(true);
    await expect(banner).toBeVisible({ timeout: 10_000 });

    await openQuickRecord(page);
    await selectFeedType(page, 'formula');
    await fillMilkAmount(page, 100);
    await saveQuickRecord(page);
    await expectToast(page, '已记录');
    await expect(banner).toContainText('待同步 1 条');

    await openTab(page, 'records');
    const item = page.getByTestId('feeding-record-item');
    await expect(item).toHaveCount(1, { timeout: 10_000 });
    await expect(item).toContainText('100 毫升');

    // 第一次离线编辑：100 → 110。
    await openRecordEdit(page);
    await setEditAmount(page, 110);
    await saveRecordEdit(page);
    await expectToast(page, '离线，修改待同步');
    await expect(banner).toContainText('待同步 1 条');
    await expect(item).toContainText('110 毫升');
    await waitForToastToHide(page);

    // 第二次离线编辑：110 → 120，仍应折叠为同一条待同步记录。
    await openRecordEdit(page);
    await expect(editAmountInput(page)).toHaveValue('110');
    await setEditAmount(page, 120);
    await saveRecordEdit(page);
    await expectToast(page, '离线，修改待同步');
    await expect(banner).toContainText('待同步 1 条');
    await expect(item).toContainText('120 毫升');

    await context.setOffline(false);
    const synced = await waitForFeedingCount(api, baby.id, today, 1, 15_000);
    expect(synced).toHaveLength(1);
    expect(synced[0]).toMatchObject({
      feedType: 'FORMULA',
      amountValue: 120,
      amountUnit: 'ML',
      revision: 1,
      recordDate: today,
    });
    const all = await api.listFeedings(baby.id, today);
    expect(all.total).toBe(1);
    expect(all.items).toHaveLength(1);

    await expect(banner).toBeHidden({ timeout: 15_000 });
    await expect(item).toHaveCount(1);
    await expect(item).toContainText('120 毫升');

    expectNoPageErrors(errors);
  });
});
