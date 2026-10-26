import { expect, test } from '@playwright/test';

import {
  browserToday,
  expectToast,
  onboardWithApi,
  openTab,
  pollUntil,
  resetE2eState,
} from './helpers/app';

/**
 * 契约：docs/architecture/v1.0-baby-feeding.md §5.2、§4.8、§1.2
 * 用例：docs/tests/v1.0.md §18（UI-13）
 * 状态：TE-03 可执行断言。
 */
test.describe('E2E 生长页（UI-13）', () => {
  test.describe.configure({ timeout: 120_000 });

  test.beforeEach(() => {
    resetE2eState();
  });

  test('UI-13 生长页：新增、编辑、latest、自身趋势', async ({ page, request }) => {
    const { api, baby } = await onboardWithApi(page, request);
    const today = await browserToday(page);

    await openTab(page, 'growth');
    await expect(page.getByTestId('growth-page')).toBeVisible();
    await expect(page.getByTestId('growth-empty')).toBeVisible();
    await expect(page.getByTestId('growth-latest-height')).toHaveText('--');
    await expect(page.getByTestId('growth-latest-weight')).toHaveText('--');
    await expect(page.getByTestId('growth-latest-head')).toHaveText('--');
    await expect(page.getByTestId('growth-latest')).toContainText('还没有测量记录');

    // 三项全空时保存按钮不可用。
    await page.getByTestId('growth-add').click();
    await expect(page.getByTestId('growth-form')).toBeVisible();
    await expect(page.getByTestId('growth-form-save')).toBeDisabled();
    await expect(page.getByTestId('growth-form-date')).toHaveValue(today);

    await page.getByTestId('growth-form-height').fill('68.5');
    await page.getByTestId('growth-form-weight').fill('8.12');
    await page.getByTestId('growth-form-head').fill('43.0');
    await expect(page.getByTestId('growth-form-save')).toBeEnabled();
    await page.getByTestId('growth-form-save').click();
    await expectToast(page, '已保存');
    await expect(page.getByTestId('growth-form')).toBeHidden();

    const first = await pollUntil(
      () => api.listGrowth(baby.id),
      (result) => result.items.filter((item) => !item.deletedAt).length === 1,
      '等待第一条生长记录同步',
    );
    const created = first.items[0];
    expect(created).toMatchObject({
      babyId: baby.id,
      measuredOn: today,
      heightCm: 68.5,
      weightKg: 8.12,
      headCircumferenceCm: 43.0,
      revision: 1,
      deletedAt: null,
    });
    expect(created.note).toBeNull();

    // 最新测量日期暂无独立 testid，从 latest 卡文本读取（选择器缺口已上报）。
    await expect(page.getByTestId('growth-latest')).toContainText(`测量于 ${today}`);
    await expect(page.getByTestId('growth-latest-height')).toHaveText('68.5 cm');
    await expect(page.getByTestId('growth-latest-weight')).toHaveText('8.12 kg');
    await expect(page.getByTestId('growth-latest-head')).toHaveText('43.0 cm');
    await expect(page.getByTestId('growth-empty')).toHaveCount(0);

    const canvas = page.getByTestId('growth-chart-canvas').locator('canvas').first();
    await expect(canvas).toBeVisible({ timeout: 15_000 });
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    expect(box?.width ?? 0).toBeGreaterThan(0);
    expect(box?.height ?? 0).toBeGreaterThan(0);

    for (const metric of ['weight', 'head', 'height'] as const) {
      const tab = page.getByTestId(`growth-metric-${metric}`);
      await tab.click();
      await expect(tab).toHaveAttribute('aria-selected', 'true');
      await expect(canvas).toBeVisible();
    }

    // 编辑体重：latest 卡与后端同步更新，revision +1。
    await page.getByTestId('growth-edit').first().click();
    await expect(page.getByTestId('growth-form')).toBeVisible();
    await expect(page.getByTestId('growth-form-height')).toHaveValue('68.5');
    await expect(page.getByTestId('growth-form-weight')).toHaveValue('8.12');
    await page.getByTestId('growth-form-weight').fill('8.5');
    await page.getByTestId('growth-form-save').click();
    await expectToast(page, '已保存');
    await expect(page.getByTestId('growth-form')).toBeHidden();

    const edited = await pollUntil(
      () => api.listGrowth(baby.id),
      (result) =>
        result.items.some(
          (item) => item.id === created.id && item.revision === 2 && item.weightKg === 8.5,
        ),
      '等待生长记录编辑同步（revision=2，weight=8.5）',
    );
    expect(edited.items.find((item) => item.id === created.id)).toMatchObject({
      measuredOn: today,
      heightCm: 68.5,
      weightKg: 8.5,
      headCircumferenceCm: 43.0,
      revision: 2,
    });
    await expect(page.getByTestId('growth-latest-weight')).toHaveText('8.5 kg');
    await expect(page.getByTestId('growth-latest-height')).toHaveText('68.5 cm');
    await expect(page.getByTestId('growth-latest-head')).toHaveText('43.0 cm');

    // 只填一项指标也能保存。
    await page.getByTestId('growth-add-inline').click();
    await expect(page.getByTestId('growth-form')).toBeVisible();
    await page.getByTestId('growth-form-height').fill('70');
    await page.getByTestId('growth-form-save').click();
    await expectToast(page, '已保存');
    await expect(page.getByTestId('growth-form')).toBeHidden();

    const two = await pollUntil(
      () => api.listGrowth(baby.id),
      (result) => result.items.filter((item) => !item.deletedAt).length === 2,
      '等待第二条生长记录同步',
    );
    const single = two.items.find((item) => item.id !== created.id);
    expect(single).toMatchObject({
      measuredOn: today,
      heightCm: 70,
      weightKg: null,
      headCircumferenceCm: null,
      revision: 1,
    });
    await expect(page.getByTestId('growth-latest-height')).toHaveText('70.0 cm');
    await expect(page.getByTestId('growth-latest-weight')).toHaveText('8.5 kg');
    await expect(page.getByTestId('growth-latest-head')).toHaveText('43.0 cm');
    await expect(page.getByTestId('growth-record-list').locator('article')).toHaveCount(2);

    // V1.0 不提供 WHO 曲线/百分位。
    await expect(page.getByTestId('growth-page')).not.toContainText('WHO');
    await expect(page.getByTestId('growth-page')).not.toContainText('百分位');
  });
});
