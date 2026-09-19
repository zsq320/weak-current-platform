// 按需引入 ECharts，显著减小打包体积
import * as echarts from 'echarts/core'
import { BarChart, CustomChart, LineChart, PieChart } from 'echarts/charts'
import {
  GridComponent,
  LegendComponent,
  MarkLineComponent,
  TitleComponent,
  TooltipComponent
} from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'

echarts.use([
  BarChart,
  CustomChart,
  PieChart,
  LineChart,
  GridComponent,
  LegendComponent,
  MarkLineComponent,
  TitleComponent,
  TooltipComponent,
  CanvasRenderer
])

// 平台统一图表主题：品牌蓝/青/语义色 + 中性灰坐标轴
echarts.registerTheme('app', {
  color: ['#2563EB', '#0891B2', '#16A34A', '#D97706', '#DC2626'],
  backgroundColor: 'transparent',
  textStyle: { fontFamily: '"PingFang SC","Microsoft YaHei",sans-serif' },
  title: { textStyle: { color: '#0F172A', fontSize: 14, fontWeight: 600 } },
  legend: { textStyle: { color: '#64748B' }, itemWidth: 14, itemHeight: 8 },
  grid: { left: 12, right: 16, top: 44, bottom: 8, containLabel: true },
  categoryAxis: {
    axisLine: { lineStyle: { color: '#E2E8F0' } },
    axisTick: { show: false },
    axisLabel: { color: '#64748B', fontSize: 12 },
    splitLine: { show: false }
  },
  valueAxis: {
    axisLine: { show: false },
    axisTick: { show: false },
    axisLabel: { color: '#94A3B8', fontSize: 12 },
    splitLine: { lineStyle: { color: '#EEF1F5' } }
  },
  bar: { barMaxWidth: 26, itemStyle: { borderRadius: [4, 4, 0, 0] } }
})

export default echarts
