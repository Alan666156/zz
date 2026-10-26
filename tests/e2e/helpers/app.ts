import {
  expect,
  type APIRequestContext,
  type BrowserContext,
  type Download,
  type Locator,
  type Page,
} from '@playwright/test';

import { API_BASE_URL, API_PREFIX, addDays } from '../../api/helpers/env';
import { uuid } from '../../api/helpers/fixtures';
import { flushRedisDb } from '../../api/helpers/redis';

/**
 * E2E 共享工具：设备/数据准备、UI 流程、轮询与下载事件。
 *
 * 约束：
 * - 每个场景新 browser context（新设备 UUID），beforeEach 清空 Redis DB14。
 * - 页面选择器只用 frontend/README.md 登记的 data-testid；本文件集中收口。
 * - 侧别按钮、删除确认、首页摘要、生长最新日期已使用 Q-14 补登记的 testid；
 *   仅统计页摘要卡仍按标签文本读取（StatsView 尚未提供 testid）。
 */

/** Q-15 固定 localStorage key */
export const DEVICE_ID_KEY = 'zz.bf.deviceId';
export const ACTIVE_BABY_KEY = 'zz.bf.activeBabyId';
export const LAST_FEED_TYPE_KEY = 'zz.bf.lastFeedType';
export const SYNC_LOCK_KEY = 'zz.bf.syncLock';

export const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** 每个 E2E 场景前清空 Redis DB14（限流计数、统计缓存、同步锁/幂等键）。 */
export function resetE2eState(): void {
  flushRedisDb();
}

export type FeedType = 'BREAST' | 'FORMULA' | 'MIXED' | 'SOLID';
export type BreastSide = 'LEFT' | 'RIGHT' | 'BOTH';
export type Gender = 'MALE' | 'FEMALE' | 'UNKNOWN';

