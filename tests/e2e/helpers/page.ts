import {
  expect,
  request as playwrightRequest,
  type APIRequestContext,
  type Page,
  type Request,
} from '@playwright/test';

import { API_BASE_URL } from '../../api/helpers/env';

/**
 * 捕获页面发出的首个 /api/v1/ 请求中的 X-Device-Id。
 * 必须在 page.goto() 之前调用，否则可能错过 onboarding 的首个请求。
 */
export async function captureDeviceId(page: Page, timeoutMs = 15_000): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => {
      page.off('request', onRequest);
      reject(new Error(`未在 ${timeoutMs}ms 内捕获到 X-Device-Id`));
    }, timeoutMs);

    const onRequest = (request: Request): void => {
      if (!request.url().includes('/api/v1/')) {
        return;
      }
      const deviceId = request.headers()['x-device-id'];
      if (deviceId) {
        clearTimeout(timer);
        page.off('request', onRequest);
        resolve(deviceId);
      }
    };

    page.on('request', onRequest);
  });
}

/** 用捕获到的设备 ID 创建独立 API 上下文，用于断言后端真实状态。 */
export async function apiContextForDevice(deviceId: string): Promise<APIRequestContext> {
  return playwrightRequest.newContext({
    baseURL: API_BASE_URL,
    extraHTTPHeaders: {
      'X-Device-Id': deviceId,
      'X-Client-Version': '1.0.0-e2e',
    },
  });
}

/** 收集控制台 error 与未捕获异常；离线场景需在 TE-03 中维护白名单。 */
export function collectPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') {
      errors.push(`console.error: ${message.text()}`);
    }
  });
  page.on('pageerror', (error) => {
    errors.push(`pageerror: ${error.message}`);
  });
  return errors;
}

export function expectNoPageErrors(errors: readonly string[]): void {
  expect(errors, `页面出现未预期的错误：\n${errors.join('\n')}`).toEqual([]);
}
