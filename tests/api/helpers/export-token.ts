import { createHmac, randomUUID } from 'node:crypto';
import { EXPORT_TOKEN_TTL_SECONDS } from './env';

/**
 * 导出 token canonical 格式（addendum §4，字段名以已实现的 ExportTokenService 为准）：
 *
 *   payloadPart = base64url(JSON.stringify({v,d,b,f,t,e,n}))
 *   signature   = base64url(HMAC-SHA256(APP_EXPORT_TOKEN_KEY, payloadPart))
 *   token       = payloadPart + "." + signature
 *
 * 字段：v=版本、d=设备 HMAC 摘要 hex、b=babyId、f=from、t=to、e=unix 秒过期时间、n=nonce。
 * base64url 不带 padding；顺序参与签名。
 *
 * 仅用于 TE-02 的过期/篡改用例；密钥必须是测试实例专用，禁止使用生产密钥。
 * 契约：docs/architecture/v1.0-contract-addendum.md §4；用例：EXP-10/11。
 */

export interface ExportTokenPayload {
  v: 1;
  /** 设备 HMAC 摘要的十六进制（不是原始设备 UUID）。 */
  d: string;
  /** 宝宝 ID。 */
  b: string;
  /** from 日期。 */
  f: string;
  /** to 日期。 */
  t: string;
  /** Unix 秒过期时间。 */
  e: number;
  /** 随机 nonce（UUID v4）。 */
  n: string;
}

function base64Url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url');
}

export function requireExportTokenKey(): string {
  const key = process.env.APP_EXPORT_TOKEN_KEY;
  if (!key) {
    throw new Error('APP_EXPORT_TOKEN_KEY is required for EXP-10/EXP-11 (test-only key)');
  }
  return key;
}

/** 键顺序固定为 v,d,b,f,t,e,n；顺序参与签名。 */
export function signExportToken(
  payload: ExportTokenPayload,
  key: string = requireExportTokenKey(),
): string {
  const canonical: ExportTokenPayload = {
    v: payload.v,
    d: payload.d,
    b: payload.b,
    f: payload.f,
    t: payload.t,
    e: payload.e,
    n: payload.n,
  };
  const payloadPart = base64Url(JSON.stringify(canonical));
  // 签名对 payloadPart 的 ASCII 字节计算；base64url 输出不带 padding。
  const signature = base64Url(createHmac('sha256', key).update(Buffer.from(payloadPart, 'ascii')).digest());
  return `${payloadPart}.${signature}`;
}

export interface TokenArgs {
  deviceHashHex: string;
  babyId: string;
  from: string;
  to: string;
}

export function newExportTokenPayload(args: TokenArgs, nowSeconds = Math.floor(Date.now() / 1000)): ExportTokenPayload {
  return {
    v: 1,
    d: args.deviceHashHex,
    b: args.babyId,
    f: args.from,
    t: args.to,
    e: nowSeconds + EXPORT_TOKEN_TTL_SECONDS,
    n: randomUUID(),
  };
}

export function signExpiredExportToken(args: TokenArgs, key?: string): string {
  const payload = newExportTokenPayload(args);
  payload.e = Math.floor(Date.now() / 1000) - 1;
  return signExportToken(payload, key);
}

export function decodeExportTokenPayload(token: string): ExportTokenPayload {
  const payloadPart = token.split('.')[0];
  if (!payloadPart) throw new Error('token has no payload segment');
  return JSON.parse(Buffer.from(payloadPart, 'base64url').toString('utf8')) as ExportTokenPayload;
}