export interface BabyDto {
  id: string;
  name: string;
  gender: Gender;
  birthDate: string;
  isDefault: boolean;
  revision: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface FeedingDto {
  id: string;
  babyId: string;
  feedType: FeedType;
  breastSide: BreastSide | null;
  amountValue: number | null;
  amountUnit: 'ML' | 'G' | null;
  durationSec: number | null;
  startedAt: string;
  endedAt: string | null;
  recordDate: string;
  tzOffsetMinutes: number;
  note: string | null;
  tags: string[] | null;
  revision: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface GrowthDto {
  id: string;
  babyId: string;
  measuredOn: string;
  heightCm: number | null;
  weightKg: number | null;
  headCircumferenceCm: number | null;
  note: string | null;
  revision: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface PageDto<T> {
  items: T[];
  page: number;
  size: number;
  total: number;
  hasNext: boolean;
}

export interface DailyStatsDto {
  babyId: string;
  date: string;
  feedingCount: number;
  totalAmountMl: number;
  totalSolidG: number;
  totalBreastDurationSec: number;
  totalDurationSec: number;
  avgAmountMl: number | null;
  lastFeedingAt: string | null;
}

export interface TrendPointDto {
  date: string;
  feedingCount: number;
  totalAmountMl: number;
  totalSolidG: number;
  totalBreastDurationSec: number;
  totalDurationSec: number;
  avgDurationSec: number | null;
}

export interface TrendDto {
  babyId: string;
  from: string;
  to: string;
  granularity: string;
  points: TrendPointDto[];
  cached: boolean;
}

export interface Envelope<T> {
  code: string;
  message: string;
  data: T;
  requestId: string;
  serverTime: string;
}

/** 绑定固定设备的 API 客户端（走 8080，不受浏览器离线影响）。 */
export class E2eApi {
  constructor(
    private readonly request: APIRequestContext,
    readonly deviceId: string,
  ) {}

  async raw<T = unknown>(
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    path: string,
    data?: unknown,
  ): Promise<{ status: number; body: Envelope<T> }> {
    const response = await this.request.fetch(`${API_BASE_URL}${API_PREFIX}${path}`, {
      method,
      headers: {
        Accept: 'application/json',
        'X-Client-Version': '1.0.0-e2e',
        'X-Device-Id': this.deviceId,
        ...(data === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      ...(data === undefined ? {} : { data }),
    });
    const body = (await response.json()) as Envelope<T>;
    return { status: response.status(), body };
  }

  private async ok<T>(
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    path: string,
    data?: unknown,
  ): Promise<T> {
    const { status, body } = await this.raw<T>(method, path, data);
    expect(status, `${method} ${path} 应返回 200，实际 ${status}`).toBe(200);
    expect(body.code, `${method} ${path} 业务码`).toBe('OK');
    return body.data;
  }

  init(): Promise<{ deviceId: string; created: boolean }> {
    return this.ok('POST', '/devices/init', { platform: 'H5', appVersion: '1.0.0' });
  }

  listBabies(): Promise<BabyDto[]> {
    return this.ok('GET', '/babies');
  }

  async createBaby(input: {
    id?: string;
    name: string;
    gender?: Gender;
    birthDate: string;
    isDefault?: boolean;
  }): Promise<BabyDto> {
    const data = await this.ok<{ created: boolean; baby: BabyDto }>('POST', '/babies', {
      id: input.id ?? uuid(),
      gender: input.gender ?? 'UNKNOWN',
      ...input,
    });
    return data.baby;
  }

  listFeedings(babyId: string, date: string): Promise<PageDto<FeedingDto>> {
    const query = new URLSearchParams({ babyId, date, page: '1', size: '100' });
    return this.ok('GET', `/feeding-records?${query.toString()}`);
  }

  createFeeding(input: {
    babyId: string;
    feedType: FeedType;
    breastSide?: BreastSide | null;
    amountValue?: number | null;
    amountUnit?: 'ML' | 'G' | null;
    durationSec?: number | null;
    startedAt: string;
    endedAt?: string | null;
    note?: string | null;
    tags?: string[] | null;
    tzOffsetMinutes?: number;
  }): Promise<FeedingDto> {
    return this.ok<{ created: boolean; record: FeedingDto }>('POST', '/feeding-records', {
      id: uuid(),
      ...input,
    }).then((data) => data.record);
  }

  async patchFeeding(id: string, data: Record<string, unknown>): Promise<FeedingDto> {
    const payload = await this.ok<FeedingDto | { record: FeedingDto }>(
      'PATCH',
      `/feeding-records/${id}`,
      data,
    );
    return 'record' in payload ? payload.record : payload;
  }

  dailyStats(babyId: string, date: string): Promise<DailyStatsDto> {
    const query = new URLSearchParams({ babyId, date });
    return this.ok('GET', `/stats/daily?${query.toString()}`);
  }

  trend(babyId: string, from: string, to: string): Promise<TrendDto> {
    const query = new URLSearchParams({ babyId, from, to });
    return this.ok('GET', `/stats/trend?${query.toString()}`);
  }

  listGrowth(babyId: string): Promise<PageDto<GrowthDto>> {
    const query = new URLSearchParams({ babyId, page: '1', size: '100' });
    return this.ok('GET', `/growth-records?${query.toString()}`);
  }

  createGrowth(input: {
    babyId: string;
    measuredOn: string;
    heightCm?: number | null;
    weightKg?: number | null;
    headCircumferenceCm?: number | null;
    note?: string | null;
  }): Promise<GrowthDto> {
    return this.ok<{ created: boolean; record: GrowthDto }>('POST', '/growth-records', {
      id: uuid(),
      ...input,
    }).then((data) => data.record);
  }
}

export interface PreparedDevice {
  deviceId: string;
  api: E2eApi;
  baby: BabyDto | null;
}

/**
 * 准备一个已注册设备（可选先建宝宝），并把设备 ID 注入 localStorage，
 * 页面启动后直接进入首页。用于“API 造数据 + UI 验收”的场景。
 */
export async function prepareDevice(
  page: Page,
  request: APIRequestContext,
  options: {
    register?: boolean;
    baby?: false | {
      name?: string;
      gender?: Gender;
      birthDate?: string;
      isDefault?: boolean;
    };
  } = {},
): Promise<PreparedDevice> {
  const deviceId = uuid();
  const api = new E2eApi(request, deviceId);
  if (options.register !== false) {
    await api.init();
  }
  let baby: BabyDto | null = null;
  if (options.baby !== false) {
    baby = await api.createBaby({
      name: options.baby?.name ?? '小满',
      gender: options.baby?.gender ?? 'FEMALE',
      birthDate: options.baby?.birthDate ?? '2026-03-01',
      isDefault: options.baby?.isDefault,
    });
  }
  await page.addInitScript(
    (id: string) => {
      window.localStorage.setItem('zz.bf.deviceId', id);
    },
    deviceId,
  );
  return { deviceId, api, baby };
}

/* ------------------------------------------------------------------ */
/* 新手引导                                                            */
/* ------------------------------------------------------------------ */

export async function gotoOnboarding(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page).toHaveURL(/\/onboarding$/);
  await expect(page.getByTestId('baby-form')).toBeVisible();
}

export async function completeOnboarding(
  page: Page,
  options: { name?: string; gender?: Gender; birthDate?: string } = {},
): Promise<void> {
  if (options.name !== undefined) {
    await page.getByTestId('baby-form-name').fill(options.name);
  }
  const gender = options.gender ?? 'FEMALE';
  await page.getByTestId(`baby-form-gender-${gender.toLowerCase()}`).click();
  await page.getByTestId('baby-form-birth-date').fill(options.birthDate ?? '2026-03-01');
  await page.getByTestId('baby-form-submit').click();
  await expect(page.getByTestId('baby-card')).toBeVisible({ timeout: 15_000 });
}

export async function readLocalStorage(page: Page, key: string): Promise<string | null> {
  return page.evaluate((storageKey) => window.localStorage.getItem(storageKey), key);
}

export interface OnboardedDevice {
  deviceId: string;
  api: E2eApi;
  baby: BabyDto;
  today: string;
}

/** UI 完成首次引导，并回读同一设备的服务端宝宝档案。 */
export async function onboardWithApi(
  page: Page,
  request: APIRequestContext,
  options: { name?: string; gender?: Gender; birthDate?: string } = {},
): Promise<OnboardedDevice> {
  await gotoOnboarding(page);
  await completeOnboarding(page, options);
  await waitForToastToHide(page);

  const deviceId = await readLocalStorage(page, DEVICE_ID_KEY);
  if (!deviceId) throw new Error('onboarding 后 localStorage 缺少设备 ID');
  const api = new E2eApi(request, deviceId);
  const babies = await api.listBabies();
  if (babies.length === 0) throw new Error('onboarding 后服务端没有宝宝档案');
  return {
    deviceId,
    api,
    baby: babies[0],
    today: await browserToday(page),
  };
}

/** 浏览器本地日期（context timezoneId=Asia/Shanghai），不依赖测试进程时区。 */
export async function browserToday(page: Page): Promise<string> {
  return page.evaluate(() => {
    const now = new Date();
    const pad = (value: number): string => String(value).padStart(2, '0');
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  });
}

export async function browserYesterday(page: Page): Promise<string> {
  return addDays(await browserToday(page), -1);
}

/** 在浏览器时区生成相对当前时刻回推的 ISO-8601 时间（用于避免未来 startedAt）。 */
export async function localIsoMinutesAgo(page: Page, minutesAgo: number[]): Promise<string[]> {
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

/** 按前端 calcBabyAge 的规则计算期望月龄文案。 */
export function expectedBabyAgeLabel(birthDate: string, today: string): string {
  const parse = (value: string): number[] => value.split('-').map(Number);
  const [birthYear, birthMonth, birthDay] = parse(birthDate);
  const [year, month, day] = parse(today);
  const todayMs = Date.UTC(year, month - 1, day);
  const birthMs = Date.UTC(birthYear, birthMonth - 1, birthDay);
  if (Number.isNaN(birthMs) || todayMs < birthMs) return '0 天';

  const totalDays = Math.round((todayMs - birthMs) / 86_400_000);
  let months = (year - birthYear) * 12 + (month - birthMonth);
  if (day < birthDay) months -= 1;
  if (months < 0) months = 0;

  const target = birthMonth - 1 + months;
  const anchorYear = birthYear + Math.floor(target / 12);
  const anchorMonth = ((target % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(anchorYear, anchorMonth + 1, 0)).getUTCDate();
  const anchorMs = Date.UTC(anchorYear, anchorMonth, Math.min(birthDay, lastDay));
  const days = Math.max(0, Math.round((todayMs - anchorMs) / 86_400_000));

  if (months <= 0) return `${totalDays} 天`;
  if (days === 0) return `${months} 个月`;
  return `${months} 个月 ${days} 天`;
}

/** 统计页摘要卡按标签读取数值（StatsView 尚未提供 summary testid；首页已改用 `summary-*`）。 */
export async function labelledValue(scope: Locator, label: string): Promise<string> {
  const item = scope.getByText(label, { exact: true }).locator('..');
  return (await item.locator('span').first().innerText()).trim();
}

/* ------------------------------------------------------------------ */
/* 快速记录                                                            */
/* ------------------------------------------------------------------ */

export async function openQuickRecord(page: Page): Promise<void> {
  await page.getByTestId('quick-record-fab').click();
  await expect(page.getByTestId('quick-record-sheet')).toBeVisible();
}

export async function selectFeedType(
  page: Page,
  type: 'breast' | 'formula' | 'mixed' | 'solid',
): Promise<void> {
  const tab = page.getByTestId(`feeding-type-tab-${type}`);
  await tab.click();
  await expect(tab).toHaveAttribute('aria-selected', 'true');
}

/** 选择母乳侧别（Q-14 新增 `breast-side-*`，作用域限定在快速记录弹层内）。 */
export function breastSideButton(page: Page, side: 'left' | 'right' | 'both'): Locator {
  return page.getByTestId('quick-record-sheet').getByTestId(`breast-side-${side}`);
}

/** 记录一条配方奶/混合奶量（混合记录需先调用 selectFeedType('mixed')）。 */
export async function fillMilkAmount(page: Page, amount: number): Promise<void> {
  await page.getByTestId('formula-amount-input').fill(String(amount));
}

export async function saveQuickRecord(page: Page): Promise<void> {
  await page.getByTestId('quick-record-save').click();
}

export async function expectToast(page: Page, text: string, timeout = 8_000): Promise<void> {
  const toast = page.getByTestId('app-toast');
  await expect(toast).toBeVisible({ timeout });
  await expect(toast).toContainText(text, { timeout });
}

export async function waitForToastToHide(page: Page, timeout = 8_000): Promise<void> {
  await expect(page.getByTestId('app-toast')).toBeHidden({ timeout });
}

/** 删除确认框：Vant Dialog 暴露 role=dialog；确认按钮用 `confirm-delete`。 */
export function confirmDeleteDialog(page: Page, messagePart: string): Locator {
  return page.getByRole('dialog').filter({ hasText: messagePart });
}

/* ------------------------------------------------------------------ */
/* 记录编辑与底部导航                                                  */
/* ------------------------------------------------------------------ */

export type TabName = 'home' | 'records' | 'stats' | 'growth' | 'profile';

/**
 * 每个 Tab 的落地锚点。点击后必须等目标页真实渲染，避免离线/懒加载失败时
 * 仍停留在原页面却被误判为“已切换”（UI-16/TE04-10 的历史教训）。
 * 优先使用页面根 testid；旧构建/旧 worktree 缺少根节点时退回页面内稳定节点。
 */
const TAB_PAGE_ROOT: Record<TabName, string> = {
  home: 'home-page',
  records: 'records-page',
  stats: 'stats-page',
  growth: 'growth-page',
  profile: 'profile-page',
};

const TAB_FALLBACK_ANCHOR: Record<TabName, string> = {
  home: 'baby-card',
  records: 'records-date-nav',
  stats: 'stats-range-7',
  growth: 'growth-add',
  profile: 'profile-sync-status',
};

export async function openTab(page: Page, tab: TabName): Promise<void> {
  await page.getByTestId(`tabbar-${tab}`).click();
  try {
    await expect(page.getByTestId(TAB_PAGE_ROOT[tab])).toBeVisible({ timeout: 5_000 });
  } catch {
    await expect(page.getByTestId(TAB_FALLBACK_ANCHOR[tab])).toBeVisible({ timeout: 15_000 });
  }
}

/** 打开记录页第一条记录的编辑弹窗。 */
export async function openRecordEdit(page: Page): Promise<void> {
  await page.getByTestId('record-edit').first().click();
  await expect(page.getByTestId('record-edit-sheet')).toBeVisible();
}

/**
 * 编辑弹窗内奶量输入。
 * 注意：关闭后的快速记录弹窗仍在 DOM 中（v-show），页面级 testid 会命中多个节点，
 * 因此必须从 `record-edit-amount` 作用域内取输入框。
 */
export function editAmountInput(page: Page): Locator {
  return page.getByTestId('record-edit-amount').getByTestId('formula-amount-input');
}

export async function setEditAmount(page: Page, amount: number): Promise<void> {
  await editAmountInput(page).fill(String(amount));
}

export async function saveRecordEdit(page: Page): Promise<void> {
  await page.getByTestId('record-edit-save').click();
  await expect(page.getByTestId('record-edit-sheet')).toBeHidden({ timeout: 10_000 });
}

/* ------------------------------------------------------------------ */
/* 轮询与下载                                                          */
/* ------------------------------------------------------------------ */

export async function pollUntil<T>(
  probe: () => Promise<T>,
  predicate: (value: T) => boolean,
  message: string,
  timeout = 10_000,
  interval = 200,
): Promise<T> {
  const deadline = Date.now() + timeout;
  let last: T | undefined;
  let lastError: unknown;
  do {
    try {
      last = await probe();
      if (predicate(last)) return last;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  } while (Date.now() < deadline);
  throw new Error(
    `${message}（超时 ${timeout}ms）` +
      (lastError ? `，最后错误：${String(lastError)}` : ''),
  );
}

export async function waitForFeedingCount(
  api: E2eApi,
  babyId: string,
  date: string,
  count: number,
  timeout = 10_000,
): Promise<FeedingDto[]> {
  const result = await pollUntil(
    () => api.listFeedings(babyId, date),
    (page) => page.items.filter((item) => !item.deletedAt).length === count,
    `等待 ${date} 喂养记录数达到 ${count}`,
    timeout,
  );
  return result.items.filter((item) => !item.deletedAt);
}

/** 捕获导出下载：兼容 target=_blank 新窗口与同页导航两种下载归属。 */
export async function withDownload(
  context: BrowserContext,
  page: Page,
  action: () => Promise<void>,
  timeout = 20_000,
): Promise<Download> {
  let resolveDownload!: (download: Download) => void;
  let rejectDownload!: (error: Error) => void;
  const promise = new Promise<Download>((resolve, reject) => {
    resolveDownload = resolve;
    rejectDownload = reject;
  });
  const timer = setTimeout(() => rejectDownload(new Error('未捕获到下载事件')), timeout);
  const handler = (download: Download): void => {
    clearTimeout(timer);
    resolveDownload(download);
  };
  const popups: Page[] = [];
  page.on('download', handler);
  const onPage = (popup: Page): void => {
    popups.push(popup);
    popup.on('download', handler);
  };
  context.on('page', onPage);

  let download: Download | undefined;
  try {
    await action();
    download = await promise;
  } finally {
    clearTimeout(timer);
    page.off('download', handler);
    context.off('page', onPage);
    for (const popup of popups) popup.off('download', handler);
  }
  if (!download) throw new Error('未捕获到下载事件');
  return download;
}

export async function readDownloadBytes(download: Download): Promise<Buffer> {
  const stream = await download.createReadStream();
  if (!stream) throw new Error('下载内容为空');
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk as Buffer));
  }
  return Buffer.concat(chunks);
}

/* 错误收集统一使用 `helpers/page.ts` 的 `expectNoPageErrors`（Q-23）。 */
