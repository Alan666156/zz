import { describe, expect, it, vi } from 'vitest'
import {
  resolveExportDownloadUrl,
  triggerExportDownload,
} from '@/api/export'

describe('export download url', () => {
  it('相对 downloadUrl 补全为当前 origin 的绝对地址', () => {
    expect(resolveExportDownloadUrl('/api/v1/exports/feeding-records/token.csv')).toBe(
      `${window.location.origin}/api/v1/exports/feeding-records/token.csv`,
    )
  })

  it('绝对 downloadUrl 原样返回', () => {
    const url = 'https://cdn.example.com/api/v1/exports/x.csv'
    expect(resolveExportDownloadUrl(url)).toBe(url)
  })

  it('通过新窗口 link 触发下载，不做 blob 下载', () => {
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined)

    triggerExportDownload('/api/v1/exports/feeding-records/token.csv')

    expect(click).toHaveBeenCalledTimes(1)
    const anchor = click.mock.instances[0] as unknown as HTMLAnchorElement
    expect(anchor.href).toBe(
      `${window.location.origin}/api/v1/exports/feeding-records/token.csv`,
    )
    expect(anchor.target).toBe('_blank')
    expect(document.querySelector('a[href*="token.csv"]')).toBeNull()
    click.mockRestore()
  })
})
