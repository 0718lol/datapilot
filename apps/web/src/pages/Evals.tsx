import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  FlaskConical,
  Play,
  Plus,
  Trash2,
  XCircle,
} from "lucide-react";
import { api } from "../api/client";
import type { DataSource, EvalItem, EvalReport } from "../api/types";
import { Badge, Button, EmptyState, Input } from "../components/ui";
import { clsx } from "../components/clsx";

export default function Evals() {
  const queryClient = useQueryClient();
  const [dsId, setDsId] = useState<string>("");
  const [question, setQuestion] = useState("");
  const [goldSql, setGoldSql] = useState("");
  const [report, setReport] = useState<EvalReport | null>(null);

  const datasources = useQuery({
    queryKey: ["datasources"],
    queryFn: () => api.get<DataSource[]>("/datasources"),
  });
  const dsList = datasources.data ?? [];
  const effectiveDsId = dsId || dsList[0]?.id || "";

  const items = useQuery({
    queryKey: ["evals", effectiveDsId],
    enabled: !!effectiveDsId,
    queryFn: () => api.get<EvalItem[]>(`/evals?datasource_id=${effectiveDsId}`),
  });

  const create = useMutation({
    mutationFn: () =>
      api.post("/evals", {
        datasource_id: effectiveDsId,
        question,
        gold_sql: goldSql,
      }),
    onSuccess: () => {
      setQuestion("");
      setGoldSql("");
      queryClient.invalidateQueries({ queryKey: ["evals", effectiveDsId] });
    },
  });

  const run = useMutation({
    mutationFn: () => api.post<EvalReport>("/evals/run", { datasource_id: effectiveDsId }),
    onSuccess: (r) => setReport(r),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/evals/${id}`),
    onSuccess: () => {
      setReport(null);
      queryClient.invalidateQueries({ queryKey: ["evals", effectiveDsId] });
    },
  });

  return (
    <div className="scroll-thin h-full overflow-y-auto">
      <div className="mx-auto max-w-4xl px-6 py-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-2 text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
              <FlaskConical className="h-5 w-5 text-teal-600 dark:text-teal-400" />
              评测验收
            </h1>
            <p className="mt-1 max-w-xl text-[13px] leading-relaxed text-zinc-500 dark:text-zinc-400">
              用你的真实业务问题建黄金问答集（问题 + 标准 SQL），一键跑出准确率报告。
              部署前作为验收依据，迭代时作为回归测试 —— 这是 DataPilot 区别于其他 ChatBI 的能力。
            </p>
          </div>
        </div>

        {/* 数据源选择 + 运行 */}
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <select
            value={effectiveDsId}
            onChange={(e) => {
              setDsId(e.target.value);
              setReport(null);
            }}
            className="h-10 rounded-xl border border-zinc-200 bg-white px-3 text-sm dark:border-zinc-800 dark:bg-zinc-900"
          >
            {dsList.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          <Button
            onClick={() => run.mutate()}
            loading={run.isPending}
            disabled={!effectiveDsId || (items.data?.length ?? 0) === 0}
          >
            <Play className="h-4 w-4" />
            运行评测
          </Button>
          {(items.data?.length ?? 0) > 0 && (
            <span className="text-[13px] text-zinc-400 dark:text-zinc-500">
              共 {items.data!.length} 个黄金问答对
            </span>
          )}
        </div>

        {/* 报告 */}
        {report && (
          <div
            className={clsx(
              "mt-5 rounded-2xl border p-5",
              report.accuracy >= 0.9
                ? "border-teal-600/30 bg-teal-600/5"
                : report.accuracy >= 0.6
                  ? "border-amber-500/30 bg-amber-500/5"
                  : "border-red-500/30 bg-red-500/5"
            )}
          >
            <div className="flex items-baseline gap-3">
              <span className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
                {(report.accuracy * 100).toFixed(0)}%
              </span>
              <span className="text-sm text-zinc-500 dark:text-zinc-400">
                {report.passed}/{report.total} 通过
                {report.accuracy >= 0.9
                  ? " · 可交付水平"
                  : report.accuracy >= 0.6
                    ? " · 需调优后再验收"
                    : " · 尚不可交付"}
              </span>
            </div>
            <div className="mt-4 space-y-3">
              {report.items.map((it, i) => (
                <details
                  key={i}
                  className="rounded-xl border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900"
                >
                  <summary className="flex cursor-pointer list-none items-center gap-2 text-sm">
                    {it.passed ? (
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-teal-600 dark:text-teal-400" />
                    ) : (
                      <XCircle className="h-4 w-4 shrink-0 text-red-500" />
                    )}
                    <span className="min-w-0 flex-1 truncate text-zinc-800 dark:text-zinc-200">
                      {it.question}
                    </span>
                    <Badge className={it.passed ? "text-teal-600" : "text-red-500"}>
                      {it.passed ? "通过" : "未通过"}
                    </Badge>
                  </summary>
                  <div className="mt-3 space-y-2 text-xs">
                    <div>
                      <div className="mb-1 font-medium text-zinc-500 dark:text-zinc-400">标准 SQL</div>
                      <pre className="scroll-thin overflow-auto rounded-lg bg-zinc-50 p-2.5 font-mono text-[11.5px] dark:bg-zinc-950">
                        {it.gold_sql}
                      </pre>
                    </div>
                    {it.generated_sql && (
                      <div>
                        <div className="mb-1 font-medium text-zinc-500 dark:text-zinc-400">生成 SQL</div>
                        <pre className="scroll-thin overflow-auto rounded-lg bg-zinc-50 p-2.5 font-mono text-[11.5px] dark:bg-zinc-950">
                          {it.generated_sql}
                        </pre>
                      </div>
                    )}
                    {it.failure && (
                      <div className="rounded-lg bg-red-50 px-3 py-2 text-red-600 dark:bg-red-950/40 dark:text-red-400">
                        {it.failure}
                      </div>
                    )}
                  </div>
                </details>
              ))}
            </div>
          </div>
        )}

        {/* 添加黄金问答对 */}
        <div className="mt-8 rounded-2xl border border-zinc-200 bg-white p-5 shadow-xs dark:border-zinc-800 dark:bg-zinc-900">
          <h3 className="flex items-center gap-2 text-[13px] font-medium text-zinc-900 dark:text-zinc-100">
            <Plus className="h-4 w-4 text-teal-600 dark:text-teal-400" />
            添加黄金问答对
          </h3>
          <div className="mt-3 space-y-3">
            <Input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="业务问题，如：每月销售额趋势是怎样的？"
            />
            <textarea
              value={goldSql}
              onChange={(e) => setGoldSql(e.target.value)}
              rows={3}
              placeholder="标准答案 SQL（只读 SELECT，业务同事或数据工程师确认过口径）"
              className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 font-mono text-[12.5px] focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/15 dark:border-zinc-800 dark:bg-zinc-900 dark:focus:border-teal-500"
            />
            {create.error && (
              <div className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600 dark:bg-red-950/40 dark:text-red-400">
                {create.error instanceof Error ? create.error.message : "添加失败"}
              </div>
            )}
            <Button
              onClick={() => create.mutate()}
              loading={create.isPending}
              disabled={!question.trim() || !goldSql.trim()}
            >
              添加到评测集
            </Button>
          </div>
        </div>

        {/* 已有评测项 */}
        <div className="mt-6 space-y-2">
          {(items.data ?? []).map((it) => (
            <div
              key={it.id}
              className="group flex items-center gap-3 rounded-xl border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm text-zinc-800 dark:text-zinc-200">{it.question}</div>
                <div className="mt-0.5 truncate font-mono text-[11px] text-zinc-400 dark:text-zinc-600">
                  {it.gold_sql}
                </div>
              </div>
              <button
                onClick={() => remove.mutate(it.id)}
                title="删除"
                className="rounded-lg p-1.5 text-zinc-300 opacity-0 transition-all hover:bg-red-50 hover:text-red-500 group-hover:opacity-100 dark:text-zinc-600 dark:hover:bg-red-950/40"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
          {(items.data?.length ?? 0) === 0 && effectiveDsId && (
            <EmptyState
              icon={<FlaskConical className="h-6 w-6" />}
              title="该数据源还没有评测项"
              description="添加 5-10 个高频业务问题，就能看到第一份准确率报告"
            />
          )}
        </div>
      </div>
    </div>
  );
}
