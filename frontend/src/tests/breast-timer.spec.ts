import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import BreastTimerSheet from '@/components/record/BreastTimerSheet.vue'
import type { BreastSide } from '@/types/models'

interface TimerExposed {
  start: () => void
  pause: () => void
  resume: () => void
  finish: () => void
  reset: () => void
}

describe('BreastTimerSheet', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 9, 26, 10, 0, 0))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('自动开始、暂停、继续与结束', async () => {
    // onMounted 自动开始时会同步 emit，此时 mount 尚未返回
    const holder: { wrapper?: ReturnType<typeof mount> } = {}
    const wrapper = mount(BreastTimerSheet, {
      props: {
        durationSec: 0,
        side: 'LEFT' as BreastSide,
        autoStart: true,
        'onUpdate:durationSec': (value: number) => void holder.wrapper?.setProps({ durationSec: value }),
      },
    })
    holder.wrapper = wrapper

    expect(wrapper.emitted('started')).toHaveLength(1)
    expect(wrapper.emitted('started')?.[0][0]).toMatch(/[+-]\d{2}:\d{2}$/)

    await vi.advanceTimersByTimeAsync(5000)
    await nextTick()
    expect(wrapper.get('[data-test="timer-display"]').text()).toBe('00:05')

    const vm = wrapper.vm as unknown as TimerExposed
    vm.pause()
    await nextTick()
    await vi.advanceTimersByTimeAsync(3000)
    await nextTick()
    expect(wrapper.get('[data-test="timer-display"]').text()).toBe('00:05')

    vm.resume()
    await vi.advanceTimersByTimeAsync(2000)
    await nextTick()
    expect(wrapper.get('[data-test="timer-display"]').text()).toBe('00:07')

    vm.finish()
    await nextTick()
    const finishEvents = wrapper.emitted('finish')
    expect(finishEvents).toHaveLength(1)
    expect(finishEvents?.[0][0]).toMatchObject({ durationSec: 7 })

    wrapper.unmount()
  })

  it('切换侧别触发 update:side', async () => {
    const wrapper = mount(BreastTimerSheet, {
      props: { durationSec: 0, side: 'LEFT' as BreastSide, autoStart: false },
    })
    const buttons = wrapper.findAll('.timer__side')
    await buttons[1].trigger('click')
    expect(wrapper.emitted('update:side')?.[0]).toEqual(['RIGHT'])
    wrapper.unmount()
  })
})
