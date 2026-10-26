import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import QuickRecordSheet from '@/components/record/QuickRecordSheet.vue'
import type { FeedingRecordInput } from '@/types/models'
import { buildLocalFeedingRecord } from '@/utils/feeding'

const mocks = vi.hoisted(() => ({
  save: vi.fn(),
  syncRecord: vi.fn(),
}))

vi.mock('@/composables/useFeedingRecorder', () => ({
  useFeedingRecorder: () => ({ save: mocks.save, syncRecord: mocks.syncRecord }),
}))

function mountSheet(): VueWrapper {
  return mount(QuickRecordSheet, {
    props: { show: true, babyId: 'baby-1', defaultSide: 'RIGHT' },
  })
}

async function clickTab(wrapper: VueWrapper, label: string): Promise<void> {
  const tab = wrapper.findAll('.type-switch__item').find((item) => item.text() === label)
  expect(tab).toBeTruthy()
  await tab?.trigger('click')
  await nextTick()
}

async function clickButton(wrapper: VueWrapper, label: string): Promise<void> {
  const button = wrapper.findAll('button').find((item) => item.text().includes(label))
  expect(button).toBeTruthy()
  await button?.trigger('click')
  await flushPromises()
}

describe('QuickRecordSheet', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mocks.save.mockReset()
    mocks.syncRecord.mockReset()
    mocks.save.mockImplementation(async (input: FeedingRecordInput, babyId: string) =>
      buildLocalFeedingRecord(input, babyId),
    )
  })

  it('母乳：自动计时，结束后保存侧别与时长', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] })
    vi.setSystemTime(new Date(2026, 9, 26, 10, 0, 0))
    const wrapper = mountSheet()

    await vi.advanceTimersByTimeAsync(3000)
    await nextTick()
    expect(wrapper.get('[data-test="timer-display"]').text()).toBe('00:03')

    await clickButton(wrapper, '结束并保存')

    expect(mocks.save).toHaveBeenCalledTimes(1)
    const [input, babyId] = mocks.save.mock.calls[0]
    expect(input).toMatchObject({
      feedType: 'BREAST',
      breastSide: 'RIGHT',
      durationSec: 3,
      amountValue: null,
    })
    expect(babyId).toBe('baby-1')
    expect(wrapper.emitted('saved')).toHaveLength(1)
    expect(wrapper.emitted('update:show')?.[0]).toEqual([false])

    wrapper.unmount()
    vi.useRealTimers()
  })

  it('配方奶：填写奶量后保存', async () => {
    const wrapper = mountSheet()
    await clickTab(wrapper, '配方奶')
    await wrapper.find('input[placeholder="例如 120"]').setValue('120')
    await clickButton(wrapper, '保存记录')

    expect(mocks.save).toHaveBeenCalledTimes(1)
    const [input, babyId] = mocks.save.mock.calls[0]
    expect(input).toMatchObject({
      feedType: 'FORMULA',
      amountValue: 120,
      amountUnit: 'ML',
      breastSide: null,
      durationSec: null,
    })
    expect(babyId).toBe('baby-1')
    wrapper.unmount()
  })

  it('辅食：填写克数后保存', async () => {
    const wrapper = mountSheet()
    await clickTab(wrapper, '辅食')
    await wrapper.find('input[placeholder="可不填"]').setValue('30')
    await clickButton(wrapper, '保存记录')

    const [input] = mocks.save.mock.calls[0]
    expect(input).toMatchObject({
      feedType: 'SOLID',
      amountValue: 30,
      amountUnit: 'G',
      breastSide: null,
    })
    wrapper.unmount()
  })

  it('混合：计时 + 奶量一起保存', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] })
    vi.setSystemTime(new Date(2026, 9, 26, 10, 0, 0))
    const wrapper = mountSheet()

    await clickTab(wrapper, '混合')
    await vi.advanceTimersByTimeAsync(2000)
    await nextTick()
    await wrapper.find('input[placeholder="例如 120"]').setValue('90')
    await clickButton(wrapper, '结束并保存')

    const [input] = mocks.save.mock.calls[0]
    expect(input).toMatchObject({
      feedType: 'MIXED',
      breastSide: 'RIGHT',
      amountValue: 90,
      amountUnit: 'ML',
      durationSec: 2,
    })
    wrapper.unmount()
    vi.useRealTimers()
  })

  it('配方奶未填写奶量时拒绝保存', async () => {
    const wrapper = mountSheet()
    await clickTab(wrapper, '配方奶')
    await clickButton(wrapper, '保存记录')

    expect(mocks.save).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('请输入用量')
    wrapper.unmount()
  })

  it('备注与标签随记录提交', async () => {
    const wrapper = mountSheet()
    await clickTab(wrapper, '配方奶')
    await wrapper.find('input[placeholder="例如 120"]').setValue('150')
    await wrapper.find('textarea').setValue('喝得很快')
    const tagButton = wrapper.findAll('.tags__item').find((item) => item.text() === '打嗝')
    await tagButton?.trigger('click')
    await clickButton(wrapper, '保存记录')

    const [input] = mocks.save.mock.calls[0]
    expect(input.note).toBe('喝得很快')
    expect(input.tags).toEqual(['HICCUP'])
    wrapper.unmount()
  })
})
