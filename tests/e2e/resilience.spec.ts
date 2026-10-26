import { expect, test } from '@playwright/test';

import {
  browserToday,
  expectNoUnexpectedErrors,
  expectToast,
  fillMilkAmount,
  labelledValue,
  localIsoMinutesAgo,
  onboardWithApi,
  openQuickRecord,
  openTab,
  prepareDevice,
  resetE2eState,
  saveQuickRecord,
  selectFeedType,
  waitForFeedingCount,
} from './helpers/app';
import { KNOWN_NETWORK_ERRORS, collectPageErrors } from './helpers/page';

/**
 * 契约：docs/architecture/v1.0-baby-feeding.md §5.4、§5.7、§2.5
 * 用例：docs/tests/v1.0.md §18（UI-19..UI-21）
 * 状态：TE-03 可执行断言。
 */
test.describe('E2E 韧性与安全（UI-19..21）', () => {
  test.describe.configure({ timeout: 120_000 });

  test.beforeEach(() => {
    resetE2eState();
  });

  test('UI-19 API 失败时的错误/降级状态', async ({ page, request }) => {
    const errors = collectPageErrors(page);
    const { api, baby, today } = await onboardWithApi(page, request);
    const [startedAt] = await localIsoMinutesAgo(page, [30]);
    await api.createFeeding({
      babyId: baby.id,
      feedType: 'FORMULA',
      amountValue: 120,
      amountUnit: 'ML',
      startedAt,
      endedAt: null,
      tzOffsetMinutes: 480,
    });
    expect(today).toBe(await browserToday(page));

    await page.route('**/api/v1/stats/trend**', (route) =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 'INTERNAL_ERROR',
          message: '服务器内部错误',
          data: null,
          requestId: 'e2e-ui-19',
          serverTime: new Date().toISOString(),
        }),
      }),
    );

    await openTab(page, 'stats');
    await expect(page.getByTestId('stats-page')).toBeVisible();
    await expect(page.getByTestId('stats-offline')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('stats-empty')).toBeVisible();
    await expect(page.getByTestId('stats-empty')).toContainText('暂无统计数据');
    await expect(page.getByTestId('stats-summary')).toContainText('喂养次数');

    const pageText = await page.getByTestId('stats-page').innerText();
    expect(pageText).not.toMatch(/Exception|SQLException|at com\.|SELECT /i);

    // 清除拦截后重新加载，图表与数值恢复正常。
    await page.unroute('**/api/v1/stats/trend**');
    await page.getByTestId('stats-range-30').click();
    await expect(page.getByTestId('stats-offline')).toHaveCount(0, { timeout: 15_000 });
    await expect.poll(() => labelledValue(page.getByTestId('stats-summary'), '喂养次数')).toBe('1');
    await expect.poll(() => labelledValue(page.getByTestId('stats-summary'), '总奶量 (ml)')).toBe(
      '120.0',
    );
    await expect(page.getByTestId('stats-chart-canvas').locator('canvas').first()).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByTestId('stats-empty')).toHaveCount(0);

    expectNoUnexpectedErrors(errors, [
      ...KNOWN_NETWORK_ERRORS,
      /Failed to load resource: the server responded with a status of 500.*\/api\/v1\/stats\/trend/,
    ]);
  });

  test('UI-20 控制台无错误、无 Service Worker', async ({ page, request }) => {
    const errors = collectPageErrors(page);
    const { api, baby, today } = await onboardWithApi(page, request);

    await openQuickRecord(page);
    await selectFeedType(page, 'formula');
    await fillMilkAmount(page, 120);
    await saveQuickRecord(page);
    await expectToast(page, '已记录');
    await waitForFeedingCount(api, baby.id, today, 1);

    await openTab(page, 'records');
    await expect(page.getByTestId('feeding-record-item')).toHaveCount(1);
    await openTab(page, 'stats');
    await expect(page.getByTestId('stats-chart-canvas').locator('canvas').first()).toBeVisible({
      timeout: 15_000,
    });
    await openTab(page, 'growth');
    await expect(page.getByTestId('growth-page')).toBeVisible();
    await openTab(page, 'profile');
    await expect(page.getByTestId('profile-export')).toBeEnabled();
    await page.getByTestId('profile-export').click();
    await expect(page.getByTestId('export-dialog')).toBeVisible();

    const registrations = await page.evaluate(
      async () => (await navigator.serviceWorker.getRegistrations()).length,
    );
    expect(registrations, 'V1.0 不应注册 Service Worker').toBe(0);

    // 首次 GET /babies 的 409 与 favicon 404 是已知网络噪音，逐条豁免见 helpers/page.ts。
    expectNoUnexpectedErrors(errors, KNOWN_NETWORK_ERRORS);
  });

  test('UI-21 宝宝名 XSS 载荷按文本渲染', async ({ page, request }) => {
    const payload = '<b>小满</b>';
    let dialogs = 0;
    page.on('dialog', async (dialog) => {
      dialogs += 1;
      await dialog.dismiss();
    });

    await prepareDevice(page, request, {
      baby: { name: payload, gender: 'MALE', birthDate: '2025-01-01' },
    });
    await page.goto('/');
    await expect(page.getByTestId('baby-card')).toBeVisible();
    await expect(page.getByTestId('baby-card')).toContainText(payload);
    await expect(page.getByTestId('baby-card').locator('b')).toHaveCount(0);

    const xss = await page.evaluate(
      () => (window as unknown as { __xss?: unknown }).__xss,
    );
    expect(xss, '宝宝名不应执行脚本').toBeUndefined();
    expect(dialogs).toBe(0);

    await page.reload();
    await expect(page.getByTestId('baby-card')).toContainText(payload);
    await expect(page.getByTestId('baby-card').locator('b')).toHaveCount(0);

    await openTab(page, 'profile');
    const row = page.getByTestId('profile-baby-row').filter({ hasText: '小满' });
    await expect(row).toContainText(payload);
    await expect(row.locator('b')).toHaveCount(0);
    expect(
      await page.evaluate(() => (window as unknown as { __xss?: unknown }).__xss),
    ).toBeUndefined();
    expect(dialogs).toBe(0);
  });
});
