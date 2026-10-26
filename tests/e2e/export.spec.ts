import { expect, test, type Page } from '@playwright/test';

import { addDays } from '../api/helpers/env';
import {
  browserToday,
  onboardWithApi,
  openTab,
  readDownloadBytes,
  resetE2eState,
  withDownload,
} from './helpers/app';
import { collectPageErrors, expectNoPageErrors } from './helpers/page';

/** 契约 §4.9 / EXP-03 锁定表头。 */
const CSV_HEADER =
  '记录ID,宝宝昵称,喂养类型,开始时间,结束时间,喂养时长(秒),母乳侧别,奶量/辅食量,单位,备注,标签,记录日期';

/**
 * 契约：docs/architecture/v1.0-baby-feeding.md §4.9、§5.7
 * 用例：docs/tests/v1.0.md §18（UI-14）
 * 状态：TE-03 可执行断言。
 */
test.describe('E2E CSV 导出（UI-14）', () => {
  test.describe.configure({ timeout: 120_000 });

  test.beforeEach(() => {
    resetE2eState();
  });

  test('UI-14 CSV 导出下载（浏览器）', async ({ page, context, request }) => {
    const errors = collectPageErrors(page);
    const { api, baby, today } = await onboardWithApi(page, request, {
      name: '小满',
      birthDate: '2025-01-01',
    });

    // 范围内：公式注入备注；范围外：3 天前一条，用于验证导出范围。
    const [inRange] = await localIso(page, [30]);
    const [outOfRange] = await localIso(page, [3 * 24 * 60]);
    const injection = await api.createFeeding({
      babyId: baby.id,
      feedType: 'FORMULA',
      amountValue: 120,
      amountUnit: 'ML',
      startedAt: inRange,
      endedAt: null,
      note: '=1+1',
      tzOffsetMinutes: 480,
    });
    const excluded = await api.createFeeding({
      babyId: baby.id,
      feedType: 'FORMULA',
      amountValue: 180,
      amountUnit: 'ML',
      startedAt: outOfRange,
      endedAt: null,
      note: '范围外记录',
      tzOffsetMinutes: 480,
    });
    await openTab(page, 'profile');
    await expect(page.getByTestId('profile-export')).toBeEnabled();
    await page.getByTestId('profile-export').click();
    await expect(page.getByTestId('export-dialog')).toBeVisible();

    const from = addDays(today, -1);
    expect([from, today], '范围内记录日期应落在导出窗口').toContain(injection.recordDate);
    await page.getByTestId('export-range-start').fill(from);
    await page.getByTestId('export-range-end').fill(today);

    const download = await withDownload(context, page, async () => {
      await page.getByTestId('export-submit').click();
    });

    await expect(page.getByTestId('export-result')).toBeVisible();
    await expect(page.getByTestId('export-row-count')).toHaveText('共 1 条记录');
    const link = await page.getByTestId('export-link').inputValue();
    expect(link).toMatch(/^http:\/\/[^/]+\/api\/v1\/exports\/feeding-records\/[^/]+\.csv$/);
    expect(link).toContain('/api/v1/exports/feeding-records/');
    await expect(page.getByTestId('export-fallback-copy')).toHaveText(
      '若未开始下载，请复制链接到浏览器打开（链接 5 分钟内有效）。',
    );

    expect(download.suggestedFilename()).toBe(`feeding-records-${from}-${today}.csv`);
    const bytes = await readDownloadBytes(download);
    expect(bytes.subarray(0, 3).toString('hex'), 'CSV 应带 UTF-8 BOM').toBe('efbbbf');

    const text = bytes.subarray(3).toString('utf8');
    const lines = text.split('\r\n').filter((line) => line.length > 0);
    expect(lines[0], 'CSV 表头精确匹配 EXP-03').toBe(CSV_HEADER);
    expect(lines, '范围内应只有 1 条记录').toHaveLength(2);

    const row = lines[1];
    expect(row).toContain(injection.id);
    expect(row).toContain('小满');
    expect(row).toContain('配方奶');
    expect(row).toContain('120.0');
    expect(row).toContain(injection.recordDate);
    expect(row).toContain(`'=1+1`);
    expect(text).not.toContain('180.0');
    expect(text).not.toContain(excluded.id);
    expect(text).not.toContain('范围外记录');

    expectNoPageErrors(errors);
  });
});

/** 浏览器时区（Asia/Shanghai）内，相对当前时刻回推的 ISO 时间。 */
async function localIso(page: Page, minutesAgo: number[]): Promise<string[]> {
  return page.evaluate((offsets) => {
    const pad = (value: number): string => String(value).padStart(2, '0');
    return offsets.map((offset) => {
      const date = new Date(Date.now() - offset * 60_000);
      const tz = -date.getTimezoneOffset();
      const sign = tz >= 0 ? '+' : '-';
      const abs = Math.abs(tz);
      return (
        `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
        `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}` +
        `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
      );
    });
  }, minutesAgo);
}
