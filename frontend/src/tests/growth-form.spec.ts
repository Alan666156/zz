import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import GrowthForm from '@/components/growth/GrowthForm.vue'
import { todayLocalDate } from '@/utils/date'
import type { GrowthRecordInput } from '@/types/models'

const apiMocks = vi.hoisted(() => ({
  listGrowthRecords: vi.fn(),
  fetchLatestGrowthRecord: vi.fn(),
  createGrowthRecordRequest: vi.fn(),
  patchGrowthRecordRequest: vi.fn(),
  deleteGrowthRecordRequest: vi.fn(),
}))

vi.mock('@/api/growth', () => apiMocks)

function mountForm() {
  return mount(GrowthForm, {
    props: {
      show: true,
      babyId: 'baby-1',
      birthDate: '2026-03-01',
      record: null,
    },
  })
}

describe('GrowthForm', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true })
    apiMocks.createGrowthRecordRequest.mockReset()
    apiMocks.createGrowthRecordRequest.mockImplementation(
      async (input: GrowthRecordInput & { id: string; babyId: string }) => ({
        created: true,
        record: {
          ...input,
          heightCm: input.heightCm ?? null,
          weightKg: input.weightKg ?? null,
          headCircumferenceCm: input.headCircumferenceCm ?? null,
          note: input.note ?? null,
          revision: 1,
          createdAt: '2026-10-20T08:00:00.000Z',
          updatedAt: '2026-10-20T08:00:00.000Z',
          deletedAt: null,
        },
      }),
    )
  })

  it('三项全空时保存按钮禁用', async () => {
    const wrapper = mountForm()
    const save = wrapper.get('[data-testid="growth-form-save"]')

    expect(save.attributes('disabled')).toBeDefined()

    await wrapper.get('[data-testid="growth-form-height"]').setValue('68.5')
    expect(save.attributes('disabled')).toBeUndefined()
  })

  it('只填一项也能保存', async () => {
    const wrapper = mountForm()
    await wrapper.get('[data-testid="growth-form-weight"]').setValue('8.12')
    await wrapper.get('[data-testid="growth-form-save"]').trigger('click')
    await flushPromises()
    await vi.waitFor(() => {
      expect(apiMocks.createGrowthRecordRequest).toHaveBeenCalledTimes(1)
    })
    const payload = apiMocks.createGrowthRecordRequest.mock.calls[0][0]
    expect(payload).toMatchObject({
      babyId: 'baby-1',
      measuredOn: todayLocalDate(),
      heightCm: null,
      weightKg: 8.12,
      headCircumferenceCm: null,
    })
    expect(wrapper.emitted('saved')).toHaveLength(1)
    expect(wrapper.emitted('update:show')?.[0]).toEqual([false])
  })

  it('超精度显示字段错误且不提交', async () => {
    const wrapper = mountForm()
    await wrapper.get('[data-testid="growth-form-head"]').setValue('43.55')
    await wrapper.get('[data-testid="growth-form-save"]').trigger('click')
    await flushPromises()

    expect(apiMocks.createGrowthRecordRequest).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('头围最多 1 位小数')
  })
})
