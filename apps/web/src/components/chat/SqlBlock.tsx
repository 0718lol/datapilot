import { useState } from "react";
import { Check, ChevronDown, Copy, FileCode2 } from "lucide-react";
import { clsx } from "../clsx";

export function SqlBlock({ sql }: { sql: string }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(sql);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* 剪贴板不可用时静默失败 */
    }
  };

  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 bg-zinc-50 px-3 py-2 text-left text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-100 dark:bg-zinc-800/60 dark:text-zinc-300 dark:hover:bg-zinc-800"
      >
        <FileCode2 className="h-3.5 w-3.5 text-teal-600 dark:text-teal-400" />
        生成的 SQL
        <span className="rounded bg-zinc-200/70 px-1 py-px text-[10px] font-medium text-zinc-500 dark:bg-zinc-700 dark:text-zinc-400">
          DuckDB
        </span>
        <span className="ml-auto flex items-center gap-1">
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation();
              void copy();
            }}
            onKeyDown={(e) => e.key === "Enter" && e.stopPropagation()}
            className="rounded-md p-1 hover:bg-zinc-200 dark:hover:bg-zinc-700"
            title="复制 SQL"
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 text-teal-600 dark:text-teal-400" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
          </span>
          <ChevronDown
            className={clsx("h-3.5 w-3.5 transition-transform", open && "rotate-180")}
          />
        </span>
      </button>
      {open && (
        <pre className="scroll-thin max-h-72 overflow-auto bg-white px-4 py-3 font-mono text-[12.5px] leading-relaxed text-zinc-800 dark:bg-zinc-950 dark:text-zinc-200">
          {sql}
        </pre>
      )}
    </div>
  );
}
