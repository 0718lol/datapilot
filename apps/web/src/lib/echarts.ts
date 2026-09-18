import type { EChartsOption } from "echarts";
import type { ChartSpec } from "../api/types";

const LIGHT_PALETTE = ["#0d9488", "#6366f1", "#f59e0b", "#ec4899", "#10b981", "#8b5cf6"];
const DARK_PALETTE = ["#2dd4bf", "#818cf8", "#fbbf24", "#f472b6", "#34d399", "#a78bfa"];

/** 用与 UI 一致的设计 token 构建 ECharts 配置。 */
export function buildChartOption(spec: ChartSpec, isDark: boolean): EChartsOption {
  const palette = isDark ? DARK_PALETTE : LIGHT_PALETTE;
  const text = isDark ? "#a1a1aa" : "#71717a";
  const split = isDark ? "rgba(63,63,70,0.5)" : "rgba(228,228,231,0.9)";
  const tooltipBg = isDark ? "#18181b" : "#ffffff";
  const tooltipBorder = isDark ? "#3f3f46" : "#e4e4e7";

  const base = {
    animationDuration: 500,
    textStyle: { fontFamily: "inherit", color: text },
    tooltip: {
      backgroundColor: tooltipBg,
      borderColor: tooltipBorder,
      borderWidth: 1,
      textStyle: { color: isDark ? "#f4f4f5" : "#18181b", fontSize: 12 },
    },
  };

  if (spec.kind === "table" || !spec.xField || !spec.yFields?.length || !spec.data?.length) {
    return { ...base };
  }
  const categories = spec.data.map((d) => String(d[spec.xField!] ?? ""));
  const series = spec.yFields.map((field, i) =>
    spec.kind === "line"
      ? {
          name: field,
          type: "line" as const,
          data: spec.data!.map((d) => d[field] as number),
          smooth: true,
          symbolSize: 6,
          lineStyle: { width: 2.5 },
          itemStyle: { color: palette[i % palette.length] },
          areaStyle: {
            opacity: 0.08,
            color: palette[i % palette.length],
          },
        }
      : {
          name: field,
          type: "bar" as const,
          data: spec.data!.map((d) => d[field] as number),
          barMaxWidth: 36,
          itemStyle: {
            borderRadius: [6, 6, 0, 0],
            color: palette[i % palette.length],
          },
        }
  );

  return {
    ...base,
    tooltip: { ...base.tooltip, trigger: "axis", axisPointer: { type: "shadow" } },
    grid: { left: 8, right: 16, top: 28, bottom: 8, containLabel: true },
    xAxis: {
      type: "category",
      data: categories,
      axisLine: { lineStyle: { color: split } },
      axisTick: { show: false },
      axisLabel: { color: text, fontSize: 11 },
    },
    yAxis: {
      type: "value",
      splitLine: { lineStyle: { color: split } },
      axisLabel: { color: text, fontSize: 11, formatter: compact },
    },
    series,
  };
}

function compact(v: number): string {
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 1_000) return `${(v / 1_000).toFixed(1)}k`;
  return String(v);
}
