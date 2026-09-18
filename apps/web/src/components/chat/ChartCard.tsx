import { useEffect, useRef, useState } from "react";
import * as echarts from "echarts";
import { AnimatePresence, motion } from "framer-motion";
import { BarChart3, Download, LineChart, Maximize2, Table2, X } from "lucide-react";
import { buildChartOption } from "../../lib/echarts";
import { useUIStore } from "../../store/auth";
import type { ChartSpec } from "../../api/types";

const KIND_META: Record<ChartSpec["kind"], { label: string }> = {
  bar: { label: "柱状图" },
  line: { label: "折线图" },
  table: { label: "数据表" },
};

export function ChartCard({ spec, fullscreen = false }: { spec: ChartSpec; fullscreen?: boolean }) {
  const theme = useUIStore((s) => s.theme);
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;
    const chart = echarts.init(containerRef.current);
    chartRef.current = chart;
    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(containerRef.current);
    return () => {
      observer.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    chartRef.current?.setOption(buildChartOption(spec, theme === "dark"), true);
  }, [spec, theme]);

  const exportPng = () => {
    const url = chartRef.current?.getDataURL({ pixelRatio: 2, backgroundColor: theme === "dark" ? "#18181b" : "#ffffff" });
    if (!url) return;
    const a = document.createElement("a");
    a.href = url;
    a.download = "datapilot-chart.png";
    a.click();
  };

  const Meta = KIND_META[spec.kind] ?? KIND_META.table;

  return (
    <>
      <div
        className={fullscreen ? "flex h-full w-full flex-col" : "overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800"}
      >
        {!fullscreen && (
          <div className="flex items-center gap-2 border-b border-zinc-100 px-3 py-2 text-xs font-medium text-zinc-600 dark:border-zinc-800 dark:text-zinc-300">
            {spec.kind === "line" ? (
              <LineChart className="h-3.5 w-3.5 text-teal-600 dark:text-teal-400" />
            ) : (
              <BarChart3 className="h-3.5 w-3.5 text-teal-600 dark:text-teal-400" />
            )}
            {Meta.label}
            <span className="ml-auto flex items-center gap-1">
              <IconButton title="下载 PNG" onClick={exportPng}>
                <Download className="h-3.5 w-3.5" />
              </IconButton>
              <IconButton title="全屏查看" onClick={() => setExpanded(true)}>
                <Maximize2 className="h-3.5 w-3.5" />
              </IconButton>
            </span>
          </div>
        )}
        <div ref={containerRef} className={fullscreen ? "min-h-0 flex-1" : "h-64 w-full"} />
      </div>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/70 p-6 backdrop-blur-sm"
            onClick={() => setExpanded(false)}
          >
            <motion.div
              initial={{ scale: 0.96, y: 8 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.96, y: 8 }}
              transition={{ type: "spring", stiffness: 320, damping: 28 }}
              className="flex h-full w-full max-w-5xl flex-col rounded-2xl border border-zinc-200 bg-white p-4 shadow-2xl dark:border-zinc-800 dark:bg-zinc-900"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-2 flex items-center justify-between">
                <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                  {Meta.label}
                  {spec.yFields?.length ? ` · ${spec.yFields.join(" / ")}` : ""}
                </div>
                <div className="flex items-center gap-1">
                  <IconButton title="下载 PNG" onClick={exportPng}>
                    <Download className="h-4 w-4" />
                  </IconButton>
                  <IconButton title="关闭" onClick={() => setExpanded(false)}>
                    <X className="h-4 w-4" />
                  </IconButton>
                </div>
              </div>
              <ChartCard spec={spec} fullscreen />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

function IconButton({
  children,
  onClick,
  title,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  title?: string;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      className="rounded-md p-1.5 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
    >
      {children}
    </button>
  );
}
