import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Database,
  MessageSquarePlus,
  SendHorizontal,
  Square,
  Upload,
  Zap,
} from "lucide-react";
import { api, streamAsk } from "../api/client";
import type { ChatMessage, Conversation, DataSource } from "../api/types";
import { Button } from "../components/ui";
import { AssistantCard } from "../components/chat/AssistantCard";
import {
  advanceStages,
  finishStages,
  initialView,
  viewFromContent,
  type AnswerView,
  type StageKey,
} from "../components/chat/view";
import { clsx } from "../components/clsx";

const EXAMPLE_QUESTIONS = [
  "各地区销售额对比",
  "每月销售额趋势是怎样的？",
  "哪个品类的订单量最高？",
];

export default function Workspace() {
  const queryClient = useQueryClient();
  const [convId, setConvId] = useState<string | null>(null);
  const [selectedDsId, setSelectedDsId] = useState<string | null>(null);
  // 服务端消息是唯一事实来源；流式期间本地乐观消息叠加显示
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [streamView, setStreamView] = useState<AnswerView | null>(null);
  const [input, setInput] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const conversations = useQuery({
    queryKey: ["conversations"],
    queryFn: () => api.get<Conversation[]>("/conversations"),
    retry: 2,
  });
  const datasources = useQuery({
    queryKey: ["datasources"],
    queryFn: () => api.get<DataSource[]>("/datasources"),
    retry: 2,
    // 失败后每 3 秒自动重试直到恢复（如后端短暂重启期间加载的页面）
    refetchInterval: (query) => (query.state.status === "error" ? 3000 : false),
  });
  const dsList = datasources.data ?? [];
  // 多数据源时可切换；默认取第一个
  const activeDsId = selectedDsId ?? dsList[0]?.id ?? null;

  const upload = useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append("file", file);
      return api.upload("/datasources/upload", form);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["datasources"] }),
  });

  const streaming = streamView !== null;
  const hasMessages = messages.length > 0 || streaming;

  const loadMessages = useCallback(async (id: string | null) => {
    if (!id) {
      setMessages([]);
      return;
    }
    setLoadingHistory(true);
    try {
      setMessages(await api.get<ChatMessage[]>(`/conversations/${id}/messages`));
    } catch {
      // 拉取失败保留现状，下次切换会话或重新提问时重试
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  const scrollToEnd = useCallback(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, []);

  useEffect(scrollToEnd, [messages.length, streamView, scrollToEnd]);

  const ask = async (question: string) => {
    if (!question.trim() || streaming) return;
    if (dsList.length === 0) {
      if (datasources.isError) {
        // 接口临时不可用：给出明确反馈并触发自动重试，而不是静默无效
        void datasources.refetch();
        setNotice("数据源加载失败，正在自动重试…恢复后即可提问");
        return;
      }
      fileRef.current?.click();
      setNotice("请先上传 CSV 或连接数据库，再开始提问");
      return;
    }
    setNotice(null);

    let id: string;
    try {
      let current = convId;
      if (!current) {
        const conv = await api.post<Conversation>("/conversations", {
          title: question.slice(0, 30),
        });
        current = conv.id;
        setConvId(conv.id);
        queryClient.invalidateQueries({ queryKey: ["conversations"] });
      }
      id = current;

      setMessages((m) => [
        ...m,
        { id: `local-${Date.now()}`, role: "user", content: { text: question } },
      ]);
      setInput("");
      setStreamView(initialView());
    } catch (err) {
      // 会话创建失败必须可见，不能静默吞掉
      setNotice(err instanceof Error ? err.message : "创建会话失败，请重试");
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    try {
      await streamAsk(id, question, activeDsId, controller.signal, (event) => {
        setStreamView((prev) => {
          const view: AnswerView = prev ?? initialView();
          switch (event.type) {
            case "status":
              return { ...view, stages: advanceStages(view.stages, event.stage as StageKey) };
            case "token":
              return { ...view, streamingText: (view.streamingText ?? "") + event.text };
            case "sql":
              return { ...view, sql: event.sql, explanation: event.explanation };
            case "result":
              return {
                ...view,
                columns: event.columns,
                rows: event.rows,
                rowCount: event.row_count,
              };
            case "chart":
              return { ...view, chartSpec: event.spec };
            case "error":
              return {
                ...view,
                stages: finishStages(view.stages),
                error: { stage: event.stage, message: event.message },
              };
            case "done":
              return { ...view, stages: finishStages(view.stages) };
            default:
              return view;
          }
        });
      });
    } catch (err) {
      if (controller.signal.aborted) return; // 用户主动停止
      setStreamView((prev) => {
        const base = prev ?? initialView();
        return {
          ...base,
          stages: finishStages(base.stages),
          error: {
            stage: "generate",
            message: err instanceof Error ? err.message : "网络错误，请重试",
          },
        };
      });
      return;
    } finally {
      abortRef.current = null;
    }

    // 流结束：直接以服务端消息为准刷新（本地乐观消息与流式卡片一并替换），
    // 不依赖缓存失效时序，杜绝"跳回空状态"的竞态
    await loadMessages(id);
    setStreamView(null);
  };

  const selectConversation = (id: string) => {
    if (streaming) return;
    setConvId(id);
    setStreamView(null);
    setNotice(null);
    void loadMessages(id);
  };

  const newAnalysis = () => {
    if (streaming) return;
    setConvId(null);
    setMessages([]);
    setStreamView(null);
    setNotice(null);
  };

  return (
    <div className="flex h-full">
      {/* 左栏：会话列表 */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-zinc-200 bg-white md:flex dark:border-zinc-800 dark:bg-zinc-900">
        <div className="p-3">
          <Button
            variant="secondary"
            className="w-full justify-start"
            onClick={newAnalysis}
            disabled={streaming}
          >
            <MessageSquarePlus className="h-4 w-4 text-teal-600 dark:text-teal-400" />
            新建分析
          </Button>
        </div>
        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-2 pb-3">
          {(conversations.data ?? []).map((c) => (
            <button
              key={c.id}
              onClick={() => selectConversation(c.id)}
              className={clsx(
                "mb-0.5 w-full rounded-lg px-3 py-2 text-left text-[13px] transition-colors",
                c.id === convId
                  ? "bg-teal-600/10 font-medium text-teal-700 dark:bg-teal-500/15 dark:text-teal-400"
                  : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
              )}
            >
              <div className="truncate">{c.title}</div>
            </button>
          ))}
          {(conversations.data?.length ?? 0) === 0 && (
            <p className="px-3 py-6 text-center text-xs text-zinc-400 dark:text-zinc-600">
              还没有分析记录
            </p>
          )}
        </div>
      </aside>

      {/* 中栏：对话流 */}
      <section className="flex min-w-0 flex-1 flex-col">
        <div ref={scrollRef} className="scroll-thin min-h-0 flex-1 overflow-y-auto">
          {!hasMessages ? (
            <EmptyHero
              onExample={(q) => setInput(q)}
              onUpload={() => fileRef.current?.click()}
              loading={upload.isPending}
            />
          ) : (
            <div className="mx-auto max-w-3xl space-y-6 px-6 py-8">
              {messages.map((m) =>
                m.role === "user" ? (
                  <div key={m.id} className="flex justify-end">
                    <div className="max-w-[85%] rounded-2xl rounded-br-md bg-teal-600 px-4 py-2.5 text-sm leading-relaxed text-white shadow-sm">
                      {m.content.text}
                    </div>
                  </div>
                ) : (
                  <AssistantCard key={m.id} view={viewFromContent(m.content)} />
                )
              )}
              {streamView && <AssistantCard view={streamView} />}
              {loadingHistory && messages.length === 0 && (
                <p className="py-8 text-center text-sm text-zinc-400 dark:text-zinc-600">
                  加载对话中…
                </p>
              )}
            </div>
          )}
        </div>

        {(datasources.isError || notice) && (
          <div className="shrink-0 px-6 pt-3">
            <div className="mx-auto max-w-3xl space-y-2">
              {datasources.isError && (
                <div className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-[13px] text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
                  <span className="min-w-0 flex-1">
                    数据源加载失败（
                    {datasources.error instanceof Error
                      ? datasources.error.message
                      : "网络错误"}
                    ），每 3 秒自动重试中…
                  </span>
                  <button
                    onClick={() => void datasources.refetch()}
                    className="shrink-0 rounded-lg border border-red-300 px-2.5 py-1 text-xs font-medium transition-colors hover:bg-red-100 dark:border-red-800 dark:hover:bg-red-900/40"
                  >
                    立即重试
                  </button>
                </div>
              )}
              {notice && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-[13px] text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300">
                  {notice}
                </div>
              )}
            </div>
          </div>
        )}

        {/* 输入区 */}
        <div className="shrink-0 border-t border-zinc-200 bg-white px-6 py-4 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="mx-auto max-w-3xl">
            {dsList.length > 1 && (
              <div className="mb-2 flex items-center gap-1.5 overflow-x-auto pb-1">
                {dsList.map((ds) => (
                  <button
                    key={ds.id}
                    onClick={() => setSelectedDsId(ds.id)}
                    className={clsx(
                      "flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors",
                      ds.id === activeDsId
                        ? "border-teal-600 bg-teal-600/10 font-medium text-teal-700 dark:border-teal-500 dark:text-teal-400"
                        : "border-zinc-200 text-zinc-500 hover:border-zinc-300 dark:border-zinc-800 dark:text-zinc-400 dark:hover:border-zinc-700"
                    )}
                  >
                    <Database className="h-3 w-3" />
                    {ds.name}
                  </button>
                ))}
              </div>
            )}
            <div className="flex items-end gap-2 rounded-2xl border border-zinc-200 bg-zinc-50 p-2 transition-colors focus-within:border-teal-600 focus-within:ring-2 focus-within:ring-teal-600/15 dark:border-zinc-800 dark:bg-zinc-950 dark:focus-within:border-teal-500">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void ask(input);
                  }
                }}
                rows={1}
                placeholder={
                  dsList.length > 0
                    ? "向你的数据提问，例如：上月各地区销售额是多少？"
                    : "先上传 CSV 或连接数据库，再开始提问"
                }
                className="scroll-thin max-h-32 min-h-[38px] flex-1 resize-none bg-transparent px-2 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none dark:text-zinc-100 dark:placeholder:text-zinc-500"
              />
              {streaming ? (
                <Button
                  size="md"
                  variant="secondary"
                  onClick={() => abortRef.current?.abort()}
                  className="shrink-0"
                >
                  <Square className="h-3.5 w-3.5 fill-current" />
                  停止
                </Button>
              ) : (
                <Button size="md" onClick={() => void ask(input)} disabled={!input.trim()} className="shrink-0">
                  发送
                  <SendHorizontal className="h-4 w-4" />
                </Button>
              )}
            </div>
            <p className="mt-2 text-center text-[11px] text-zinc-400 dark:text-zinc-600">
              Enter 发送 · Shift + Enter 换行 · SQL 仅只读执行
            </p>
          </div>
        </div>
      </section>

      {/* 右栏：数据资产 */}
      <aside className="hidden w-72 shrink-0 flex-col border-l border-zinc-200 bg-white xl:flex dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-center justify-between px-4 py-3">
          <h3 className="text-[13px] font-medium text-zinc-900 dark:text-zinc-100">数据资产</h3>
          <button
            onClick={() => fileRef.current?.click()}
            disabled={upload.isPending}
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-teal-600 transition-colors hover:bg-teal-600/10 disabled:opacity-50 dark:text-teal-400 dark:hover:bg-teal-500/10"
          >
            <Upload className="h-3.5 w-3.5" />
            {upload.isPending ? "上传中" : "上传"}
          </button>
        </div>
        <div className="scroll-thin min-h-0 flex-1 space-y-2 overflow-y-auto px-3 pb-4">
          {dsList.map((ds) => (
            <details
              key={ds.id}
              className="group rounded-xl border border-zinc-200 bg-zinc-50/60 open:bg-white dark:border-zinc-800 dark:bg-zinc-950/40 dark:open:bg-zinc-900"
            >
              <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 text-[13px] font-medium text-zinc-700 dark:text-zinc-200">
                <Database className="h-4 w-4 shrink-0 text-teal-600 dark:text-teal-400" />
                <span className="truncate">{ds.name}</span>
                <span className="ml-auto shrink-0 rounded bg-zinc-200/70 px-1.5 py-px text-[10px] text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                  {ds.kind === "csv" ? `${ds.row_count.toLocaleString()} 行` : `${ds.tables.length} 表`}
                </span>
              </summary>
              <div className="space-y-2 px-3 pb-3">
                {ds.tables.map((t) => (
                  <div key={t.name}>
                    <div className="mb-1 font-mono text-[11px] text-zinc-500 dark:text-zinc-400">
                      {t.name}
                    </div>
                    <div className="space-y-1">
                      {t.columns.map((col) => (
                        <div key={col.name} className="flex items-center justify-between gap-2 text-xs">
                          <span className="truncate text-zinc-600 dark:text-zinc-400">{col.name}</span>
                          <span className="shrink-0 font-mono text-[10px] text-zinc-400 dark:text-zinc-600">
                            {col.type}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </details>
          ))}
          {dsList.length === 0 && (
            <p className="px-3 py-8 text-center text-xs leading-relaxed text-zinc-400 dark:text-zinc-600">
              还没有数据源
              <br />
              点击右上角「上传」导入 CSV
            </p>
          )}
          {upload.error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600 dark:bg-red-950/40 dark:text-red-400">
              {upload.error instanceof Error ? upload.error.message : "上传失败"}
            </p>
          )}
        </div>
      </aside>

      <input
        ref={fileRef}
        type="file"
        accept=".csv,.tsv"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) upload.mutate(file);
          e.target.value = "";
        }}
      />
    </div>
  );
}

function EmptyHero({
  onExample,
  onUpload,
  loading,
}: {
  onExample: (q: string) => void;
  onUpload: () => void;
  loading: boolean;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-6">
      <div className="w-full max-w-lg text-center">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-teal-600 shadow-lg shadow-teal-600/20">
          <Zap className="h-7 w-7 text-white" />
        </div>
        <h2 className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          上传数据，直接提问
        </h2>
        <p className="mx-auto mt-2 max-w-sm text-[13px] leading-relaxed text-zinc-500 dark:text-zinc-400">
          把 CSV 拖进来或点击上传，DataPilot 会自动理解表结构，
          生成 SQL 查询并绘制图表 —— 全程在你的私有环境内完成。
        </p>
        <div className="mt-6 flex items-center justify-center gap-3">
          <Button onClick={onUpload} loading={loading}>
            <Upload className="h-4 w-4" />
            上传 CSV
          </Button>
        </div>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-2">
          {EXAMPLE_QUESTIONS.map((q) => (
            <button
              key={q}
              onClick={() => onExample(q)}
              className="rounded-full border border-zinc-200 bg-white px-3.5 py-1.5 text-xs text-zinc-600 transition-colors hover:border-teal-600 hover:text-teal-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:border-teal-500 dark:hover:text-teal-400"
            >
              {q}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
