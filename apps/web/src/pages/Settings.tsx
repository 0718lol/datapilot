import { useQuery } from "@tanstack/react-query";
import { Cpu, Info, Palette, ShieldCheck } from "lucide-react";
import { api } from "../api/client";
import type { ModelSettings } from "../api/types";
import { Badge } from "../components/ui";
import { useUIStore } from "../store/auth";
import { clsx } from "../components/clsx";

export default function Settings() {
  const model = useQuery({
    queryKey: ["model-settings"],
    queryFn: () => api.get<ModelSettings>("/settings/model"),
  });
  const theme = useUIStore((s) => s.theme);
  const toggleTheme = useUIStore((s) => s.toggleTheme);

  return (
    <div className="scroll-thin h-full overflow-y-auto">
      <div className="mx-auto max-w-2xl space-y-6 px-6 py-8">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            设置
          </h1>
          <p className="mt-1 text-[13px] text-zinc-500 dark:text-zinc-400">
            查看部署配置；模型与安全参数通过环境变量管理（.env）
          </p>
        </div>

        <Section icon={<Cpu className="h-4 w-4" />} title="模型服务">
          {model.data && (
            <div className="space-y-3 text-sm">
              <Row label="运行模式">
                {model.data.provider === "mock" ? (
                  <Badge className="bg-amber-500/10 text-amber-600 dark:text-amber-400">
                    演示模式（内置模型）
                  </Badge>
                ) : (
                  <Badge className="bg-teal-600/10 text-teal-700 dark:text-teal-400">
                    OpenAI 兼容接口
                  </Badge>
                )}
              </Row>
              <Row label="模型">{model.data.model}</Row>
              {model.data.base_url && <Row label="接口地址">{model.data.base_url}</Row>}
              <Row label="API Key">
                {model.data.key_configured ? (
                  <span className="text-teal-600 dark:text-teal-400">已配置</span>
                ) : (
                  <span className="text-red-500">未配置</span>
                )}
              </Row>
              <p className="rounded-xl bg-zinc-50 px-3 py-2.5 text-xs leading-relaxed text-zinc-500 dark:bg-zinc-800/60 dark:text-zinc-400">
                私有化部署时，将 <code className="font-mono">MODEL_PROVIDER</code> 设为
                <code className="mx-1 font-mono">openai</code>，并把
                <code className="mx-1 font-mono">OPENAI_BASE_URL</code>
                指向内网 vLLM / Ollama 服务，即可实现模型与数据全部不出域。
              </p>
            </div>
          )}
        </Section>

        <Section icon={<Palette className="h-4 w-4" />} title="外观">
          <div className="flex items-center justify-between">
            <span className="text-sm text-zinc-700 dark:text-zinc-300">主题</span>
            <div className="flex rounded-xl border border-zinc-200 p-1 dark:border-zinc-800">
              {(["light", "dark"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => t !== theme && toggleTheme()}
                  className={clsx(
                    "rounded-lg px-4 py-1 text-xs font-medium transition-colors",
                    theme === t
                      ? "bg-teal-600 text-white"
                      : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
                  )}
                >
                  {t === "light" ? "浅色" : "深色"}
                </button>
              ))}
            </div>
          </div>
        </Section>

        <Section icon={<ShieldCheck className="h-4 w-4" />} title="安全">
          <div className="space-y-2.5 text-sm text-zinc-600 dark:text-zinc-300">
            <div className="flex items-start gap-2">
              <Check dot />
              生成的 SQL 经语法树校验，仅允许单条只读 SELECT
            </div>
            <div className="flex items-start gap-2">
              <Check dot />
              查询自动附加行数上限（默认 200 行）并限时执行
            </div>
            <div className="flex items-start gap-2">
              <Check dot />
              数据库与文件全部存储在本地部署环境，外部无数据传输
            </div>
          </div>
        </Section>

        <Section icon={<Info className="h-4 w-4" />} title="关于">
          <div className="space-y-2 text-sm text-zinc-600 dark:text-zinc-300">
            <Row label="产品">DataPilot M0</Row>
            <Row label="架构">React + FastAPI + DuckDB，Docker Compose 一键部署</Row>
          </div>
        </Section>
      </div>
    </div>
  );
}

function Section({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-xs dark:border-zinc-800 dark:bg-zinc-900">
      <div className="mb-4 flex items-center gap-2 text-[13px] font-medium text-zinc-900 dark:text-zinc-100">
        <span className="text-teal-600 dark:text-teal-400">{icon}</span>
        {title}
      </div>
      {children}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="shrink-0 text-zinc-500 dark:text-zinc-400">{label}</span>
      <span className="min-w-0 truncate text-right text-zinc-800 dark:text-zinc-200">{children}</span>
    </div>
  );
}

function Check({ dot }: { dot?: boolean }) {
  return <span className={clsx("mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-teal-600", dot)} />;
}
