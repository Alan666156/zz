<script setup lang="ts">
import { computed, ref } from 'vue'
import type { EChartsOption } from 'echarts'
import { useChart } from '@/composables/useChart'
import type { GrowthMetric, GrowthTrendPoint } from '@/types/models'
import { growthMetricValue } from '@/utils/growth'

const props = defineProps<{
  points: GrowthTrendPoint[]
  metric: GrowthMetric
}>()

const container = ref<HTMLElement | null>(null)

const metricConfig: Record<GrowthMetric, { name: string; color: string; unit: string }> = {
  height: { name: '身高', color: '#ff7a52', unit: 'cm' },
  weight: { name: '体重', color: '#4db6ac', unit: 'kg' },
  head: { name: '头围', color: '#7986cb', unit: 'cm' },
}

const option = computed<EChartsOption>(() => {
  const config = metricConfig[props.metric]
  return {
    animation: false,
    color: [config.color],
    grid: { left: 10, right: 16, top: 26, bottom: 8, containLabel: true },
    tooltip: {
      trigger: 'axis',
      valueFormatter: (value: unknown) =>
        value === null || value === undefined ? '--' : `${value} ${config.unit}`,
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
      scale: true,
      axisLabel: { color: '#969799', fontSize: 10 },
      splitLine: { lineStyle: { color: '#f2f3f5' } },
    },
    series: [
      {
        name: config.name,
        type: 'line',
        data: props.points.map((point) => growthMetricValue(point, props.metric)),
        connectNulls: false,
        smooth: false,
        symbolSize: 5,
        lineStyle: { width: 2 },
        areaStyle: { opacity: 0.1 },
      },
    ],
  }
})

const { error } = useChart(container, option)
</script>

<template>
  <div class="growth-chart" data-testid="growth-chart">
    <div ref="container" class="growth-chart__canvas"></div>
    <p v-if="error" class="growth-chart__error">{{ error }}</p>
  </div>
</template>

<style scoped>
.growth-chart {
  position: relative;
  width: 100%;
  height: 240px;
}

.growth-chart__canvas {
  width: 100%;
  height: 100%;
}

.growth-chart__error {
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
