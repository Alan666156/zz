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

/** 浏览器自动产生的资源加载失败日志前缀（Q-23 统一豁免）。 */
export const RESOURCE_LOAD_ERROR_PREFIX = 'Failed to load resource:';

const CONSOLE_ERROR_PREFIX = 'console.error: ';

/** 控制台错误条目是否属于浏览器资源加载失败（与 app 代码无关）。 */
export function isBrowserResourceError(error: string): boolean {
  const text = error.startsWith(CONSOLE_ERROR_PREFIX)
    ? error.slice(CONSOLE_ERROR_PREFIX.length)
    : error;
  return text.startsWith(RESOURCE_LOAD_ERROR_PREFIX);
}

/**
 * 收集控制台 error 与未捕获异常；资源加载失败带上来源 URL 便于排查。
 * 豁免只按 Q-23 的前缀判断，不按状态码或 URL 逐条白名单。
 */
export function collectPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') {
      const url = message.location()?.url;
      errors.push(`${CONSOLE_ERROR_PREFIX}${message.text()}${url ? ` (${url})` : ''}`);
    }
  });
  page.on('pageerror', (error) => {
    errors.push(`pageerror: ${error.message}`);
  });
  return errors;
}

/**
 * Q-23：只豁免浏览器自动资源加载失败日志；pageerror 与其余 console.error 一律失败。
 * 预期 HTTP 状态必须由响应断言单独覆盖，不能用本函数代替接口断言。
 */
export function expectNoPageErrors(errors: readonly string[]): void {
  const unexpected = errors.filter((message) => !isBrowserResourceError(message));
  expect(unexpected, `页面出现未预期的错误：\n${unexpected.join('\n')}`).toEqual([]);
}
