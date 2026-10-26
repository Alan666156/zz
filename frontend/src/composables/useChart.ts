import { onBeforeUnmount, onMounted, ref, shallowRef, watch, type Ref } from 'vue'
import type { EChartsOption } from 'echarts'
import type { EChartsType } from 'echarts/core'

let corePromise: Promise<typeof import('echarts/core')> | null = null

/**
 * ECharts 按需异步加载：只有统计/生长页真正挂载时才下载图表 chunk。
 * 只注册折线图与必要组件，避免把全量 echarts 打进首屏。
 */
async function loadCore(): Promise<typeof import('echarts/core')> {
  if (!corePromise) {
    corePromise = (async () => {
      const [core, charts, components, renderers] = await Promise.all([
        import('echarts/core'),
        import('echarts/charts'),
        import('echarts/components'),
        import('echarts/renderers'),
      ])
      core.use([
        charts.LineChart,
        components.GridComponent,
        components.TooltipComponent,
        components.LegendComponent,
        renderers.CanvasRenderer,
      ])
      return core
    })()
  }
  return corePromise
}

export interface UseChartResult {
  chart: Ref<EChartsType | null>
  error: Ref<string | null>
}

/** ECharts 实例生命周期：挂载初始化、容器自适应、卸载 dispose */
export function useChart(
  container: Ref<HTMLElement | null>,
  option: Ref<EChartsOption>,
): UseChartResult {
  const chart = shallowRef<EChartsType | null>(null)
  const error = ref<string | null>(null)
  let observer: ResizeObserver | null = null
  let disposed = false

  async function ensureChart(): Promise<void> {
    if (!container.value || chart.value) return
    try {
      const core = await loadCore()
      if (disposed || !container.value) return
      const instance = core.init(container.value)
      chart.value = instance
      instance.setOption(option.value)
      if (typeof ResizeObserver !== 'undefined') {
        observer = new ResizeObserver(() => chart.value?.resize())
        observer.observe(container.value)
      }
      error.value = null
    } catch {
      error.value = '图表加载失败'
    }
  }

  watch(
    option,
    (next) => {
      chart.value?.setOption(next, true)
    },
    { deep: true },
  )

  onMounted(() => {
    void ensureChart()
  })

  onBeforeUnmount(() => {
    disposed = true
    observer?.disconnect()
    observer = null
    chart.value?.dispose()
    chart.value = null
  })

  return { chart, error }
}
