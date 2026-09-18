import { Check, Loader2, AlertCircle } from "lucide-react";
import { clsx } from "../clsx";
import { STAGE_ORDER, type AnswerView } from "./view";

export function StatusSteps({ view }: { view: AnswerView }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
      {STAGE_ORDER.map(({ key, label }) => {
        const state = view.stages[key];
        const failed = view.error?.stage === key;
        return (
          <div
            key={key}
            className={clsx(
              "flex items-center gap-1.5 text-xs",
              failed
                ? "text-red-600 dark:text-red-400"
                : state === "done"
                  ? "text-teal-600 dark:text-teal-400"
                  : state === "active"
                    ? "text-zinc-900 dark:text-zinc-100"
                    : "text-zinc-400 dark:text-zinc-600"
            )}
          >
            {failed ? (
              <AlertCircle className="h-3.5 w-3.5" />
            ) : state === "done" ? (
              <Check className="h-3.5 w-3.5" />
            ) : state === "active" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <span className="h-3.5 w-3.5 rounded-full border border-current opacity-50" />
            )}
            {label}
          </div>
        );
      })}
    </div>
  );
}
