<script setup lang="ts">
import { computed, ref } from 'vue'
import type { EChartsOption } from 'echarts'
import { useChart } from '@/composables/useChart'
import type { StatsMetric, TrendPoint } from '@/types/models'
import { metricValue } from '@/utils/stats'

const props = defineProps<{
  points: TrendPoint[]
  metric: StatsMetric
}>()

const container = ref<HTMLElement | null>(null)

const metricConfig: Record<StatsMetric, { name: string; color: string; unit: string }> = {
  count: { name: '喂养次数', color: '#ff7a52', unit: '次' },
  amount: { name: '总奶量', color: '#ffb74d', unit: 'ml' },
  duration: { name: '总时长', color: '#4db6ac', unit: '分钟' },
}

const option = computed<EChartsOption>(() => {
  const config = metricConfig[props.metric]
  return {
    animation: false,
    color: [config.color],
    grid: { left: 10, right: 16, top: 26, bottom: 8, containLabel: true },
    tooltip: {
      trigger: 'axis',
      valueFormatter: (value: unknown) => `${value ?? 0} ${config.unit}`,
    },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: props.points.map((point) => point.date.slice(5)),
      axisTick: { show: false },
      axisLine: { lineStyle: { color: '#ebedf0' } },
      axisLabel: { color: '#969799', fontSize: 10 },
    },
    yAxis: {
      type: 'value',
      minInterval: props.metric === 'count' ? 1 : 0,
      axisLabel: { color: '#969799', fontSize: 10 },
      splitLine: { lineStyle: { color: '#f2f3f5' } },
    },
    series: [
      {
        name: config.name,
        type: 'line',
        data: props.points.map((point) => metricValue(point, props.metric)),
        smooth: false,
        symbolSize: 4,
        lineStyle: { width: 2 },
        areaStyle: { opacity: 0.1 },
      },
    ],
  }
})

const { error } = useChart(container, option)
</script>

<template>
  <div class="trend-chart" data-testid="stats-chart">
    <div ref="container" class="trend-chart__canvas" data-testid="stats-chart-canvas"></div>
    <p v-if="error" class="trend-chart__error">{{ error }}</p>
  </div>
</template>

<style scoped>
.trend-chart {
  position: relative;
  width: 100%;
  height: 250px;
}

.trend-chart__canvas {
  width: 100%;
  height: 100%;
}

.trend-chart__error {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0;
  font-size: 13px;
  color: var(--app-text-secondary);
}
</style>
