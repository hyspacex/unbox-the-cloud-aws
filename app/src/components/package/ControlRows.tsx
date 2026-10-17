"use client";

import { useState } from "react";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import type { ControlRow } from "@/lib/types";
import { StatusChip, TierTag } from "@/components/ui/StatusChip";
import { Caret } from "@/components/ui/Disclosure";
import { T_BASE, T_LAYOUT } from "@/lib/ui/motion";
import { words } from "@/lib/ui/format";

export function ControlRows({
  rows,
  onOpen,
  selectedId,
}: {
  rows: ControlRow[];
  onOpen?: (row: ControlRow) => void;
  selectedId?: string | null;
}) {
  return (
    <LayoutGroup>
      <div className="panel overflow-hidden" role="table" aria-label="Controls on this snapshot">
        <div
          role="row"
          className="hidden md:grid grid-cols-[minmax(0,1.25fr)_minmax(0,1.6fr)_minmax(0,0.85fr)_36px] gap-4 px-5 py-2.5 border-b hairline bg-panel-cool"
        >
          <span className="eyebrow" role="columnheader">Control</span>
          <span className="eyebrow" role="columnheader">Displayed status</span>
          <span className="eyebrow" role="columnheader">Evidencing file</span>
          <span role="columnheader" className="sr-only">Machine detail</span>
        </div>
        {rows.map((row, i) => (
          <Row
            key={row.control_id}
            row={row}
            index={i}
            last={i === rows.length - 1}
            onOpen={onOpen}
            selected={selectedId != null && (selectedId === row.finding_id || selectedId === row.control_id)}
          />
        ))}
      </div>
    </LayoutGroup>
  );
}

function Row({
  row,
  last,
  onOpen,
  selected,
}: {
  row: ControlRow;
  index: number;
  last: boolean;
  onOpen?: (row: ControlRow) => void;
  selected: boolean;
}) {
  const [open, setOpen] = useState(false);
  const clickable = Boolean(onOpen);
  return (
    <motion.div
      layout="position"
      transition={T_LAYOUT}
      role="row"
      data-control={row.control_id}
      className={`${last ? "" : "border-b hairline"} ${selected ? "bg-blue-bg/40" : ""}`}
    >
      <div
        className={`grid grid-cols-[minmax(0,1fr)_36px] md:grid-cols-[minmax(0,1.15fr)_minmax(0,1.75fr)_minmax(0,0.85fr)_36px] gap-x-4 gap-y-2 px-5 py-3.5 items-start ${
          clickable ? "cursor-pointer hover:bg-paper/70 transition-colors" : ""
        }`}
        onClick={() => onOpen?.(row)}
        onKeyDown={(e) => {
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
          <div className="mt-0.5 text-[14.5px] leading-snug text-ink-2">{row.title}</div>
        </div>
        <div role="cell" className="min-w-0 col-start-1 md:col-start-auto">
          <StatusChip status={row.status} />
          <AnimatePresence initial={false} mode="popLayout">
            {row.status.secondary ? (
              <motion.div
                key={row.status.secondary}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={T_BASE}
                className="mt-1.5 text-[12.5px] leading-[1.45] text-muted"
              >
                <SecondaryLine text={row.status.secondary} />
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
        <div role="cell" className="min-w-0 col-start-1 md:col-start-auto text-[13px] text-ink-2">
          {row.evidencing ? (
            <>
              <div className="mono truncate" title={`${row.evidencing.fileName} ${row.evidencing.versionLabel ?? ""} (version id ${row.evidencing.versionId})`}>
                {row.evidencing.fileName} <span className="text-muted">{row.evidencing.versionLabel ?? ""}</span>
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
          >
            <Caret open={open} />
          </button>
        </div>
      </div>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            key="detail"
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
