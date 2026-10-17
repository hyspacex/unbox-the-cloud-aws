"use client";

import { useState } from "react";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import type { ControlRow } from "@/lib/types";
import { StatusChip, TierTag } from "@/components/ui/StatusChip";
import { Caret } from "@/components/ui/Disclosure";
import { T_BASE, T_LAYOUT } from "@/lib/ui/motion";
import { toneClass } from "@/lib/ui/tone";
import { midTruncate, words } from "@/lib/ui/format";
import { compactSecondary } from "@/lib/ui/secondary";
import { isHold, orderByAttention, orderById } from "@/lib/ui/order";

const GRID =
  "grid grid-cols-[minmax(0,1fr)_36px] md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.8fr)_minmax(0,0.85fr)_36px] gap-x-4 gap-y-2";

export function ControlRows({
  rows,
  onOpen,
  selectedId,
  ordering = "attention",
  holdsDefaultOpen,
  preserveOrder = false,
}: {
  rows: ControlRow[];
  onOpen?: (row: ControlRow) => void;
  selectedId?: string | null;
  /** "id" keeps the profile order (baseline and pending); "attention" puts what needs a person first. */
  ordering?: "id" | "attention";
  /** Defaults to open when every row holds (baseline), closed otherwise. */
  holdsDefaultOpen?: boolean;
  /** Rows arrive already in display order (the parent controls the reveal order). */
  preserveOrder?: boolean;
}) {
  const ordered = preserveOrder ? rows : ordering === "id" ? orderById(rows) : orderByAttention(rows);
  const holds = ordered.filter(isHold);
  const others = ordered.filter((r) => !isHold(r));
  const allHold = others.length === 0 && holds.length > 0;
  const defaultOpen = holdsDefaultOpen ?? allHold;
  // Re-key the group when the default changes so a new run starts collapsed.
  const groupKey = `${defaultOpen}-${holds.length}`;
  const sel = (r: ControlRow) => selectedId != null && (selectedId === r.finding_id || selectedId === r.control_id);

  return (
    <LayoutGroup>
      <div className="panel overflow-hidden" role="table" aria-label="Controls on this snapshot">
        <div
          role="row"
          className={`hidden md:grid ${GRID} relative z-10 px-5 py-2.5 border-b hairline bg-panel-cool`}
        >
          <span className="eyebrow" role="columnheader">Control</span>
          <span className="eyebrow" role="columnheader">Displayed status</span>
          <span className="eyebrow" role="columnheader">Evidencing file</span>
          <span role="columnheader" className="sr-only">Machine detail</span>
        </div>
        {others.map((row, i) => (
          <Row key={row.control_id} row={row} last={i === others.length - 1 && holds.length === 0} onOpen={onOpen} selected={sel(row)} />
        ))}
        {holds.length ? <HoldsGroup key={groupKey} holds={holds} defaultOpen={defaultOpen} onOpen={onOpen} sel={sel} /> : null}
      </div>
    </LayoutGroup>
  );
}

function HoldsGroup({
  holds,
  defaultOpen,
  onOpen,
  sel,
}: {
  holds: ControlRow[];
  defaultOpen: boolean;
  onOpen?: (row: ControlRow) => void;
  sel: (r: ControlRow) => boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <motion.div layout="position" transition={T_LAYOUT}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={`w-full flex items-center gap-3 px-5 py-3 text-left hover:bg-paper/70 transition-colors ${open ? "border-b hairline" : ""}`}
      >
        <Caret open={open} />
        <span className={`chip ${toneClass(holds[0].status)}`}>
          <span className="chip-dot" aria-hidden />
          {holds.length} {holds.length === 1 ? "verification holds" : "verifications hold"}
        </span>
        <span className="text-[12.5px] text-muted truncate">
          {open ? "Evidence unchanged; no one needs to click anything." : holds.map((h) => h.control_id).join(" · ")}
        </span>
      </button>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            key="holds"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={T_BASE}
            style={{ overflow: "hidden" }}
          >
            {holds.map((row, i) => (
              <Row key={row.control_id} row={row} last={i === holds.length - 1} onOpen={onOpen} selected={sel(row)} />
            ))}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </motion.div>
  );
}

