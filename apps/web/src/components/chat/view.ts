import type { AssistantContent, ChartSpec } from "../../api/types";

export type StageKey = "schema" | "generate" | "review" | "execute" | "visualize";
export type StageState = "pending" | "active" | "done";

export const STAGE_ORDER: { key: StageKey; label: string }[] = [
  { key: "schema", label: "读取表结构" },
  { key: "generate", label: "生成 SQL" },
  { key: "review", label: "安全校验" },
  { key: "execute", label: "执行查询" },
  { key: "visualize", label: "构建图表" },
];

/** 一次回答在 UI 里的完整视图状态（流式进行中 / 已完成共用）。 */
export interface AnswerView {
  stages: Record<StageKey, StageState>;
  question?: string;
  streamingText?: string;
  explanation?: string;
  sql?: string;
  columns?: string[];
  rows?: unknown[][];
  rowCount?: number;
  chartSpec?: ChartSpec | null;
  error?: { stage: string; message: string } | null;
}

export function initialView(): AnswerView {
  return {
    stages: {
      schema: "active",
      generate: "pending",
      review: "pending",
      execute: "pending",
      visualize: "pending",
    },
  };
}

/** 已完成的消息 → 全部阶段 done 的视图。 */
export function viewFromContent(content: Partial<AssistantContent>): AnswerView {
  return {
    stages: {
      schema: "done",
      generate: "done",
      review: "done",
      execute: content.error ? "active" : "done",
      visualize: "done",
    },
    question: content.question,
    explanation: content.explanation,
    sql: content.sql ?? undefined,
    columns: content.columns,
    rows: content.rows,
    rowCount: content.rowCount,
    chartSpec: content.chartSpec ?? undefined,
    error: content.error ?? undefined,
  };
}

/** 阶段推进：把 stage 及其之前的都置为 done，stage 置为 active。 */
export function advanceStages(
  stages: AnswerView["stages"],
  stage: StageKey
): AnswerView["stages"] {
  const idx = STAGE_ORDER.findIndex((s) => s.key === stage);
  const next = { ...stages };
  STAGE_ORDER.forEach((s, i) => {
    next[s.key] = i < idx ? "done" : i === idx ? "active" : "pending";
  });
  return next;
}

export function finishStages(stages: AnswerView["stages"]): AnswerView["stages"] {
  return {
    schema: "done",
    generate: "done",
    review: "done",
    execute: "done",
    visualize: "done",
  };
}
