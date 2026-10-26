import { expect, test } from '@playwright/test';

import {
  confirmDeleteDialog,
  expectToast,
  fillMilkAmount,
  onboardWithApi,
  openQuickRecord,
  openTab,
  pollUntil,
  resetE2eState,
  saveQuickRecord,
  selectFeedType,
  waitForFeedingCount,
} from './helpers/app';
import { uuid } from '../api/helpers/fixtures';

/**
 * 契约：docs/architecture/v1.0-baby-feeding.md §4.5、§5.2
 * 用例：docs/tests/v1.0.md §18（UI-18）
 * 状态：TE-03 可执行断言。
 */
test.describe('E2E 多宝宝（UI-18）', () => {
  test.describe.configure({ timeout: 150_000 });

  test.beforeEach(() => {
    resetE2eState();
  });

  test('UI-18 多宝宝切换、上限与删除默认', async ({ page, request }) => {
    const { api, baby: first, today } = await onboardWithApi(page, request, {
      name: '小满',
      birthDate: '2025-01-01',
    });

    // B1 一条记录，用于验证宝宝间数据不混合。
    await openQuickRecord(page);
    await selectFeedType(page, 'formula');
    await fillMilkAmount(page, 120);
    await saveQuickRecord(page);
    await expectToast(page, '已记录');
    await waitForFeedingCount(api, first.id, today, 1);

    await openTab(page, 'profile');
    await expect(page.getByTestId('profile-baby-row')).toHaveCount(1);

    // UI 新增 B2（第二条走完整 UI 流程）。
    await page.getByTestId('profile-add-baby').click();
    await expect(page).toHaveURL(/\/baby\/new$/);
    await page.getByTestId('baby-form-name').fill('小海');
    await page.getByTestId('baby-form-gender-male').click();
    await page.getByTestId('baby-form-birth-date').fill('2025-02-02');
    await page.getByTestId('baby-form-submit').click();
    await expectToast(page, '宝宝已添加');
    await expect(page).toHaveURL(/\/profile$/);
    await expect(page.getByTestId('profile-baby-row')).toHaveCount(2);

    // B3-B5 用 API 补齐到上限，再刷新读取服务端列表。
    const extras = [
      { id: uuid(), name: '三宝', gender: 'MALE' as const, birthDate: '2025-03-03' },
      { id: uuid(), name: '四宝', gender: 'FEMALE' as const, birthDate: '2025-04-04' },
      { id: uuid(), name: '五宝', gender: 'UNKNOWN' as const, birthDate: '2025-05-05' },
    ];
    for (const extra of extras) {
      await api.createBaby({ ...extra, isDefault: false });
    }
    await page.reload();
    await expect(page.getByTestId('profile-baby-row')).toHaveCount(5);
    await expect(page.getByTestId('profile-add-baby')).toBeDisabled();
    await expect(page.getByTestId('profile-add-baby')).toHaveText('已达 5 个宝宝上限');

    // 第 6 个：直接进入新增页应被拦截并提示上限，服务端仍 5 个。
    const limitToast = expectToast(page, '最多只能添加 5 个宝宝', 15_000);
    await page.goto('/baby/new');
    await limitToast;
    await expect(page).toHaveURL(/\/profile$/);
    const five = await api.listBabies();
    expect(five).toHaveLength(5);

    // 宝宝间数据隔离：B1 有 120 ML，B2 无记录。
    await openTab(page, 'home');
    await expect(page.getByTestId('baby-card')).toContainText('小满');
    await expect(page.getByTestId('feeding-record-item')).toHaveCount(1);
    await expect(page.getByTestId('summary-feed-count')).toHaveText('1');
    await expect(page.getByTestId('summary-total-amount')).toHaveText('120');

    await page.getByTestId('baby-card').click();
    await expect(page.getByTestId('baby-switcher-item').filter({ hasText: '小海' })).toBeVisible();
    await page.getByTestId('baby-switcher-item').filter({ hasText: '小海' }).click();
    await expect(page.getByTestId('baby-card')).toContainText('小海');
    await expect(page.getByTestId('feeding-timeline')).toContainText('今天还没有记录');
    await expect(page.getByTestId('feeding-record-item')).toHaveCount(0);
    await expect(page.getByTestId('summary-feed-count')).toHaveText('0');

    await page.getByTestId('baby-card').click();
    await page.getByTestId('baby-switcher-item').filter({ hasText: '小满' }).click();
    await expect(page.getByTestId('baby-card')).toContainText('小满');
    await expect(page.getByTestId('feeding-record-item')).toHaveCount(1);
    await expect(page.getByTestId('summary-feed-count')).toHaveText('1');

    // 删除默认宝宝 B1：需二次确认并提示级联删除记录。
    await openTab(page, 'profile');
    const firstRow = page.getByTestId('profile-baby-row').filter({ hasText: '小满' });
    await expect(firstRow).toContainText('默认');
    await firstRow.getByTestId('profile-delete-baby').click();
    const dialog = confirmDeleteDialog(page, '喂养与生长记录也会一并删除');
    await expect(dialog).toBeVisible();
    await dialog.getByTestId('confirm-delete').click();
    await expectToast(page, '已删除');

    const remaining = await pollUntil(
      () => api.listBabies(),
      (babies) => babies.length === 4 && !babies.some((item) => item.id === first.id),
      '等待默认宝宝删除同步',
      15_000,
    );
    expect(remaining.filter((item) => item.isDefault)).toHaveLength(1);
    const promoted = remaining.find((item) => item.isDefault);
    expect(promoted?.name, '最早创建的剩余宝宝应成为默认').toBe('小海');

    await expect(page.getByTestId('profile-baby-row')).toHaveCount(4);
    await expect(page.getByTestId('profile-baby-row').filter({ hasText: '小满' })).toHaveCount(0);
    await expect(
      page.getByTestId('profile-baby-row').filter({ hasText: '小海' }),
    ).toContainText('默认');

    await openTab(page, 'home');
    await expect(page.getByTestId('baby-card')).toContainText('小海');
  });
});