function Row({
  row,
  last,
  onOpen,
  selected,
}: {
  row: ControlRow;
  last: boolean;
  onOpen?: (row: ControlRow) => void;
  selected: boolean;
}) {
  const [open, setOpen] = useState(false);
  const clickable = Boolean(onOpen);
  const critical = row.status.kind.startsWith("needs_review") && (row.status.severity ?? row.severity) === "Critical";
  const sec = compactSecondary(row.status.secondary);
  const sevTag =
    row.status.kind === "acknowledge" ? (
      <span className="tag" title="Control tier">Tier {row.tier}</span>
    ) : row.status.severity ? (
      critical ? (
        <span className="tag !border-[var(--amber-dot)] !text-amber-ink font-semibold" title="Severity: control tier by application tier">
          Critical
        </span>
      ) : (
        <span className="tag" title="Severity: control tier by application tier">
          <span className="text-faint mr-1">Severity</span>
          {row.status.severity}
        </span>
      )
    ) : null;
  return (
    <motion.div
      layout="position"
      transition={T_LAYOUT}
      role="row"
      data-control={row.control_id}
      className={`relative ${last ? "" : "border-b hairline"} ${selected ? "bg-blue-bg/40" : ""}`}
      style={critical ? { boxShadow: "inset 3px 0 0 var(--amber-dot)" } : undefined}
    >
      <div
        className={`${GRID} px-5 py-3 items-start ${clickable ? "cursor-pointer hover:bg-paper/70 transition-colors" : ""}`}
        onClick={() => onOpen?.(row)}
        onKeyDown={(e) => {
          // Only the row itself activates; Enter on a nested control keeps that control's behaviour.
          if (e.target !== e.currentTarget) return;
          if ((e.key === "Enter" || e.key === " ") && onOpen) {
            e.preventDefault();
            onOpen(row);
          }
        }}
        tabIndex={clickable ? 0 : -1}
        aria-label={`${row.control_id} ${row.title}: ${row.status.label}`}
      >
        <div role="cell" className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="mono text-[13px] font-medium text-ink">{row.control_id}</span>
            <TierTag tier={row.tier} />
          </div>
          <div className="mt-0.5 text-[14px] leading-snug text-ink-2">{row.title}</div>
        </div>
        <div role="cell" className="min-w-0 col-start-1 md:col-start-auto">
          <div className="flex flex-wrap items-center gap-2">
            <StatusChip status={row.status} showSeverity={false} />
            {sevTag}
            <RuleLink rule={row.status.rule} />
          </div>
          {(row.status as { detail?: string }).detail ? (
            <div className="mt-1 text-[12.5px] leading-[1.45] text-ink-2">{(row.status as { detail?: string }).detail}</div>
          ) : null}
          <AnimatePresence initial={false} mode="popLayout">
            {sec ? (
              <motion.div
                key={sec.full}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={T_BASE}
                className="mt-1 text-[12.5px] leading-[1.45] text-muted"
                title={sec.full}
              >
                {sec.verb ? (
                  <>
                    {sec.verb} <span className="text-blue-ink font-medium">{sec.name}</span>
                    {sec.rest.map((p) => (
                      <span key={p}>
                        <span className="mx-1.5 text-faint">·</span>
                        <span className={/^\d{4}/.test(p) ? "tabular-nums" : ""}>{p}</span>
                      </span>
                    ))}
                  </>
                ) : (
                  sec.rest[0]
                )}
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
        <div role="cell" className="min-w-0 col-start-1 md:col-start-auto text-[13px] text-ink-2">
          {row.evidencing ? (
            <>
              <div
                className="mono whitespace-nowrap overflow-hidden text-ellipsis"
                title={`${row.evidencing.fileName} ${row.evidencing.versionLabel ?? ""} (version id ${row.evidencing.versionId})`}
              >
                <span className="xl:hidden">{midTruncate(row.evidencing.fileName, 22)}</span>
                <span className="hidden xl:inline">{row.evidencing.fileName}</span>{" "}
                <span className="text-muted">{row.evidencing.versionLabel ?? ""}</span>
                {(row.evidencing as { quarantined?: boolean }).quarantined ? <span className="text-muted"> (quarantined)</span> : null}
              </div>
              {row.evidencing.section ? <div className="text-muted text-[12.5px] truncate">{row.evidencing.section}</div> : null}
            </>
          ) : (
            <span className="text-faint">{row.status.kind === "pending_recheck" ? "re-checking" : "none"}</span>
          )}
        </div>
        <div role="cell" className="row-start-1 col-start-2 md:row-start-auto md:col-start-auto flex justify-end">
          <button
            type="button"
            className="btn btn-ghost btn-sm !px-2 text-muted"
            aria-expanded={open}
            aria-label={open ? "Hide machine detail" : "Show machine detail"}
            title="Machine detail"
            onClick={(e) => {
              e.stopPropagation();
              setOpen((o) => !o);
            }}
            onKeyDown={(e) => e.stopPropagation()}
            aria-controls={`detail-${row.control_id}`}
          >
            <Caret open={open} />
          </button>
        </div>
      </div>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            key="detail"
            id={`detail-${row.control_id}`}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={T_BASE}
            style={{ overflow: "hidden" }}
          >
            <MachineDetail row={row} />
          </motion.div>
        ) : null}
      </AnimatePresence>
    </motion.div>
  );
}

