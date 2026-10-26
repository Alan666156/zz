import { expect, test, type Page } from '@playwright/test';

import { addDays } from '../api/helpers/env';
import {
  browserToday,
  labelledValue,
  onboardWithApi,
  openTab,
  pollUntil,
  resetE2eState,
  type FeedType,
} from './helpers/app';

/**
 * 契约：docs/architecture/v1.0-baby-feeding.md §5.2、§4.7
 * 用例：docs/tests/v1.0.md §18（UI-12）、§4.2 统计夹具
 * 状态：TE-03 可执行断言。
 */
test.describe('E2E 统计页（UI-12）', () => {
  test.describe.configure({ timeout: 120_000 });

  test.beforeEach(() => {
    resetE2eState();
  });

  test('UI-12 统计页 7/30 天切换与数值', async ({ page, request }) => {
    const { api, baby, today } = await onboardWithApi(page, request);

    // §4.2 的 8 条夹具，时间相对当前时刻回推，避免“未来 startedAt”。
    const seeds: Array<{
      feedType: FeedType;
      breastSide: 'LEFT' | 'RIGHT' | 'BOTH' | null;
      amountValue: number | null;
      amountUnit: 'ML' | 'G' | null;
      durationSec: number | null;
      minutesAgo: number;
    }> = [
      { feedType: 'BREAST', breastSide: 'LEFT', amountValue: null, amountUnit: null, durationSec: 900, minutesAgo: 8 * 60 },
      { feedType: 'BREAST', breastSide: 'RIGHT', amountValue: null, amountUnit: null, durationSec: 600, minutesAgo: 7 * 60 },
      { feedType: 'FORMULA', breastSide: null, amountValue: 120, amountUnit: 'ML', durationSec: 300, minutesAgo: 6 * 60 },
      { feedType: 'FORMULA', breastSide: null, amountValue: 150, amountUnit: 'ML', durationSec: null, minutesAgo: 5 * 60 },
      { feedType: 'MIXED', breastSide: 'BOTH', amountValue: 90, amountUnit: 'ML', durationSec: 480, minutesAgo: 4 * 60 },
      { feedType: 'SOLID', breastSide: null, amountValue: 30, amountUnit: 'G', durationSec: 120, minutesAgo: 3 * 60 },
      { feedType: 'BREAST', breastSide: 'BOTH', amountValue: null, amountUnit: null, durationSec: 1200, minutesAgo: 2 * 60 },
      { feedType: 'SOLID', breastSide: null, amountValue: 20, amountUnit: 'G', durationSec: null, minutesAgo: 60 },
    ];
    const times = await localIsoPairs(page, seeds.map((seed) => seed.minutesAgo), seeds.map((seed) => seed.durationSec ?? 0));
    for (const [index, seed] of seeds.entries()) {
      await api.createFeeding({
        babyId: baby.id,
        feedType: seed.feedType,
        breastSide: seed.breastSide,
        amountValue: seed.amountValue,
        amountUnit: seed.amountUnit,
        durationSec: seed.durationSec,
        startedAt: times[index].startedAt,
        endedAt: times[index].endedAt,
        tzOffsetMinutes: 480,
      });
    }

    // 捕获统计趋势请求，验证 7/30 天窗口。
    const trendRequests: Array<{ from: string; to: string }> = [];
    page.on('request', (event) => {
      if (!event.url().includes('/api/v1/stats/trend')) return;
      const url = new URL(event.url());
      const from = url.searchParams.get('from');
      const to = url.searchParams.get('to');
      if (from && to) trendRequests.push({ from, to });
    });

    await openTab(page, 'stats');
    await expect(page.getByTestId('stats-page')).toBeVisible();
    await expect(page.getByTestId('stats-summary')).toBeVisible();

    const seven = await pollUntil(
      async () => trendRequests.find((requestItem) => spanDays(requestItem) === 7),
      (value) => Boolean(value),
      '等待 7 天窗口的 /stats/trend 请求',
    );
    if (!seven) throw new Error('未捕获到 7 天窗口的 /stats/trend 请求');
    expect(seven).toEqual({ from: addDays(today, -6), to: today });

    const summary = page.getByTestId('stats-summary');
    await expect.poll(() => labelledValue(summary, '喂养次数')).toBe('8');
    await expect.poll(() => labelledValue(summary, '总奶量 (ml)')).toBe('360.0');
    expect(await labelledValue(summary, '总时长')).toBe('60 分钟');
    expect(await labelledValue(summary, '日均次数')).toBe('1.1');
    await expect(page.getByTestId('stats-empty')).toHaveCount(0);
    await expect(page.getByTestId('stats-offline')).toHaveCount(0);

    const canvas = page.getByTestId('stats-chart-canvas').locator('canvas').first();
    await expect(canvas).toBeVisible({ timeout: 15_000 });
    const box = await canvas.boundingBox();
    expect(box, '统计图 canvas 应有可渲染尺寸').not.toBeNull();
    expect(box?.width ?? 0).toBeGreaterThan(0);
    expect(box?.height ?? 0).toBeGreaterThan(0);

    // 三个指标 tab 均可切换且图表继续渲染。
    for (const metric of ['amount', 'duration', 'count'] as const) {
      const tab = page.getByTestId(`stats-metric-${metric}`);
      await tab.click();
      await expect(tab).toHaveAttribute('aria-selected', 'true');
      await expect(canvas).toBeVisible();
    }

    // 7 天窗口页面数值与同参数 API 一致。
    const sevenTrend = await api.trend(baby.id, seven.from, seven.to);
    expect(sum(sevenTrend.points.map((point) => point.feedingCount))).toBe(8);
    expect(sum(sevenTrend.points.map((point) => point.totalAmountMl))).toBe(360.0);
    expect(sum(sevenTrend.points.map((point) => point.totalDurationSec))).toBe(3600);

    // 切到 30 天：请求窗口 30 天（含端点），合计不变、日均按 30 天计算。
    await page.getByTestId('stats-range-30').click();
    await expect(page.getByTestId('stats-range-30')).toHaveAttribute('aria-pressed', 'true');
    const thirty = await pollUntil(
      async () => trendRequests.find((requestItem) => spanDays(requestItem) === 30),
      (value) => Boolean(value),
      '等待 30 天窗口的 /stats/trend 请求',
    );
    if (!thirty) throw new Error('未捕获到 30 天窗口的 /stats/trend 请求');
    expect(thirty).toEqual({ from: addDays(today, -29), to: today });
    await expect.poll(() => labelledValue(summary, '喂养次数')).toBe('8');
    await expect.poll(() => labelledValue(summary, '日均次数')).toBe('0.3');
    await expect(canvas).toBeVisible();

    const thirtyTrend = await api.trend(baby.id, thirty.from, thirty.to);
    expect(sum(thirtyTrend.points.map((point) => point.feedingCount))).toBe(8);
    expect(thirtyTrend.points).toHaveLength(30);
    expect(sevenTrend.points).toHaveLength(7);
  });
});

