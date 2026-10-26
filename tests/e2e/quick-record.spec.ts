import { expect, test } from '@playwright/test';

import {
  breastSideButton,
  expectToast,
  fillMilkAmount,
  onboardWithApi,
  openQuickRecord,
  resetE2eState,
  saveQuickRecord,
  selectFeedType,
  waitForFeedingCount,
} from './helpers/app';

/**
 * 契约：docs/architecture/v1.0-baby-feeding.md §3.3、§4.6、§5.2、§5.5
 * 用例：docs/tests/v1.0.md §18（UI-04..UI-10）
 * 状态：TE-03 可执行断言。
 */
test.describe('E2E 快速记录（UI-04..10）', () => {
  test.describe.configure({ timeout: 90_000 });

  test.beforeEach(() => {
    resetE2eState();
  });

  test('UI-04 FAB 默认打开计时弹窗并支持四类切换', async ({ page, request }) => {
    await onboardWithApi(page, request);

    const sheet = page.getByTestId('quick-record-sheet');
    const timerDisplay = page.getByTestId('breast-timer-display');
    const sideGroup = sheet.getByRole('group', { name: '母乳侧别' });

    const startedAt = Date.now();
    await page.getByTestId('quick-record-fab').click();
    await expect(sheet).toBeVisible();
    const openCost = Date.now() - startedAt;
    expect(openCost, `FAB 到弹窗可见耗时 ${openCost}ms`).toBeLessThanOrEqual(300);

    // 默认母乳 + 计时器 + 左/右/双侧
    await expect(page.getByTestId('feeding-type-tab-breast')).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(timerDisplay).toBeVisible();
    await expect(sideGroup.getByRole('button')).toHaveCount(3);

    // 配方奶：奶量输入，隐藏计时与侧别
    await selectFeedType(page, 'formula');
    await expect(page.getByTestId('formula-amount-input')).toBeVisible();
    await expect(timerDisplay).toBeHidden();
    await expect(sideGroup).toBeHidden();

    // 混合：计时 + 奶量同时出现
    await selectFeedType(page, 'mixed');
    await expect(timerDisplay).toBeVisible();
    await expect(page.getByTestId('formula-amount-input')).toBeVisible();
    await expect(sideGroup).toBeVisible();

    // 辅食：克数输入，隐藏计时与侧别
    await selectFeedType(page, 'solid');
    await expect(page.getByTestId('solid-amount-input')).toBeVisible();
    await expect(timerDisplay).toBeHidden();
    await expect(sideGroup).toBeHidden();
  });

  test('UI-05 母乳计时记录：开始 → 结束 → 保存', async ({ page, request }) => {
    const { api, baby, today } = await onboardWithApi(page, request);
    await openQuickRecord(page);

    const timerDisplay = page.getByTestId('breast-timer-display');
    await expect(timerDisplay).toBeVisible();
    // 默认侧别 LEFT；计时器打开即自动开始。
    await page.waitForTimeout(2_100);
    const timerText = (await timerDisplay.innerText()).trim();
    const timerSeconds = parseClock(timerText);
    expect(timerSeconds).toBeGreaterThanOrEqual(2);

    const startedAt = Date.now();
    await page.getByTestId('breast-timer-finish').click();
    await expectToast(page, '已记录');
    const finishCost = Date.now() - startedAt;
    expect(finishCost, `点击结束到成功 toast 耗时 ${finishCost}ms`).toBeLessThanOrEqual(1_000);

    const [record] = await waitForFeedingCount(api, baby.id, today, 1);
    expect(record.feedType).toBe('BREAST');
    expect(record.breastSide).toBe('LEFT');
    expect(record.amountValue).toBeNull();
    expect(record.amountUnit).toBeNull();
    expect(record.durationSec).toBeGreaterThanOrEqual(2);
    expect(record.durationSec).toBeLessThanOrEqual(4);
    expect(Math.abs((record.durationSec as number) - timerSeconds)).toBeLessThanOrEqual(1);
    expect(record.recordDate).toBe(today);
    expect(record.endedAt).not.toBeNull();

    const item = page.getByTestId('feeding-record-item').filter({ hasText: '母乳' });
    await expect(item).toHaveCount(1);
    await expect(item).toContainText('左侧');
    await expect(item).toContainText(`${record.durationSec} 秒`);

    const stats = await api.dailyStats(baby.id, today);
    expect(stats.feedingCount).toBe(1);
  });

  test('UI-06 单次记录 3 秒验收', async ({ page, request }) => {
    const { api, baby, today } = await onboardWithApi(page, request);

    const startedAt = Date.now();
    await page.getByTestId('quick-record-fab').click();
    await expect(page.getByTestId('quick-record-sheet')).toBeVisible();
    await selectFeedType(page, 'formula');
    await fillMilkAmount(page, 120);
    await saveQuickRecord(page);
    await expectToast(page, '已记录');
    const elapsed = Date.now() - startedAt;
    expect(elapsed, `从点击 FAB 到成功 toast 耗时 ${elapsed}ms`).toBeLessThanOrEqual(3_000);

    const [record] = await waitForFeedingCount(api, baby.id, today, 1);
    expect(record.feedType).toBe('FORMULA');
    expect(record.amountValue).toBe(120);
    expect(record.amountUnit).toBe('ML');
    expect(record.revision).toBe(1);
  });

  test('UI-07 配方奶快速记录与首页摘要', async ({ page, request }) => {
    const { api, baby, today } = await onboardWithApi(page, request);

    await openQuickRecord(page);
    await selectFeedType(page, 'formula');
    await fillMilkAmount(page, 120);
    await saveQuickRecord(page);
    await expectToast(page, '已记录');

    const item = page.getByTestId('feeding-record-item').filter({ hasText: '配方奶' });
    await expect(item).toHaveCount(1);
    await expect(item).toContainText('120 毫升');

    await expect(page.getByTestId('summary-feed-count')).toHaveText('1');
    await expect(page.getByTestId('summary-total-amount')).toHaveText('120');

    const [record] = await waitForFeedingCount(api, baby.id, today, 1);
    expect(record.amountValue).toBe(120);
    const stats = await api.dailyStats(baby.id, today);
    expect(stats.feedingCount).toBe(1);
    expect(stats.totalAmountMl).toBe(120.0);
  });

  test('UI-08 混合记录同时保存计时与奶量', async ({ page, request }) => {
    const { api, baby, today } = await onboardWithApi(page, request);

    await openQuickRecord(page);
    await selectFeedType(page, 'mixed');
    await breastSideButton(page, 'both').click();
    await page.waitForTimeout(2_100);
    await fillMilkAmount(page, 90);
    await page.getByTestId('breast-timer-finish').click();
    await expectToast(page, '已记录');

    const [record] = await waitForFeedingCount(api, baby.id, today, 1);
    expect(record.feedType).toBe('MIXED');
    expect(record.breastSide).toBe('BOTH');
    expect(record.amountValue).toBe(90);
    expect(record.amountUnit).toBe('ML');
    expect(record.durationSec).toBeGreaterThanOrEqual(2);
    expect(record.durationSec).toBeLessThanOrEqual(4);

    const item = page.getByTestId('feeding-record-item').filter({ hasText: '混合' });
    await expect(item).toContainText('双侧');
    await expect(item).toContainText('90 毫升');
  });

  test('UI-09 辅食记录（克）', async ({ page, request }) => {
    const { api, baby, today } = await onboardWithApi(page, request);

    await openQuickRecord(page);
    await selectFeedType(page, 'solid');
    await page.getByTestId('solid-amount-input').fill('30');
    await saveQuickRecord(page);
    await expectToast(page, '已记录');

    const [record] = await waitForFeedingCount(api, baby.id, today, 1);
    expect(record.feedType).toBe('SOLID');
    expect(record.amountValue).toBe(30);
    expect(record.amountUnit).toBe('G');
    expect(record.breastSide).toBeNull();

    const item = page.getByTestId('feeding-record-item').filter({ hasText: '辅食' });
    await expect(item).toContainText('30 克');

    const stats = await api.dailyStats(baby.id, today);
    expect(stats.totalSolidG).toBe(30.0);
  });

  test('UI-10 备注与标签', async ({ page, request }) => {
    const { api, baby, today } = await onboardWithApi(page, request);

    await openQuickRecord(page);
    await selectFeedType(page, 'formula');
    await fillMilkAmount(page, 120);
    await page.getByTestId('quick-record-note').locator('textarea').fill('有点吐奶');
    await page.getByTestId('feeding-tag-spit_up').click();
    await page.getByTestId('feeding-tag-sleepy').click();
    await saveQuickRecord(page);
    await expectToast(page, '已记录');

    const [record] = await waitForFeedingCount(api, baby.id, today, 1);
    expect(record.note).toBe('有点吐奶');
    expect([...(record.tags ?? [])].sort()).toEqual(['SLEEPY', 'SPIT_UP']);

    const item = page.getByTestId('feeding-record-item').filter({ hasText: '配方奶' });
    await expect(item).toContainText('有点吐奶');
    await expect(item).toContainText('吐奶');
    await expect(item).toContainText('困倦');
  });
});

function parseClock(text: string): number {
  const parts = text.split(':').map((part) => Number(part));
  if (parts.some((part) => !Number.isFinite(part))) {
    throw new Error(`无法解析计时器文本：${text}`);
  }
  return parts.reduce((total, part) => total * 60 + part, 0);
}
