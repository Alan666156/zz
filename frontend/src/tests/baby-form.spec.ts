import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import BabyForm from '@/components/baby/BabyForm.vue'

describe('BabyForm', () => {
  it('空表单不提交并展示校验错误', async () => {
    const wrapper = mount(BabyForm)
    await wrapper.find('.baby-form__submit').trigger('click')

    expect(wrapper.emitted('submit')).toBeUndefined()
    expect(wrapper.text()).toContain('请输入宝宝昵称')
    expect(wrapper.text()).toContain('请选择出生日期')
  })

  it('合法输入提交 payload（昵称 trim）', async () => {
    const wrapper = mount(BabyForm, { props: { showDefault: false } })
    await wrapper.find('input[placeholder="例如：小满"]').setValue('  小满  ')
    await wrapper.find('input[type="date"]').setValue('2026-03-01')
    await wrapper.find('.baby-form__submit').trigger('click')

    const emitted = wrapper.emitted('submit')
    expect(emitted).toHaveLength(1)
    expect(emitted?.[0][0]).toEqual({
      name: '小满',
      gender: 'UNKNOWN',
      birthDate: '2026-03-01',
      isDefault: false,
    })
  })

  it('出生日期早于 3 年被拒绝', async () => {
    const wrapper = mount(BabyForm, { props: { showDefault: false } })
    await wrapper.find('input[placeholder="例如：小满"]').setValue('小满')
    await wrapper.find('input[type="date"]').setValue('2020-01-01')
    await wrapper.find('.baby-form__submit').trigger('click')

    expect(wrapper.emitted('submit')).toBeUndefined()
    expect(wrapper.text()).toContain('3 岁以内')
  })

  it('允许空昵称时使用默认“宝宝”', async () => {
    const wrapper = mount(BabyForm, {
      props: { allowEmptyName: true, showDefault: false, submitText: '开始使用' },
    })
    await wrapper.find('input[type="date"]').setValue('2026-03-01')
    await wrapper.find('.baby-form__submit').trigger('click')

    const emitted = wrapper.emitted('submit')
    expect(emitted?.[0][0]).toMatchObject({ name: '宝宝', birthDate: '2026-03-01' })
  })
})
