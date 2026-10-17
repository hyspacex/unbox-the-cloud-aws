"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { ActionResponse, BoxTask, ControlRow, FindingCard as Card, RunMode } from "@/lib/types";
import { StatusChip, SeverityTag } from "@/components/ui/StatusChip";
import { SecondaryLine } from "@/components/package/ControlRows";
import { utc } from "@/lib/ui/format";
import { T_BASE } from "@/lib/ui/motion";
import { ClauseSummary, ControlBlock } from "./Clauses";
import { EvidencePair } from "./EvidencePair";
import { utcInText } from "@/lib/ui/format";
import { VersionColumns } from "./Versions";
import { MachineBlock } from "./MachineBlock";
import { DispositionBlock } from "./Disposition";
import { Thread, authorTaskFromThread } from "./Thread";

function openedAt(card: Card): string | undefined {
  const forFinding = card.thread.filter((e) => e.finding_id === card.finding.finding_id || e.snapshot_id === card.finding.snapshot_id);
  const sorted = [...(forFinding.length ? forFinding : card.thread)].sort((a, b) => a.ts.localeCompare(b.ts));
  const opened = (card as Card & { opened_at?: string }).opened_at;
  return opened ?? sorted[0]?.ts;
}

export function FindingCardView({
  card,
  mode,
  onResult,
  onSelectRelated,
  onClose,
  layout = "drawer",
  project,
}: {
  card: Card;
  project?: string;
  mode?: RunMode;
  onResult?: (r: ActionResponse) => void;
  onSelectRelated?: (row: ControlRow) => void;
  onClose?: () => void;
  layout?: "drawer" | "page";
}) {
  const [lastResult, setLastResult] = useState<ActionResponse | null>(null);
  const threadId = `thread-${card.finding.finding_id}`;
  const seeThread = () => document.getElementById(threadId)?.scrollIntoView({ behavior: "smooth", block: "start" });

  const handleResult = (r: ActionResponse) => {
    setLastResult(r);
    onResult?.(r);
  };

  const status = lastResult?.row.status ?? card.row.status;
  const fromThread = authorTaskFromThread(card.thread)?.task ?? null;
  const authorTask: BoxTask | null = lastResult?.author_task ?? fromThread;
  const opened = openedAt(card);

  return (
    <article className={layout === "drawer" ? "min-h-full" : ""} aria-label={`Finding ${card.finding.finding_id}`}>
      <header className={`${layout === "drawer" ? "sticky top-0 z-10 px-7 pt-5 pb-4" : "pb-5"} bg-paper/95 backdrop-blur border-b hairline`}>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="eyebrow mb-1">Finding</div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <h2 className="mono text-[22px] font-semibold tracking-[-0.02em] text-ink">{card.finding.finding_id}</h2>
              {card.finding.severity ? <SeverityTag severity={card.finding.severity} /> : null}
              <StatusChip status={status} showSeverity={false} />
            </div>
            {status.secondary ? (
              <p className="mt-1.5 text-[12.5px] text-muted">
                <SecondaryLine text={utcInText(status.secondary)} />
              </p>
            ) : null}
          </div>
          {onClose ? (
            <button className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Close finding card">
              <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
                <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              Close
            </button>
          ) : null}
        </div>
        <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[12.5px] text-muted">
          {project ? <Meta k="Project" v={project} /> : null}
          <Meta k="Review owner" v={card.control.reviewer_role} />
          {opened ? <Meta k="Opened" v={<span className="mono">{utc(opened)}</span>} /> : null}
          <Meta k="Snapshot" v={<span className="mono">{card.finding.snapshot_id}</span>} />
          <Meta k="Tier" v={card.finding.tier} />
        </dl>
      </header>

      <div className={`${layout === "drawer" ? "px-7 py-6" : "py-6"} grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]`}>
        <div className="min-w-0 space-y-7">
          <EvidencePair card={card} />
          <ClauseSummary clauses={card.finding.clause_support} />
          <ControlBlock control={card.control} profileVersion={card.profile_version} />
          <VersionColumns prior={card.prior_version} next={card.new_version} />
          <MachineBlock finding={card.finding} traceSteps={card.trace_steps} />
          <div id={threadId} className="scroll-mt-[150px]">
            <Thread events={card.thread} authorTask={authorTask} />
          </div>
        </div>
        <aside className="min-w-0 space-y-5 lg:sticky lg:top-[132px] lg:self-start">
          <DispositionBlock card={card} mode={mode} onResult={handleResult} lastResult={lastResult} onSeeThread={seeThread} />
          <Related rows={card.related} current={card.finding.control_id} onSelect={onSelectRelated} />
        </aside>
      </div>
    </article>
  );
}

function Meta({ k, v }: { k: string; v: React.ReactNode }) {
  if (v == null) return null;
  return (
    <div className="flex items-baseline gap-1.5">
      <dt>{k}</dt>
      <dd className="text-ink-2">{v}</dd>
    </div>
  );
}

export function Related({
  rows,
  current,
  onSelect,
}: {
  rows: ControlRow[];
  current: string;
  onSelect?: (row: ControlRow) => void;
}) {
  const others = rows.filter((r) => r.control_id !== current);
  const attention = others.filter((r) => r.status.kind !== "verified_holds");
  const holds = others.filter((r) => r.status.kind === "verified_holds");
  return (
    <section aria-label="Related controls">
      <div className="flex items-baseline justify-between mb-2">
        <h4 className="text-[13px] font-semibold text-ink">Other controls on this snapshot</h4>
        <span className="text-[12px] text-muted">{others.length}</span>
      </div>
      <ul className="rounded-[10px] border hairline bg-panel divide-y divide-[var(--line)]">
        <AnimatePresence initial={false}>
          {attention.map((r) => (
            <motion.li key={r.control_id} layout="position" transition={T_BASE}>
              <button
                className="w-full text-left px-3 py-2 hover:bg-paper/80 transition-colors disabled:cursor-default"
                onClick={() => onSelect?.(r)}
                disabled={!onSelect}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="mono text-[12px] text-ink">{r.control_id}</span>
                  <span className="text-[11px] text-faint">{r.tier}</span>
                </div>
                <div className="mt-1">
                  <StatusChip status={r.status} size="sm" showSeverity={false} />
                </div>
              </button>
            </motion.li>
          ))}
        </AnimatePresence>
        {holds.length ? (
          <li className="px-3 py-2 text-[12.5px] text-muted" title={holds.map((h) => h.control_id).join(", ")}>
            <span className="text-teal-ink font-medium">{holds.length} hold</span> · {holds.map((h) => h.control_id.replace("SEC-ARCH-", "")).join(", ")}
          </li>
        ) : null}
      </ul>
    </section>
  );
}
