import type { APIRequestContext, APIResponse } from '@playwright/test';

/** Q-01 锁定的 CSV 表头（精确，不含 BOM）。 */
export const CSV_HEADER =
  '记录ID,宝宝昵称,喂养类型,开始时间,结束时间,喂养时长(秒),母乳侧别,奶量/辅食量,单位,备注,标签,记录日期';

export const UTF8_BOM = Buffer.from([0xef, 0xbb, 0xbf]);

export interface CsvDownload {
  response: APIResponse;
  status: number;
  bytes: Buffer;
  text: string;
  headers: Record<string, string>;
}

/**
 * 下载 CSV。token 即能力凭证，默认不发送 X-Device-Id；
 * 如需验证“带其他设备头也不影响”，通过 extraHeaders 显式传入。
 */
export async function downloadCsv(
  context: APIRequestContext,
  downloadUrl: string,
  extraHeaders: Record<string, string> = {},
): Promise<CsvDownload> {
  const response = await context.get(downloadUrl, {
    headers: { Accept: 'text/csv', ...extraHeaders },
  });
  const bytes = await response.body();
  return {
    response,
    status: response.status(),
    bytes,
    text: bytes.toString('utf8'),
    headers: response.headers(),
  };
}

/** 去掉 UTF-8 BOM 后的文本。 */
export function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/**
 * RFC 4180 解析：支持引号包裹、字段内逗号/换行、双引号转义。
 * 输入应为去 BOM 文本；返回二维数组，不保留行尾空行。
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let index = 0;

  const pushField = (): void => {
    row.push(field);
    field = '';
  };
  const pushRow = (): void => {
    pushField();
    rows.push(row);
    row = [];
  };

  while (index < text.length) {
    const char = text[index];
    if (inQuotes) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 2;
          continue;
        }
        inQuotes = false;
        index += 1;
        continue;
      }
      field += char;
      index += 1;
      continue;
    }
    if (char === '"') {
      inQuotes = true;
      index += 1;
      continue;
    }
    if (char === ',') {
      pushField();
      index += 1;
      continue;
    }
    if (char === '\r' && text[index + 1] === '\n') {
      pushRow();
      index += 2;
      continue;
    }
    if (char === '\n') {
      pushRow();
      index += 1;
      continue;
    }
    field += char;
    index += 1;
  }

  // 文件以 CRLF 结尾时不产生额外空行；否则把最后一行收尾。
  if (field.length > 0 || row.length > 0) {
    pushRow();
  }
  return rows;
}
