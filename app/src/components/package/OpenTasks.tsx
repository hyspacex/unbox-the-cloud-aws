"use client";

import { AnimatePresence, motion } from "motion/react";
import type { TaskItem } from "@/lib/client";
import { T_BASE } from "@/lib/ui/motion";
import { utc } from "@/lib/ui/format";

export function OpenTasks({ tasks, loading, error }: { tasks: TaskItem[]; loading?: boolean; error?: string | null }) {
  const isOpen = (t: TaskItem) =>
    (t.status ?? "").toLowerCase() === "open" || (!t.status && (!t.resolution_state || t.resolution_state === "incomplete") && !t.response);
  const open = tasks.filter(isOpen);
  const done = tasks.filter((t) => !isOpen(t));
  const outcome = (t: TaskItem) => t.response?.resolution_state ?? t.resolution_state ?? t.status ?? "completed";
  const counts = done.reduce<Record<string, number>>((acc, t) => {
    const k = outcome(t);
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {});
  const summary = [...Object.entries(counts).map(([k, n]) => `${n} ${k}`), `${open.length} open`].join(" · ");
  return (
    <section aria-label="Tasks in Box">
      <div className="flex items-baseline justify-between mb-2">
        <h3 className="text-[14px] font-semibold text-ink">Tasks in Box</h3>
        <span className="text-[12.5px] text-muted">
          {error ? <span className="text-red-ink">unavailable: {error}</span> : loading ? "loading" : summary}
        </span>
      </div>
      {tasks.length === 0 && !loading && !error ? (
        <p className="text-[13px] text-muted">No Keel tasks on this folder.</p>
      ) : null}
      <ul className="space-y-1.5">
        <AnimatePresence initial={false}>
          {[...open, ...done].map((t) => (
            <motion.li
              layout="position"
              key={t.task_id}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={T_BASE}
              className="rounded-lg border hairline bg-panel px-3 py-2 text-[12.5px]"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="mono text-ink">{t.task_id}</span>
                <span className={`text-[11.5px] font-medium ${isOpen(t) ? "text-amber-ink" : "text-muted"}`}>
                  {isOpen(t) ? "open" : outcome(t)}
                </span>
              </div>
              <div className="mt-0.5 text-muted">
                {(t as TaskItem & { label?: string }).label ? (
                  // Quarantine tasks name the file and every control they block (judge3 B5).
                  <>
                    {(t as TaskItem & { label?: string }).label} · <span className="text-blue-ink">{t.assignee}</span>
                    {(t as TaskItem & { control_ids?: string[] }).control_ids?.length &&
                    !(t as TaskItem & { control_ids?: string[] }).control_ids!.every((c) => ((t as TaskItem & { label?: string }).label ?? "").includes(c)) ? (
                      <> · <span className="mono">{(t as TaskItem & { control_ids?: string[] }).control_ids!.join(", ")}</span></>
                    ) : null}
                  </>
                ) : (
                  <>
                    {t.kind === "author" || String(t.kind).startsWith("author") ? "Author task" : "Review task"} ·{" "}
                    <span className="text-blue-ink">{t.assignee}</span> · {t.action} ·{" "}
                    <span className="mono">{t.control_id}</span> · <span className="mono">{t.finding_id}</span>
                  </>
                )}
                {t.due_at ? <> · due <span className="mono">{utc(t.due_at)}</span></> : null}
              </div>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
    </section>
  );
}
