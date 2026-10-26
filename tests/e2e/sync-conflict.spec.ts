import { expect, test } from '@playwright/test';

import {
  confirmDeleteDialog,
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
import { collectPageErrors, expectNoPageErrors } from './helpers/page';

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

  /**
   * N-1：离线删除宝宝时，该宝宝名下的离线记录必须挂起，不能先被推成 REJECTED；
   * 删除同步遇到 409 时宝宝恢复，记录缓存与 outbox 保留，随后记录继续同步。
   */
  test('UI-23 离线删除宝宝冲突恢复：宝宝恢复且离线记录继续同步', async ({
    page,
    context,
    request,
  }) => {
    // 被挂起的记录要等下一轮同步（30 秒定时或下一次触发），给足等待时间。
    test.setTimeout(180_000);
    const errors = collectPageErrors(page);
    const { api, baby, today } = await onboardWithApi(page, request, {
      name: '小满',
      birthDate: '2026-03-01',
    });
    const banner = page.getByTestId('offline-banner');

    // 在线预载档案页，避免离线导航触发未下载路由错误（Q-24）。
    await openTab(page, 'profile');
    await expect(page.getByTestId('profile-baby-row')).toHaveCount(1);
    await openTab(page, 'home');

    await context.setOffline(true);
    await expect(banner).toBeVisible({ timeout: 10_000 });

    // 离线创建一条记录（revision=0，outbox 中同时存在 FEEDING 与后续 BABY DELETE）。
    await openQuickRecord(page);
    await selectFeedType(page, 'formula');
    await fillMilkAmount(page, 100);
    await saveQuickRecord(page);
    await expectToast(page, '已记录');
    await expect(banner).toContainText('待同步 1 条');
    await waitForToastToHide(page);

    // 离线删除宝宝：本地立即移除，BABY DELETE 进入 outbox。
    await openTab(page, 'profile');
    const row = page.getByTestId('profile-baby-row').filter({ hasText: '小满' });
    await row.getByTestId('profile-delete-baby').click();
    const dialog = confirmDeleteDialog(page, '喂养与生长记录也会一并删除');
    await expect(dialog).toBeVisible();
    await dialog.getByTestId('confirm-delete').click();
    await expectToast(page, '已删除');
    await expect(page.getByTestId('profile-baby-row')).toHaveCount(0, {
      timeout: 10_000,
    });

    // 另一端点更新宝宝到 revision=2，使挂起的 BABY DELETE(baseRevision=1) 冲突。
    const patched = await api.patchBaby(baby.id, {
      baseRevision: 1,
      name: '小满改',
    });
    expect(patched).toMatchObject({ name: '小满改', revision: 2 });

    const conflictToast = expectToast(page, '该记录已在其他端更新', 20_000);
    await context.setOffline(false);
    await conflictToast;

    // 服务端胜出：宝宝恢复（rev2 名称），离线记录未被 REJECTED，继续同步成功。
    await expect(page.getByTestId('profile-baby-row')).toHaveCount(1, {
      timeout: 15_000,
    });
    await expect(
      page.getByTestId('profile-baby-row').filter({ hasText: '小满改' }),
    ).toBeVisible();

    const synced = await pollUntil(
      () => api.listFeedings(baby.id, today),
      (result) =>
        result.items.filter((item) => !item.deletedAt).length === 1 &&
        result.items[0].amountValue === 100 &&
        result.items[0].revision === 1,
      '宝宝删除冲突恢复后，离线创建的记录应继续同步为 100 ML / revision=1',
      45_000,
    );
    expect(synced.total).toBe(1);
    expect(synced.items[0]).toMatchObject({
      babyId: baby.id,
      amountValue: 100,
      revision: 1,
      deletedAt: null,
    });

    await expect(banner).toBeHidden({ timeout: 60_000 });
    await openTab(page, 'home');
    await expect(page.getByTestId('baby-card')).toContainText('小满改');
    await expect(page.getByTestId('feeding-record-item')).toHaveCount(1);
    await expect(page.getByTestId('feeding-record-item')).toContainText('100 毫升');

    expectNoPageErrors(errors);
  });
});
