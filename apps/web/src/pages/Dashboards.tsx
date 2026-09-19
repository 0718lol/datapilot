import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LayoutDashboard, RefreshCw, Trash2 } from "lucide-react";
import { api } from "../api/client";
import type { DashboardItem, DashboardData } from "../api/types";
import { Button, EmptyState } from "../components/ui";
import { ChartCard } from "../components/chat/ChartCard";

export default function Dashboards() {
  const queryClient = useQueryClient();

  const list = useQuery({
    queryKey: ["dashboards"],
    queryFn: () => api.get<DashboardItem[]>("/dashboards"),
    retry: 2,
  });

  return (
    <div className="scroll-thin h-full overflow-y-auto">
      <div className="mx-auto max-w-6xl px-6 py-8">
        <h1 className="flex items-center gap-2 text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          <LayoutDashboard className="h-5 w-5 text-teal-600 dark:text-teal-400" />
          仪表盘
        </h1>
        <p className="mt-1 max-w-xl text-[13px] leading-relaxed text-zinc-500 dark:text-zinc-400">
          在工作台的图表卡片上点收藏即可保存到这里。卡片保存的是 SQL 与图表配置，
          每次打开都会重新执行、展示最新数据。
        </p>

        {list.data && list.data.length > 0 && (
          <div className="mt-6 grid gap-5 lg:grid-cols-2">
            {list.data.map((item) => (
              <DashboardCard key={item.id} item={item} />
            ))}
          </div>
        )}

        {list.data && list.data.length === 0 && (
          <EmptyState
            icon={<LayoutDashboard className="h-6 w-6" />}
            title="仪表盘还是空的"
            description="去工作台向数据提问，在生成的图表卡片右上角点收藏，就能保存到这里"
          />
        )}
      </div>
    </div>
  );
}

function DashboardCard({ item }: { item: DashboardItem }) {
  const queryClient = useQueryClient();
  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/dashboards/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["dashboards"] }),
  });

  const data = useQuery({
    queryKey: ["dash-data", item.id],
    queryFn: () => api.get<DashboardData>(`/dashboards/${item.id}/data`),
    retry: 1,
  });

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-xs dark:border-zinc-800 dark:bg-zinc-900">
      <div className="mb-3 flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
            {item.title}
          </div>
          <div className="truncate text-xs text-zinc-400 dark:text-zinc-500">
            数据源：{item.datasource_name} · 每次打开自动刷新
          </div>
        </div>
        <button
          onClick={() => queryClient.invalidateQueries({ queryKey: ["dash-data", item.id] })}
          title="刷新数据"
          className="rounded-lg p-1.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
        >
          <RefreshCw className={data.isFetching ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
        </button>
        <button
          onClick={() => {
            if (window.confirm(`从仪表盘移除「${item.title}」？`)) remove.mutate(item.id);
          }}
          title="移除"
          className="rounded-lg p-1.5 text-zinc-400 transition-colors hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/40"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      {data.isLoading ? (
        <div className="flex h-56 items-center justify-center rounded-xl border border-zinc-100 text-sm text-zinc-400 dark:border-zinc-800 dark:text-zinc-500">
          正在执行查询…
        </div>
      ) : data.isError ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-6 text-center text-[13px] text-red-600 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
          {data.error instanceof Error ? data.error.message : "执行失败"}
          <button
            onClick={() => data.refetch()}
            className="mt-2 block w-full rounded-lg border border-red-300 py-1 text-xs font-medium hover:bg-red-100 dark:border-red-800 dark:hover:bg-red-900/40"
          >
            重试
          </button>
        </div>
      ) : (
        data.data && <ChartCard spec={data.data.chartSpec} title={item.title} />
      )}
    </div>
  );
}
