import { useState } from "react";
import { ChevronDown, Download, Table2 } from "lucide-react";
import { clsx } from "../clsx";

export function ResultTable({
  columns,
  rows,
  rowCount,
}: {
  columns: string[];
  rows: unknown[][];
  rowCount?: number;
}) {
  const [open, setOpen] = useState(false);
  const preview = rows.slice(0, 10);

  const exportCsv = () => {
    const esc = (v: unknown) => {
      const s = v == null ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
    };
    const csv = [columns.map(esc).join(","), ...rows.map((r) => r.map(esc).join(","))].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "datapilot-result.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
      <div className="flex items-center gap-2 bg-zinc-50 px-3 py-2 text-xs font-medium text-zinc-600 dark:bg-zinc-800/60 dark:text-zinc-300">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex flex-1 items-center gap-2 text-left"
        >
          <Table2 className="h-3.5 w-3.5 text-teal-600 dark:text-teal-400" />
          结果数据
          <span className="rounded bg-zinc-200/70 px-1 py-px text-[10px] text-zinc-500 dark:bg-zinc-700 dark:text-zinc-400">
            {rowCount ?? rows.length} 行
          </span>
          <ChevronDown className={clsx("ml-auto h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
        </button>
        <button
          onClick={exportCsv}
          title="导出 CSV"
          className="rounded-md p-1 text-zinc-500 transition-colors hover:bg-zinc-200 hover:text-zinc-900 dark:hover:bg-zinc-700 dark:hover:text-zinc-100"
        >
          <Download className="h-3.5 w-3.5" />
        </button>
      </div>
      {open && (
        <div className="scroll-thin max-h-80 overflow-auto">
          <table className="w-full border-collapse text-[12.5px]">
            <thead>
              <tr className="sticky top-0 bg-white dark:bg-zinc-950">
                {columns.map((c) => (
                  <th
                    key={c}
                    className="border-b border-zinc-100 px-3 py-2 text-left font-medium text-zinc-500 dark:border-zinc-800 dark:text-zinc-400"
                  >
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {preview.map((row, i) => (
                <tr key={i} className="hover:bg-zinc-50 dark:hover:bg-zinc-900">
                  {row.map((cell, j) => (
                    <td
                      key={j}
                      className={clsx(
                        "border-b border-zinc-50 px-3 py-1.5 dark:border-zinc-900",
                        typeof cell === "number"
                          ? "font-mono text-right tabular-nums"
                          : "text-zinc-700 dark:text-zinc-300"
                      )}
                    >
                      {cell == null ? "—" : String(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length > 10 && (
            <div className="px-3 py-2 text-center text-[11px] text-zinc-400 dark:text-zinc-600">
              预览前 10 行，完整数据请导出 CSV
            </div>
          )}
        </div>
      )}
    </div>
  );
}
