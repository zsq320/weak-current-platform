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

// 平台统一图表主题：工程蓝 + 安全橙 + 语义色 + 中性灰坐标轴
echarts.registerTheme('app', {
  color: ['#1B5288', '#E07A16', '#1F9451', '#C9811A', '#5E86B0', '#CF4A4A', '#8DA9C6'],
  backgroundColor: 'transparent',
  textStyle: { fontFamily: '"PingFang SC","Microsoft YaHei",sans-serif' },
  title: { textStyle: { color: '#1B2430', fontSize: 14, fontWeight: 600 } },
  legend: { textStyle: { color: '#66707F' }, itemWidth: 14, itemHeight: 8 },
  grid: { left: 12, right: 16, top: 44, bottom: 8, containLabel: true },
  categoryAxis: {
    axisLine: { lineStyle: { color: '#E3E6EA' } },
    axisTick: { show: false },
    axisLabel: { color: '#66707F', fontSize: 12 },
    splitLine: { show: false }
  },
  valueAxis: {
    axisLine: { show: false },
    axisTick: { show: false },
    axisLabel: { color: '#98A1AE', fontSize: 12 },
    splitLine: { lineStyle: { color: '#EEF0F3' } }
  },
  bar: { barMaxWidth: 26, itemStyle: { borderRadius: [3, 3, 0, 0] } }
})

export default echarts
