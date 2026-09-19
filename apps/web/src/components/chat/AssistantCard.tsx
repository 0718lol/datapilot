import { AlertCircle, BarChart3 } from "lucide-react";
import { clsx } from "../clsx";
import { StatusSteps } from "./StatusSteps";
import { SqlBlock } from "./SqlBlock";
import { ChartCard } from "./ChartCard";
import { ResultTable } from "./ResultTable";
import type { AnswerView } from "./view";

/** 一次回答的完整卡片：状态步骤 → 解读 → SQL → 图表 → 结果表。 */
export function AssistantCard({
  view,
  onSaveChart,
  savePending = false,
}: {
  view: AnswerView;
  onSaveChart?: (payload: { title: string; sql: string; chart_hint: string }) => void;
  savePending?: boolean;
}) {
  const finished = !view.error && view.stages.visualize === "done";

  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-teal-600 text-white shadow-sm">
        <BarChart3 className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1 space-y-3">
        <StatusSteps view={view} />

        {view.error ? (
          <div className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <div className="font-medium">回答生成失败</div>
              <div className="mt-0.5 text-[13px] opacity-90">{view.error.message}</div>
            </div>
          </div>
        ) : (
          <>
            {(view.explanation || view.streamingText) && (
              <p
                className={clsx(
                  "whitespace-pre-wrap text-sm leading-relaxed text-zinc-700 dark:text-zinc-300",
                  !view.explanation && "stream-cursor"
                )}
              >
                {view.explanation ?? view.streamingText}
              </p>
            )}
            {view.sql && <SqlBlock sql={view.sql} />}
            {view.chartSpec && view.chartSpec.kind !== "table" && (
              <ChartCard
                spec={view.chartSpec}
                title={view.question}
                onSave={
                  onSaveChart && view.sql
                    ? () =>
                        onSaveChart({
                          title: view.question || "未命名图表",
                          sql: view.sql!,
                          chart_hint: view.chartSpec!.kind,
                        })
                    : undefined
                }
                saving={savePending}
              />
            )}
            {view.rows && view.rows.length > 0 && (
              <ResultTable columns={view.columns ?? []} rows={view.rows} rowCount={view.rowCount} />
            )}
            {finished && !view.sql && (
              <p className="text-sm text-zinc-400 dark:text-zinc-500">（无返回结果）</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
