import { expect, test } from '@playwright/test';

import {
  SYNC_LOCK_KEY,
  browserToday,
  confirmDeleteDialog,
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
  waitForToastToHide,
} from './helpers/app';
import { collectPageErrors, expectNoPageErrors } from './helpers/page';

const OFFLINE_ROUTE_COPY = '当前网络不可用，页面尚未加载，请恢复网络后重试';

/**
 * 契约：docs/architecture/v1.0-baby-feeding.md §5.4、§4.10；
 *       docs/architecture/v1.0-contract-addendum.md §7（Q-24）
 * 用例：docs/tests/v1.0.md §18（UI-15、UI-16、UI-22）
 * 状态：TE-03 可执行断言；UI-22 已随 FE-11 修复通过（CSS preload 识别 + 重试）。
 */
test.describe('E2E 离线（UI-15..16、UI-22）', () => {
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

  /**
   * Q-24：离线只允许访问已下载（在线时已进入过）的路由。
   * 先在在线状态进入记录页，等记录内容渲染，确保 RecordsView chunk 已加载；
   * 之后离线创建/编辑/删除都在首屏与记录页之间进行，不做离线 reload。
   */
  test('UI-16 已加载路由上的离线创建/编辑/删除折叠并自动同步', async ({
    page,
    context,
    request,
  }) => {
    const errors = collectPageErrors(page);
    const { api, baby, today } = await onboardWithApi(page, request);
    const banner = page.getByTestId('offline-banner');
    const items = page.getByTestId('feeding-record-item');

    // 在线种子记录：用于验证已同步记录的离线编辑（revision=1 → 同步后 2）。
    const seeded = await api.createFeeding({
      babyId: baby.id,
      feedType: 'FORMULA',
      amountValue: 100,
      amountUnit: 'ML',
      startedAt: `${today}T00:00:00+08:00`,
      endedAt: null,
      tzOffsetMinutes: 480,
    });
    expect(seeded.recordDate).toBe(today);

    // 在线预载记录页：等真实内容渲染，证明 lazy chunk 已下载。
    await openTab(page, 'records');
    await expect(items).toHaveCount(1, { timeout: 15_000 });
    await expect(items.first()).toContainText('100 毫升');
    await openTab(page, 'home');

    await context.setOffline(true);
    await expect(banner).toBeVisible({ timeout: 10_000 });

    // 离线新建 200 ML（之后删除，验证“新建未同步即删除”不会上报服务端）。
    await openQuickRecord(page);
    await selectFeedType(page, 'formula');
    await fillMilkAmount(page, 200);
    await saveQuickRecord(page);
    await expectToast(page, '已记录');
    await expect(banner).toContainText('待同步 1 条');
    await waitForToastToHide(page);

    // 在已加载路由间导航：首页 → 记录页。新记录按时间倒序排在第一条。
    await openTab(page, 'records');
    await expect(items).toHaveCount(2, { timeout: 10_000 });
    await expect(items.first()).toContainText('200 毫升');
    await expect(items.last()).toContainText('100 毫升');

    // 离线删除刚新建的 200 ML 记录：本地立即移除，outbox 撤销该条。
    await page.getByTestId('record-delete').first().click();
    const deleteDialog = confirmDeleteDialog(page, '删除后无法恢复');
    await expect(deleteDialog).toBeVisible();
    await deleteDialog.getByTestId('confirm-delete').click();
    await expectToast(page, '已删除');
    await expect(items).toHaveCount(1, { timeout: 10_000 });
    await expect(items.first()).toContainText('100 毫升');
    // TE04-11：删除未同步新建记录后 outbox 已撤销，横幅计数必须同步归零。
    await expect(banner).not.toContainText('待同步');
    await waitForToastToHide(page);

    // 第一次离线编辑：100 → 110（此时只剩种子记录）。
    await openRecordEdit(page);
    await setEditAmount(page, 110);
    await saveRecordEdit(page);
    await expectToast(page, '离线，修改待同步');
    await expect(banner).toContainText('待同步 1 条');
    await expect(items.first()).toContainText('110 毫升');
    await waitForToastToHide(page);

    // 第二次离线编辑：110 → 120，仍折叠为同一条待同步记录。
    await openRecordEdit(page);
    await expect(editAmountInput(page)).toHaveValue('110');
    await setEditAmount(page, 120);
    await saveRecordEdit(page);
    await expectToast(page, '离线，修改待同步');
    await expect(banner).toContainText('待同步 1 条');
    await expect(items).toHaveCount(1);
    await expect(items.first()).toContainText('120 毫升');
    await waitForToastToHide(page);

    // 离线继续在已加载路由间往返，记录页仍应可用。
    await openTab(page, 'home');
    await expect(page.getByTestId('quick-record-fab')).toBeVisible();
    await openTab(page, 'records');
    await expect(items).toHaveCount(1);
    await expect(items.first()).toContainText('120 毫升');

    // 恢复网络：只同步种子记录的编辑；离线新建后删除的记录不得出现。
    await context.setOffline(false);
    const synced = await pollUntil(
      () => api.listFeedings(baby.id, today),
      (result) =>
        result.items.length === 1 &&
        result.items[0].id === seeded.id &&
        result.items[0].amountValue === 120 &&
        result.items[0].revision === 2,
      '恢复网络后应同步为 1 条 120 ML 记录（revision=2），且不上报已删除的离线新建记录',
      20_000,
    );
    expect(synced.total).toBe(1);
    expect(synced.items).toHaveLength(1);
    expect(synced.items[0]).toMatchObject({
      id: seeded.id,
      feedType: 'FORMULA',
      amountValue: 120,
      amountUnit: 'ML',
      revision: 2,
      recordDate: today,
      deletedAt: null,
    });

    await expect(banner).toBeHidden({ timeout: 15_000 });
    await expect(items).toHaveCount(1);
    await expect(items.first()).toContainText('120 毫升');

    expectNoPageErrors(errors);
  });

  /**
   * Q-24 P1：未下载过的路由在离线时加载失败，必须给出可见、可重试的对话框，
   * 停留在当前路由，而不是静默无响应。关闭可选的 P2 idle prefetch，
   * 保证 RecordsView chunk 在断网前从未被请求（不依赖 prefetch 的加载时序）。
   */
  test('UI-22 未加载路由离线访问显示页面加载失败并可重试', async ({
    page,
    context,
    request,
  }) => {
    // Q-24 §7.4：P1 以对话框出现为准，不以控制台日志判定。
    // 该场景本身会触发 chunk/CSS 资源加载失败（含 pageerror），
    // 因此本用例不做 expectNoPageErrors；其余 E2E 仍执行 Q-23 口径。
    // P2 prefetch 是可选能力，且 Q-24 要求 UI-22 不得依赖它。
    // 这里关闭 idle 回调，保证记录页 chunk 在断网前从未被请求；
    // 不能用 page.route 阻断，否则失败的预取会污染浏览器 module map，
    // 恢复网络后重试仍命中缓存的失败结果，无法公平验收重试。
    await page.addInitScript(() => {
      window.requestIdleCallback = () => 0;
    });

    await onboardWithApi(page, request);
    await expect(page.getByTestId('quick-record-fab')).toBeVisible();
    const banner = page.getByTestId('offline-banner');

    await context.setOffline(true);
    await expect(banner).toBeVisible({ timeout: 10_000 });

    // 从未进入过记录页，记录页 chunk 未下载。
    await page.getByTestId('tabbar-records').click();
    const dialog = page.getByTestId('route-load-error');
    await expect(dialog).toBeVisible({ timeout: 15_000 });
    await expect(dialog).toContainText('页面加载失败');
    await expect(dialog).toContainText(OFFLINE_ROUTE_COPY);
    await expect(page.getByTestId('route-load-retry')).toBeVisible();
    expect(new URL(page.url()).pathname).toBe('/');

    // 离线重试：仍然失败，对话框再次出现，URL 仍停留首页。
    await page.getByTestId('route-load-retry').click();
    await expect(dialog).toBeVisible({ timeout: 15_000 });
    await expect(dialog).toContainText(OFFLINE_ROUTE_COPY);
    expect(new URL(page.url()).pathname).toBe('/');

    // 恢复网络后重试：真正进入记录页。
    await context.setOffline(false);
    await expect(banner).toBeHidden({ timeout: 15_000 });
    await page.getByTestId('route-load-retry').click();
    await expect(page.getByTestId('records-page')).toBeVisible({ timeout: 20_000 });
    expect(new URL(page.url()).pathname).toBe('/records');
    await expect(page.getByTestId('records-page')).toContainText('这一天没有记录');
  });
});