function spanDays(requestItem: { from: string; to: string }): number {
  const from = Date.parse(`${requestItem.from}T00:00:00Z`);
  const to = Date.parse(`${requestItem.to}T00:00:00Z`);
  return Math.round((to - from) / 86_400_000) + 1;
}

function sum(values: number[]): number {
  return Math.round(values.reduce((total, value) => total + value, 0) * 10) / 10;
}

/** 在浏览器时区（Asia/Shanghai）内生成相对当前时刻的 startedAt/endedAt。 */
async function localIsoPairs(
  page: Page,
  minutesAgo: number[],
  durations: number[],
): Promise<Array<{ startedAt: string; endedAt: string | null }>> {
  return page.evaluate(
    ({ offsets, durationList }) => {
      const pad = (value: number): string => String(value).padStart(2, '0');
      const format = (date: Date): string => {
        const offset = -date.getTimezoneOffset();
        const sign = offset >= 0 ? '+' : '-';
        const abs = Math.abs(offset);
        return (
          `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
          `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}` +
          `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
        );
      };
      return offsets.map((offset, index) => {
        const start = new Date(Date.now() - offset * 60_000);
        const duration = durationList[index];
        return {
          startedAt: format(start),
          endedAt: duration > 0 ? format(new Date(start.getTime() + duration * 1000)) : null,
        };
      });
    },
    { offsets: minutesAgo, durationList: durations },
  );
}
