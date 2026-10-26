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

/**
 * 已知的网络噪音（不是应用异常）：
 * - 首次 GET /babies 在设备注册前返回 409 DEVICE_NOT_REGISTERED（契约 §5.4 的正常流程）。
 * 逐条说明，避免笼统豁免所有 console.error。
 * favicon 404 已由 FE-02 修复，不再豁免；若复现即视为回归。
 */
export const KNOWN_NETWORK_ERRORS: readonly RegExp[] = [
  /Failed to load resource: the server responded with a status of 409 \(Conflict\).*\/api\/v1\/babies/,
];

/** 收集控制台 error 与未捕获异常；资源加载失败带上来源 URL 以便精确豁免。 */
export function collectPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') {
      const url = message.location()?.url;
      errors.push(`console.error: ${message.text()}${url ? ` (${url})` : ''}`);
    }
  });
  page.on('pageerror', (error) => {
    errors.push(`pageerror: ${error.message}`);
  });
  return errors;
}

export function expectNoPageErrors(
  errors: readonly string[],
  allowed: readonly RegExp[] = KNOWN_NETWORK_ERRORS,
): void {
  const unexpected = errors.filter((message) => !allowed.some((pattern) => pattern.test(message)));
  expect(unexpected, `页面出现未预期的错误：\n${unexpected.join('\n')}`).toEqual([]);
}
