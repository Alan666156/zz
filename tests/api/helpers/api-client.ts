import { randomUUID } from 'node:crypto';

import { expect, type APIRequestContext, type APIResponse } from '@playwright/test';

import { API_CLIENT_VERSION, API_PREFIX } from './env';

export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE';

export interface ApiEnvelope<T = unknown> {
  code: string;
  message: string;
  data: T;
  requestId: string;
  serverTime: string;
}

export interface CallOptions {
  /** 覆盖默认请求头；可用于传错误/缺失的 X-Device-Id。 */
  headers?: Record<string, string>;
  /** JSON 请求体（对象）或原始字符串。 */
  data?: string | object;
  /** 明确不发送 X-Device-Id。 */
  omitDeviceHeader?: boolean;
}

export class ApiClient {
  constructor(
    private readonly context: APIRequestContext,
    readonly deviceId: string | null,
  ) {}

  async call(method: HttpMethod, path: string, options: CallOptions = {}): Promise<APIResponse> {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'X-Client-Version': API_CLIENT_VERSION,
    };

    if (this.deviceId && !options.omitDeviceHeader) {
      headers['X-Device-Id'] = this.deviceId;
    }
    Object.assign(headers, options.headers);

    const hasBody = options.data !== undefined;
    if (hasBody && !headers['Content-Type'] && !headers['content-type']) {
      headers['Content-Type'] = 'application/json';
    }

    return this.context.fetch(`${API_PREFIX}${path}`, {
      method,
      headers,
      ...(hasBody ? { data: options.data } : {}),
    });
  }

  get(path: string, options: CallOptions = {}): Promise<APIResponse> {
    return this.call('GET', path, options);
  }

  post(path: string, data?: string | object, options: CallOptions = {}): Promise<APIResponse> {
    return this.call('POST', path, { ...options, data });
  }

  patch(path: string, data?: string | object, options: CallOptions = {}): Promise<APIResponse> {
    return this.call('PATCH', path, { ...options, data });
  }

  delete(path: string, options: CallOptions = {}): Promise<APIResponse> {
    return this.call('DELETE', path, options);
  }
}

/** 解析统一响应包并校验公共字段。 */
export async function readEnvelope<T = unknown>(response: APIResponse): Promise<ApiEnvelope<T>> {
  const body = (await response.json()) as ApiEnvelope<T>;
  expect(body).toMatchObject({
    code: expect.any(String),
    message: expect.any(String),
    requestId: expect.any(String),
    serverTime: expect.any(String),
  });
  expect(body).toHaveProperty('data');
  return body;
}

/** 断言 HTTP 200 + code=OK，返回响应包。 */
export async function expectOk<T = unknown>(
  response: APIResponse,
  expectedStatus = 200,
): Promise<ApiEnvelope<T>> {
  expect(response.status(), `expected HTTP ${expectedStatus}`).toBe(expectedStatus);
  const body = await readEnvelope<T>(response);
  expect(body.code).toBe('OK');
  return body;
}

/** 断言错误状态码与业务错误码。 */
export async function expectError(
  response: APIResponse,
  expectedStatus: number,
  expectedCode: string,
): Promise<ApiEnvelope<unknown>> {
  expect(response.status(), `expected HTTP ${expectedStatus}`).toBe(expectedStatus);
  const body = await readEnvelope(response);
  expect(body.code).toBe(expectedCode);
  return body;
}

export interface InitData {
  deviceId: string;
  created: boolean;
  firstSeenAt: string;
  serverTime: string;
}

/** 生成新设备 UUID 并初始化，返回绑定该设备的客户端。 */
export async function newDeviceClient(
  request: APIRequestContext,
  appVersion = '1.0.0',
): Promise<{ client: ApiClient; deviceId: string; init: InitData }> {
  const deviceId = randomUUID();
  const client = new ApiClient(request, deviceId);
  const response = await client.post('/devices/init', { platform: 'H5', appVersion });
  const body = await expectOk<InitData>(response);
  return { client, deviceId, init: body.data };
}

/** 未初始化的设备客户端（用于 DEV-04 等）。 */
export function newAnonymousClient(
  request: APIRequestContext,
  deviceId = randomUUID(),
): ApiClient {
  return new ApiClient(request, deviceId);
}
