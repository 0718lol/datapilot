import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Database,
  FileSpreadsheet,
  Plug,
  Trash2,
  UploadCloud,
} from "lucide-react";
import { api } from "../api/client";
import type { DataSource, DatabaseConnectForm } from "../api/types";
import { Badge, Button, Input } from "../components/ui";
import { clsx } from "../components/clsx";

type Mode = "csv" | "database";

const EMPTY_FORM: DatabaseConnectForm = {
  name: "",
  type: "postgres",
  host: "",
  port: 5432,
  database: "",
  username: "",
  password: "",
};

export default function DataSources() {
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<Mode>("csv");
  const [dragOver, setDragOver] = useState(false);
  const [form, setForm] = useState<DatabaseConnectForm>(EMPTY_FORM);
  const [testResult, setTestResult] = useState<string | null>(null);

  const datasources = useQuery({
    queryKey: ["datasources"],
    queryFn: () => api.get<DataSource[]>("/datasources"),
    retry: 2,
    refetchInterval: (query) => (query.state.status === "error" ? 5000 : false),
  });

  const upload = useMutation({
    mutationFn: (file: File) => {
      const f = new FormData();
      f.append("file", file);
      return api.upload("/datasources/upload", f);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["datasources"] }),
  });

  const testConn = useMutation({
    mutationFn: () => api.post<{ ok: boolean }>("/datasources/database/test", form),
    onSuccess: (r) => setTestResult(`连接成功，发现表结构`),
    onError: (e) => setTestResult(null),
  });

  const connect = useMutation({
    mutationFn: () => api.post("/datasources/database", form),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["datasources"] });
      setForm(EMPTY_FORM);
      setTestResult(null);
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/datasources/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["datasources"] }),
  });

  const connError = testConn.error ?? connect.error;

  const handleFile = (file: File | undefined) => {
    if (file) upload.mutate(file);
  };

  const setField = (k: keyof DatabaseConnectForm, v: string | number) =>
    setForm((f) => ({ ...f, [k]: v }));

  return (
    <div className="scroll-thin h-full overflow-y-auto">
      <div className="mx-auto max-w-4xl px-6 py-8">
        <h1 className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          数据源
        </h1>
        <p className="mt-1 text-[13px] text-zinc-500 dark:text-zinc-400">
          上传 CSV 或连接业务数据库，连接信息仅保存在你的私有部署环境内
        </p>

        {/* 模式切换 */}
        <div className="mt-6 flex w-fit rounded-xl border border-zinc-200 p-1 dark:border-zinc-800">
          {(
            [
              { key: "csv", label: "上传 CSV", icon: FileSpreadsheet },
              { key: "database", label: "连接数据库", icon: Plug },
            ] as const
          ).map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setMode(key)}
              className={clsx(
                "flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-[13px] font-medium transition-colors",
                mode === key
                  ? "bg-teal-600 text-white shadow-sm"
                  : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>

        {mode === "csv" ? (
          <div
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              handleFile(e.dataTransfer.files?.[0]);
            }}
            className={clsx(
              "mt-4 flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-6 py-12 transition-colors",
              dragOver
                ? "border-teal-600 bg-teal-600/5"
                : "border-zinc-300 bg-white hover:border-teal-600/60 hover:bg-teal-600/[0.03] dark:border-zinc-700 dark:bg-zinc-900 dark:hover:border-teal-500/60"
            )}
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-600/10 text-teal-600 dark:text-teal-400">
              <UploadCloud className="h-6 w-6" />
            </div>
            <div className="text-center">
              <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                {upload.isPending ? "正在上传并解析…" : "点击或拖拽 CSV 文件到这里"}
              </div>
              <div className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">
                支持 UTF-8 / GBK 编码，表头自动识别，单文件不超过 100MB
              </div>
            </div>
            {upload.error && (
              <div className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600 dark:bg-red-950/40 dark:text-red-400">
                {upload.error instanceof Error ? upload.error.message : "上传失败"}
              </div>
            )}
          </div>
        ) : (
          <div className="mt-4 rounded-2xl border border-zinc-200 bg-white p-5 shadow-xs dark:border-zinc-800 dark:bg-zinc-900">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="连接名称">
                <Input
                  value={form.name}
                  onChange={(e) => setField("name", e.target.value)}
                  placeholder="如：生产库-订单中心"
                />
              </Field>
              <Field label="数据库类型">
                <select
                  value={form.type}
                  onChange={(e) => {
                    const t = e.target.value as DatabaseConnectForm["type"];
                    setForm((f) => ({
                      ...f,
                      type: t,
                      port: t === "postgres" ? 5432 : t === "mysql" ? 3306 : null,
                    }));
                    setTestResult(null);
                  }}
                  className="h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm dark:border-zinc-800 dark:bg-zinc-900"
                >
                  <option value="postgres">PostgreSQL</option>
                  <option value="mysql">MySQL</option>
                  <option value="sqlite">SQLite（填文件路径）</option>
                </select>
              </Field>
              {form.type !== "sqlite" && (
                <>
                  <Field label="主机">
                    <Input value={form.host} onChange={(e) => setField("host", e.target.value)} placeholder="127.0.0.1" />
                  </Field>
                  <Field label="端口">
                    <Input
                      type="number"
                      value={form.port ?? ""}
                      onChange={(e) => setField("port", Number(e.target.value))}
                    />
                  </Field>
                  <Field label="用户名">
                    <Input value={form.username} onChange={(e) => setField("username", e.target.value)} />
                  </Field>
                  <Field label="密码">
                    <Input
                      type="password"
                      value={form.password}
                      onChange={(e) => setField("password", e.target.value)}
                    />
                  </Field>
                </>
              )}
              <Field label={form.type === "sqlite" ? "数据库文件路径" : "数据库名"}>
                <Input
                  value={form.database}
                  onChange={(e) => setField("database", e.target.value)}
                  placeholder={form.type === "sqlite" ? "/data/app.db" : "orders_db"}
                />
              </Field>
            </div>
            <div className="mt-4 flex items-center gap-3">
              <Button
                variant="secondary"
                onClick={() => { setTestResult(null); testConn.mutate(); }}
                loading={testConn.isPending}
                disabled={!form.database}
              >
                测试连接
              </Button>
              <Button onClick={() => connect.mutate()} loading={connect.isPending} disabled={!form.database}>
                保存并导入
              </Button>
              {testResult && (
                <span className="text-[13px] text-teal-600 dark:text-teal-400">{testResult}</span>
              )}
              {(testConn.error || connect.error) && (
                <span className="text-[13px] text-red-500">
                  {connError instanceof Error ? connError.message : "操作失败"}
                </span>
              )}
            </div>
            <p className="mt-3 text-xs text-zinc-400 dark:text-zinc-500">
              建议使用只读账号连接。DataPilot 对生成的 SQL 做语法树级只读校验，双重保障数据安全。
            </p>
          </div>
        )}

        <input
          ref={fileRef}
          type="file"
          accept=".csv,.tsv"
          className="hidden"
          onChange={(e) => {
            handleFile(e.target.files?.[0]);
            e.target.value = "";
          }}
        />

        <h2 className="mb-3 mt-8 text-[13px] font-medium text-zinc-500 dark:text-zinc-400">
          已接入的数据源（{datasources.data?.length ?? 0}）
        </h2>
        {datasources.isError && (
          <div className="mb-4 flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-[13px] text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
            <span className="flex-1">
              数据源列表加载失败，每 5 秒自动重试中…
            </span>
            <button
              onClick={() => void datasources.refetch()}
              className="shrink-0 rounded-lg border border-red-300 px-2.5 py-1 text-xs font-medium hover:bg-red-100 dark:border-red-800 dark:hover:bg-red-900/40"
            >
              立即重试
            </button>
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          {(datasources.data ?? []).map((ds) => (
            <div
              key={ds.id}
              className="group rounded-2xl border border-zinc-200 bg-white p-4 shadow-xs transition-shadow hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900"
            >
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-teal-600/10 text-teal-600 dark:text-teal-400">
                  {ds.kind === "csv" ? <FileSpreadsheet className="h-4 w-4" /> : <Database className="h-4 w-4" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
                      {ds.name}
                    </span>
                    <Badge>{ds.kind === "csv" ? "CSV" : "数据库"}</Badge>
                  </div>
                  <div className="mt-0.5 truncate text-xs text-zinc-400 dark:text-zinc-500">
                    {ds.kind === "csv"
                      ? `${ds.original_name} · ${ds.row_count.toLocaleString()} 行`
                      : `${ds.original_name} · ${ds.tables.length} 张表`}
                  </div>
                </div>
                <button
                  onClick={() => {
                    if (window.confirm(`确定删除数据源「${ds.name}」？`)) remove.mutate(ds.id);
                  }}
                  title="删除"
                  className="rounded-lg p-1.5 text-zinc-300 opacity-0 transition-all hover:bg-red-50 hover:text-red-500 group-hover:opacity-100 dark:text-zinc-600 dark:hover:bg-red-950/40"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {ds.tables.flatMap((t) => t.columns.slice(0, 6)).slice(0, 8).map((c, i) => (
                  <Badge key={`${ds.id}-${i}`}>{c.name}</Badge>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-medium text-zinc-700 dark:text-zinc-300">
        {label}
      </span>
      {children}
    </label>
  );
}
