import { expect, test } from '@playwright/test';

import {
  browserYesterday,
  confirmDeleteDialog,
  expectToast,
  fillMilkAmount,
  onboardWithApi,
  openQuickRecord,
  openRecordEdit,
  pollUntil,
  resetE2eState,
  saveQuickRecord,
  saveRecordEdit,
  selectFeedType,
  setEditAmount,
  waitForFeedingCount,
} from './helpers/app';

/**
 * 契约：docs/architecture/v1.0-baby-feeding.md §5.2、§4.6
 * 用例：docs/tests/v1.0.md §18（UI-11）
 * 状态：TE-03 可执行断言。
 */
test.describe('E2E 记录页（UI-11）', () => {
  test.describe.configure({ timeout: 120_000 });

  test.beforeEach(() => {
    resetE2eState();
  });

  test('UI-11 记录页：按日期回溯、编辑、删除', async ({ page, request }) => {
    const { api, baby, today } = await onboardWithApi(page, request);
    const yesterday = await browserYesterday(page);
    const beforeYesterday = await new Date(Date.parse(`${yesterday}T00:00:00Z`) - 86_400_000)
      .toISOString()
      .slice(0, 10);

    // 昨天一条：API 造数，确保可控地回溯。
    const seeded = await api.createFeeding({
      babyId: baby.id,
      feedType: 'FORMULA',
      amountValue: 100,
      amountUnit: 'ML',
      startedAt: `${yesterday}T10:00:00+08:00`,
      endedAt: null,
      tzOffsetMinutes: 480,
    });
    expect(seeded.recordDate).toBe(yesterday);

    // 今天一条：走 UI 快速记录。
    await openQuickRecord(page);
    await selectFeedType(page, 'formula');
    await fillMilkAmount(page, 120);
    await saveQuickRecord(page);
    await expectToast(page, '已记录');
    await waitForFeedingCount(api, baby.id, today, 1);
    await waitForFeedingCount(api, baby.id, yesterday, 1);

    // 进入记录页：默认今天，只显示今天的记录。
    await page.getByTestId('tabbar-records').click();
    await expect(page.getByTestId('records-page')).toBeVisible();
    await expect(page.getByTestId('records-date-label')).toHaveText('今天');

    const items = page.getByTestId('feeding-record-item');
    await expect(items).toHaveCount(1);
    await expect(items.first()).toContainText('120 毫升');
    await expect(page.getByTestId('records-page')).not.toContainText('100 毫升');

    // 回溯到昨天：只显示昨天记录。
    await page.getByTestId('records-date-prev').click();
    await expect(page.getByTestId('records-date-label')).toHaveText('昨天');
    await expect(items).toHaveCount(1);
    await expect(items.first()).toContainText('100 毫升');
    await expect(page.getByTestId('records-page')).not.toContainText('120 毫升');

    // 再回溯一天：空日期显示空状态。
    await page.getByTestId('records-date-prev').click();
    await expect(page.getByTestId('records-date-label')).toHaveText(
      new RegExp(formatMonthDay(beforeYesterday)),
    );
    await expect(page.getByTestId('records-page')).toContainText('这一天没有记录');

    // 回到昨天并编辑奶量。
    await page.getByTestId('records-date-next').click();
    await expect(page.getByTestId('records-date-label')).toHaveText('昨天');
    await expect(items).toHaveCount(1);

    await openRecordEdit(page);
    await setEditAmount(page, 150);
    await saveRecordEdit(page);
    await expectToast(page, '已保存');
    await expect(items.first()).toContainText('150 毫升');

    const edited = await pollUntil(
      () => api.listFeedings(baby.id, yesterday),
      (result) =>
        result.items.some(
          (record) =>
            record.id === seeded.id && record.revision === 2 && record.amountValue === 150,
        ),
      '等待昨天记录编辑同步（revision=2，amount=150）',
    );
    const editedRecord = edited.items.find((record) => record.id === seeded.id);
    expect(editedRecord).toMatchObject({
      amountValue: 150,
      amountUnit: 'ML',
      revision: 2,
      deletedAt: null,
    });

    // 删除需二次确认，确认后列表移除、在线 GET 返回 404。
    await page.getByTestId('record-delete').first().click();
    const dialog = confirmDeleteDialog(page, '删除后无法恢复');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('确认删除这条喂养记录吗？');
    await dialog.getByRole('button', { name: '删除', exact: true }).click();
    await expectToast(page, '已删除');
    await expect(page.getByTestId('records-page')).toContainText('这一天没有记录');

    const afterDelete = await pollUntil(
      () => api.raw('GET', `/feeding-records/${seeded.id}`),
      (result) => result.status === 404,
      '等待删除同步后 GET by id 返回 404',
    );
    expect(afterDelete.body.code).toBe('NOT_FOUND');

    // 今天的统计不受昨天记录删除影响。
    const todayStats = await api.dailyStats(baby.id, today);
    expect(todayStats.feedingCount).toBe(1);

    await page.getByTestId('records-date-next').click();
    await expect(page.getByTestId('records-date-label')).toHaveText('今天');
    await expect(items).toHaveCount(1);
    await expect(items.first()).toContainText('120 毫升');
  });
});

/** DateNavigator 对非今天/昨天显示 “M 月 D 日 周X”。 */
function formatMonthDay(date: string): string {
  const [, month, day] = date.split('-').map(Number);
  return `${month} 月 ${day} 日`;
}
