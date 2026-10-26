import { expect, test } from '@playwright/test';

import {
  ACTIVE_BABY_KEY,
  DEVICE_ID_KEY,
  E2eApi,
  LAST_FEED_TYPE_KEY,
  SYNC_LOCK_KEY,
  UUID_V4_RE,
  completeOnboarding,
  expectedBabyAgeLabel,
  browserToday,
  gotoOnboarding,
  openQuickRecord,
  pollUntil,
  readLocalStorage,
  resetE2eState,
  selectFeedType,
  waitForToastToHide,
} from './helpers/app';
import { captureDeviceId, collectPageErrors, expectNoPageErrors } from './helpers/page';

/**
 * 契约：docs/architecture/v1.0-baby-feeding.md §5.2、§5.4、§4.4、§4.5
 * 用例：docs/tests/v1.0.md §18（UI-01..UI-03）
 * 状态：TE-03 可执行断言。
 */
test.describe('E2E 首次使用（UI-01..03）', () => {
  test.describe.configure({ timeout: 90_000 });

  test.beforeEach(() => {
    resetE2eState();
  });

  test('UI-01 首次打开：设备初始化 + 创建宝宝 + 首页', async ({ page, request }) => {
    const errors = collectPageErrors(page);
    const deviceIds: string[] = [];
    page.on('request', (requestEvent) => {
      if (!requestEvent.url().includes('/api/v1/')) return;
      const deviceId = requestEvent.headers()['x-device-id'];
      if (deviceId) deviceIds.push(deviceId);
    });

    interface InitResult {
      status: number;
      created: boolean | undefined;
    }
    const initResults: Array<Promise<InitResult>> = [];
    page.on('response', (response) => {
      if (!response.url().includes('/api/v1/devices/init')) return;
      initResults.push(
        (async (): Promise<InitResult> => {
          const body = (await response.json().catch(() => null)) as
            | { data?: { created?: boolean } }
            | null;
          return { status: response.status(), created: body?.data?.created };
        })(),
      );
    });

    await gotoOnboarding(page);
    await completeOnboarding(page, {
      name: '小满',
      gender: 'FEMALE',
      birthDate: '2026-03-01',
    });

    await expect(page.getByTestId('baby-card')).toContainText('小满');
    const today = await browserToday(page);
    await expect(page.getByTestId('baby-card')).toContainText(
      expectedBabyAgeLabel('2026-03-01', today),
    );

    const deviceId = await pollUntil(
      async () => deviceIds[0],
      (value) => Boolean(value),
      '未捕获到 X-Device-Id',
    );
    expect(deviceId).toMatch(UUID_V4_RE);

    // 首页渲染完成后确认设备初始化只发生一次。
    await page.waitForLoadState('networkidle');
    const inits = await Promise.all(initResults);
    expect(inits, 'POST /devices/init 应恰好调用 1 次').toHaveLength(1);
    expect(inits[0]).toMatchObject({ status: 200, created: true });

    const api = new E2eApi(request, deviceId);
    const babies = await api.listBabies();
    expect(babies).toHaveLength(1);
    expect(babies[0]).toMatchObject({
      name: '小满',
      gender: 'FEMALE',
      birthDate: '2026-03-01',
      isDefault: true,
      revision: 1,
      deletedAt: null,
    });

    // 已知且允许的日志：首次 GET /babies 返回 409 DEVICE_NOT_REGISTERED，随后自动 init。
    expectNoPageErrors(
      errors.filter(
        (message) => !/Failed to load resource.*409/.test(message),
      ),
    );
  });

  test('UI-02 刷新后设备与默认宝宝保持', async ({ page, request }) => {
    await gotoOnboarding(page);
    await completeOnboarding(page, { name: '小满' });
    await waitForToastToHide(page);

    const deviceIdBefore = await readLocalStorage(page, DEVICE_ID_KEY);
    expect(deviceIdBefore).toMatch(UUID_V4_RE);
    if (!deviceIdBefore) throw new Error('刷新前 localStorage 缺少设备 ID');

    // 产生一次“最近选择的类型”，验证固定 key。
    await openQuickRecord(page);
    await selectFeedType(page, 'formula');
    expect(await readLocalStorage(page, LAST_FEED_TYPE_KEY)).toBe('FORMULA');

    const activeBabyId = await readLocalStorage(page, ACTIVE_BABY_KEY);
    expect(activeBabyId).toBeTruthy();
    expect(await readLocalStorage(page, SYNC_LOCK_KEY)).toBeNull();

    const requestDeviceAfterReload = captureDeviceId(page);
    await page.reload();
    await expect(page.getByTestId('baby-card')).toContainText('小满');

    const deviceIdAfter = await requestDeviceAfterReload;
    expect(deviceIdAfter).toBe(deviceIdBefore);
    expect(await readLocalStorage(page, DEVICE_ID_KEY)).toBe(deviceIdBefore);
    expect(await readLocalStorage(page, ACTIVE_BABY_KEY)).toBe(activeBabyId);
    expect(await readLocalStorage(page, LAST_FEED_TYPE_KEY)).toBe('FORMULA');
    expect(await readLocalStorage(page, SYNC_LOCK_KEY)).toBeNull();

    const api = new E2eApi(request, deviceIdBefore);
    const babies = await api.listBabies();
    expect(babies).toHaveLength(1);
    expect(babies[0].id).toBe(activeBabyId);
    expect(babies[0].isDefault).toBe(true);
  });

  test('UI-03 跳过昵称使用默认“宝宝”', async ({ page, request }) => {
    await gotoOnboarding(page);
    // 不填写昵称，只选性别与出生日期。
    await completeOnboarding(page, { gender: 'FEMALE', birthDate: '2026-03-01' });

    await expect(page.getByTestId('baby-card')).toContainText('宝宝');

    const deviceId = await readLocalStorage(page, DEVICE_ID_KEY);
    expect(deviceId).toMatch(UUID_V4_RE);
    const babies = await new E2eApi(request, deviceId as string).listBabies();
    expect(babies).toHaveLength(1);
    expect(babies[0].name).toBe('宝宝');
  });
});