/** C8: a small link from a status to the published rule that produced it. */
export function RuleLink({ rule }: { rule: number }) {
  return (
    <a
      href={`/rules#rule-${rule}`}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
      className="text-[11px] text-faint hover:text-ink-2 underline decoration-dotted underline-offset-2 whitespace-nowrap"
      title={`Display rule ${rule} on the published rules page`}
    >
      rule {rule}
    </a>
  );
}

/** Highlights the human name in "Verified by Name, role, ..." lines in deep blue. */
export function SecondaryLine({ text }: { text: string }) {
  const m = text.match(/^(Verified by |Returned by |Reviewed by )([^,]+)(,.*)$/);
  if (!m) return <>{text}</>;
  return (
    <>
      {m[1]}
      <span className="text-blue-ink font-medium">{m[2]}</span>
      {m[3]}
    </>
  );
}

function MachineDetail({ row }: { row: ControlRow }) {
  return (
    <div className="mx-5 mb-4 rounded-lg border border-grey-line bg-grey-bg/60 px-4 py-3 text-[13px] text-grey-ink">
      <div className="eyebrow !text-grey-ink mb-2">Machine assessment, not a verdict</div>
      <dl className="grid grid-cols-2 md:grid-cols-5 gap-x-6 gap-y-2">
        <Item k="Assessment" v={<span className="mono">{row.machine_assessment}</span>} />
        <Item k="Classification" v={<span className="mono">{row.change_classification}</span>} />
        <Item k="Verification holds" v={<span className="mono">{String(row.verification_holds)}</span>} />
        <Item k="Acknowledgment" v={<span className="mono">{row.acknowledgment_required ? "required" : "not required"}</span>} />
        <Item
          k="Display rule"
          v={
            <span>
              <span className="mono">{row.status.rule}</span> <span className="text-muted">({words(row.status.kind)})</span>
            </span>
          }
        />
        <Item k="Current disposition" v={<span className="mono">{row.current_disposition}</span>} />
        <Item k="Projection code" v={<span className="mono">{row.status.projection_code}</span>} />
        {row.finding_id ? <Item k="Finding" v={<span className="mono">{row.finding_id}</span>} /> : null}
        {row.open_task_id ? <Item k="Open Box task" v={<span className="mono">{row.open_task_id}</span>} /> : null}
        <Item k="Reviewer role" v={row.reviewer_role} />
      </dl>
    </div>
  );
}

function Item({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] uppercase tracking-[0.06em] text-faint">{k}</dt>
      <dd className="mt-0.5 break-words">{v}</dd>
    </div>
  );
}
