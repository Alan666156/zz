import { expect, test } from '@playwright/test';

import { ApiClient, expectError, expectOk, newAnonymousClient } from './helpers/api-client';
import { countDevicesByHash, execSql } from './helpers/db';
import { deviceHashHex } from './helpers/device-hash';
import { uuid } from './helpers/fixtures';
import { redisDel } from './helpers/redis';
import { deviceCacheKey } from './helpers/redis-keys';
import { resetApiState, setupDevice, type Baby } from './helpers/scenario';

/**
 * 契约：docs/architecture/v1.0-baby-feeding.md §4.4、§4.2、§3.2.2
 * 用例：docs/tests/v1.0.md §6（DEV-01..DEV-06）
 * 状态：TE-02 可执行断言。
 */
test.describe('设备（DEV）', () => {
  test.beforeEach(async () => {
    await resetApiState();
  });

  test('DEV-01 新设备初始化', async ({ request }) => {
    const deviceId = uuid();
    const client = new ApiClient(request, deviceId);

    const response = await client.post('/devices/init', {
      platform: 'H5',
      appVersion: '1.0.0',
    });
    const body = await expectOk<{
      deviceId: string;
      created: boolean;
      firstSeenAt: string;
      serverTime: string;
    }>(response);

    expect(body.data.created).toBe(true);
    expect(body.data.deviceId).toBe(deviceId);
    expect(body.data.firstSeenAt).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
    );
    expect(body.data.serverTime).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
    );
    expect(body.serverTime).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);

    const babies = await expectOk<Baby[]>(await client.get('/babies'));
    expect(babies.data).toEqual([]);
  });

  test('DEV-02 init 幂等并更新版本', async ({ request }) => {
    const deviceId = uuid();
    const client = new ApiClient(request, deviceId);

    const first = await expectOk<{ deviceId: string; created: boolean }>(
      await client.post('/devices/init', { platform: 'H5', appVersion: '1.0.0' }),
    );
    expect(first.data.created).toBe(true);

    const second = await expectOk<{ deviceId: string; created: boolean }>(
      await client.post('/devices/init', { platform: 'H5', appVersion: '1.0.1' }),
    );
    expect(second.data.created).toBe(false);
    expect(second.data.deviceId).toBe(deviceId);

    expect(countDevicesByHash(deviceHashHex(deviceId))).toBe(1);
  });

  test('DEV-03 缺少 / 非法 X-Device-Id', async ({ request }) => {
    const { client, baby } = await setupDevice(request).then(async (setup) => {
      const created = await expectOk<{ baby: Baby }>(
        await setup.client.post('/babies', {
          name: '小满',
          birthDate: '2026-03-01',
        }),
      );
      return { ...setup, baby: created.data.baby };
    });

    const probes: Array<{ path: string; method: 'GET' | 'POST'; data?: object }> = [
      { path: '/babies', method: 'GET' },
      {
        path: '/feeding-records',
        method: 'POST',
        data: {
          babyId: baby.id,
          feedType: 'FORMULA',
          amountValue: 120,
          amountUnit: 'ML',
          startedAt: '2026-10-20T10:00:00+08:00',
        },
      },
      { path: '/stats/daily?babyId=' + baby.id + '&date=2026-10-20', method: 'GET' },
      {
        path: '/exports/feeding-records',
        method: 'POST',
        data: { babyId: baby.id, from: '2026-10-20', to: '2026-10-20' },
      },
      {
        path: '/sync/push',
        method: 'POST',
        data: { batchId: uuid(), clientTime: '2026-10-26T16:00:00+08:00', changes: [] },
      },
      { path: '/growth-records?babyId=' + baby.id, method: 'GET' },
    ];

    for (const probe of probes) {
      const missing = await client.call(probe.method, probe.path, {
        omitDeviceHeader: true,
        ...(probe.data ? { data: probe.data } : {}),
      });
      await expectError(missing, 400, 'DEVICE_ID_REQUIRED');

      const invalid = await client.call(probe.method, probe.path, {
        headers: { 'X-Device-Id': 'not-a-uuid' },
        ...(probe.data ? { data: probe.data } : {}),
      });
      await expectError(invalid, 400, 'DEVICE_ID_INVALID');
    }
  });

  test('DEV-04 未注册设备访问业务接口', async ({ request }) => {
    const unregisteredId = uuid();
    const client = newAnonymousClient(request, unregisteredId);

    await expectError(await client.get('/babies'), 409, 'DEVICE_NOT_REGISTERED');
    const create = await client.post('/babies', {
      name: '小满',
      birthDate: '2026-03-01',
    });
    await expectError(create, 409, 'DEVICE_NOT_REGISTERED');

    // 初始化后应看到空列表，说明上一步没有写入数据。
    const init = await expectOk<{ created: boolean }>(
      await client.post('/devices/init', { platform: 'H5', appVersion: '1.0.0' }),
    );
    expect(init.data.created).toBe(true);
    const babies = await expectOk<Baby[]>(await client.get('/babies'));
    expect(babies.data).toEqual([]);
  });

  test('DEV-05 init 参数校验', async ({ request }) => {
    const create = (body: object) => {
      const client = new ApiClient(request, uuid());
      return client.post('/devices/init', body);
    };

    await expectError(await create({ platform: 'ANDROID', appVersion: '1.0.0' }), 400, 'VALIDATION_ERROR');
    await expectError(
      await create({ platform: 'H5', appVersion: 'a'.repeat(33) }),
      400,
      'VALIDATION_ERROR',
    );

    const maxVersion = await expectOk<{ created: boolean }>(
      await create({ platform: 'H5', appVersion: 'a'.repeat(32) }),
    );
    expect(maxVersion.data.created).toBe(true);

    const emptyBody = await expectOk<{ created: boolean }>(await create({}));
    expect(emptyBody.data.created).toBe(true);
  });

  test('DEV-06 设备禁用后所有业务接口 403', async ({ request }) => {
    const { client, deviceId } = await setupDevice(request);
    const hash = deviceHashHex(deviceId);

    try {
      execSql(
        `UPDATE device SET status='DISABLED' WHERE device_uid_hash = UNHEX('${hash}')`,
      );
      // 直接改库绕过了业务层的“禁用后 DEL”，必须手动失效设备缓存，
      // 否则 30 分钟内仍会读到 ACTIVE（服务端缓存本身工作正常）。
      redisDel(deviceCacheKey(hash));

      await expectError(await client.get('/babies'), 403, 'DEVICE_DISABLED');
      await expectError(
        await client.post('/devices/init', { platform: 'H5', appVersion: '1.0.0' }),
        403,
        'DEVICE_DISABLED',
      );
    } finally {
      execSql(
        `UPDATE device SET status='ACTIVE' WHERE device_uid_hash = UNHEX('${hash}')`,
      );
      redisDel(deviceCacheKey(hash));
    }

    const restored = await expectOk<Baby[]>(await client.get('/babies'));
    expect(restored.data).toEqual([]);
  });
});
