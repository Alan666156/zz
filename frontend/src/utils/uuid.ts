/**
 * 手写 UUID v4：不依赖 crypto.randomUUID（iOS 14 / 旧 WebView 不支持）。
 * 只用 crypto.getRandomValues；缺失时抛错而不是降级 Math.random，
 * 避免生成可预测 id（契约要求 122 bit 随机，FE-09）。
 */
export function uuidV4(): string {
  const bytes = new Uint8Array(16)
  const cryptoObj = typeof globalThis !== 'undefined' ? globalThis.crypto : undefined
  if (!cryptoObj || typeof cryptoObj.getRandomValues !== 'function') {
    throw new Error('当前浏览器不支持安全随机数，请升级浏览器或更换设备')
  }
  cryptoObj.getRandomValues(bytes)
  // version 4
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  // variant 10xx
  bytes[8] = (bytes[8] & 0x3f) | 0x80

  const hex: string[] = []
  for (let i = 0; i < bytes.length; i += 1) {
    hex.push(bytes[i].toString(16).padStart(2, '0'))
  }
  const joined = hex.join('')
  return [
    joined.slice(0, 8),
    joined.slice(8, 12),
    joined.slice(12, 16),
    joined.slice(16, 20),
    joined.slice(20),
  ].join('-')
}

const UUID_V4_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function isUuidV4(value: string): boolean {
  return UUID_V4_RE.test(value)
}
