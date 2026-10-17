"use client";

import { AnimatePresence, motion } from "motion/react";
import type { BoxTask, LedgerEvent } from "@/lib/types";
import { Disclosure } from "@/components/ui/Disclosure";
import { utc } from "@/lib/ui/format";
import { actorColor } from "@/lib/ui/tone";
import { T_BASE } from "@/lib/ui/motion";

export function isAuthorTask(t?: Partial<BoxTask> & { kind?: string }): boolean {
  return Boolean(t && typeof t.kind === "string" && t.kind.startsWith("author"));
}

export function authorTaskFromThread(thread: LedgerEvent[]): { task: BoxTask; event: LedgerEvent } | null {
  const evs = [...thread].sort((a, b) => b.ts.localeCompare(a.ts) || b.event_id.localeCompare(a.event_id));
  for (const e of evs) {
    if (e.event_type === "box_task_created" && e.task && isAuthorTask(e.task)) return { task: e.task, event: e };
  }
  return null;
}

function summary(e: LedgerEvent): string {
  switch (e.event_type) {
    case "human_disposition_recorded":
      return `${e.human_disposition?.disposition ?? "disposition"} recorded${e.human_disposition?.reason ? `: "${e.human_disposition.reason}"` : ""}`;
    case "box_task_response_ingested":
      return `Box task response ${e.response?.resolution_state ?? ""}${e.response?.message ? `: "${e.response.message}"` : ""}`;
    case "box_task_created":
      return `${isAuthorTask(e.task) ? "Author" : "Review"} task ${e.task?.task_id ?? ""} created for ${e.task?.assignee ?? ""}`;
    case "control_evaluated":
      return `Evaluated: ${e.machine_assessment ?? ""}, ${e.change_classification ?? ""}`;
    case "verification_holds":
      return "Prior verification holds";
    case "verification_requires_acknowledgment":
      return `Acknowledgment required${e.acknowledgment?.reason ? `: ${e.acknowledgment.reason}` : ""}`;
    case "binding_changed":
      return `Evidence binding changed to ${e.fileName ?? ""}`;
    case "action_reapplied":
      return "Action re-applied on the newer snapshot";
    case "action_rejected_stale":
      return "Action rejected: binding changed";
    case "acknowledgment_recorded":
      return "Acknowledgment recorded, no disposition";
    default:
      return e.event_type.replace(/_/g, " ");
  }
}

export function AuthorTaskBlock({ task, compact = false }: { task: BoxTask; compact?: boolean }) {
  return (
    <div className="rounded-[10px] border border-blue-line bg-blue-bg/60 px-4 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="text-[13px] font-semibold text-blue-ink">Author task in Box</div>
        <span className="mono text-[12px] text-blue-ink">{task.task_id}</span>
      </div>
      <div className="mt-1 text-[12.5px] text-ink-2">
        Assigned to <span className="font-medium text-blue-ink">{task.assignee}</span>
        {task.due_at ? (
          <>
            {" "}
            · due <span className="mono">{utc(task.due_at)}</span>
          </>
        ) : null}{" "}
        · finding <span className="mono">{task.finding_id}</span> · snapshot <span className="mono">{task.snapshot_id}</span>
      </div>
      {!compact ? <p className="mt-2 text-[13px] leading-[1.55] text-ink-2 whitespace-pre-wrap">{task.message}</p> : null}
    </div>
  );
}

export function Thread({ events, authorTask }: { events: LedgerEvent[]; authorTask?: BoxTask | null }) {
  const sorted = [...events].sort((a, b) => b.ts.localeCompare(a.ts) || b.event_id.localeCompare(a.event_id));
  return (
    <section aria-label="Thread">
      <div className="flex items-baseline justify-between mb-2">
        <h4 className="text-[13px] font-semibold text-ink">Thread</h4>
        <span className="text-[12px] text-muted">ledger events and task responses for this control, newest first</span>
      </div>
      <div className="space-y-2">
        <AnimatePresence initial={false}>
          {authorTask ? (
            <motion.div key={"author-" + authorTask.task_id} layout initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} transition={T_BASE}>
              <AuthorTaskBlock task={authorTask} />
            </motion.div>
          ) : null}
        </AnimatePresence>
        <ol className="rounded-[10px] border hairline bg-panel divide-y divide-[var(--line)]">
          <AnimatePresence initial={false}>
            {sorted.map((e) => (
              <motion.li key={e.event_id} layout="position" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={T_BASE} className="px-3.5 py-2.5">
                <div className="grid grid-cols-[8px_minmax(0,1fr)] gap-x-3">
                  <span className="mt-[7px] h-2 w-2 rounded-full" style={{ background: actorColor(e.actor.type) }} aria-hidden />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                      <span className={`text-[13px] ${e.actor.type === "human" ? "text-blue-ink font-medium" : "text-ink"}`}>{summary(e)}</span>
                      <span className="mono text-[11.5px] text-faint whitespace-nowrap">{utc(e.ts)}</span>
                    </div>
                    <div className="mt-0.5 text-[11.5px] text-muted">
                      <span className="mono">{e.event_id}</span> · <span className="mono">{e.event_type}</span> · {e.actor.type}{" "}
                      <span className={e.actor.type === "human" ? "text-blue-ink" : ""}>{e.actor.name}</span>
                      {e.snapshot_id ? <> · <span className="mono">{e.snapshot_id}</span></> : null}
                      {e.response?.assigned_to ? <> · identity as returned by Box: {e.response.assigned_to.login}</> : null}
                    </div>
                    <Disclosure label="raw event" className="mt-1" buttonClassName="!text-[11.5px] !text-faint hover:!text-ink-2">
                      <pre className="mono text-[11px] leading-[1.5] whitespace-pre-wrap break-words bg-paper-2 rounded-md p-2.5 text-ink-2 max-h-72 overflow-auto scroll-quiet">
                        {JSON.stringify(e, null, 2)}
                      </pre>
                    </Disclosure>
                  </div>
                </div>
              </motion.li>
            ))}
          </AnimatePresence>
        </ol>
      </div>
    </section>
  );
}
