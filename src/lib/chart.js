// 统一初始化 echarts 图表（echarts 由 CDN 注入为全局）。
//  - 复用同一容器前先销毁旧实例，避免重复 init 警告；
//  - 挂 ResizeObserver 跟随容器尺寸变化自动 resize。
//    修复首屏 bug：Tailwind CDN 运行时应用 md:grid-cols-2 两列布局是异步的，
//    图表在分栏未生效时按整宽测量渲染 → 错版；切换标签重渲染才恢复。
//    ResizeObserver 在容器宽度变化（分栏生效/窗口缩放）时即时校正，无需重渲染。
export function initChart(el, option) {
  if (!el) return null;
  const existing = echarts.getInstanceByDom(el);
  if (existing) existing.dispose();
  const chart = echarts.init(el, "dark");
  chart.setOption(option);
  new ResizeObserver(() => chart.resize()).observe(el);
  return chart;
}
