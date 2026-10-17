"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { ControlRow, FindingCard, PackageView } from "@/lib/types";
import { api, peekFinding } from "@/lib/client";
import { orderByAttention, orderById } from "@/lib/ui/order";
import { useKeelState } from "@/components/KeelStateProvider";
import { C, CheckIcon, Chevron, DUR, EASE_OUT, RowChip, stableSeverity, SectionLabel, clampWords, isDecisionKind, isRecordedRow, toneColor } from "./parts";

/** First-seen attention order per snapshot, kept for the session so recorded rows do not jump. */
const SEEN_ORDER = new Map<string, string[]>();

type CardInfo = { receipt?: FindingCard["receipt"]; severity?: string };
type Receipts = Record<string, CardInfo | undefined>;

/**
 * Receipts for the rows that are not holds, read from their finding cards (the cache first). Skipped during a
 * replay: the replayed rows are a recorded outcome and the live cards would not match them.
 */
function useReceipts(pkg: PackageView | null, skip: boolean): Receipts {
  const [receipts, setReceipts] = useState<Receipts>({});
  const key = pkg && !skip ? `${pkg.snapshot.snapshot_id}|${pkg.rows.map((r) => `${r.control_id}:${r.status.kind}:${r.current_disposition}:${r.decision_recorded ? 1 : 0}`).join(",")}|${(pkg.awaiting_drafts ?? []).length}` : "";
  useEffect(() => {
    if (!pkg || skip) return;
    let alive = true;
    const rows = pkg.rows.filter((r) => (r.status.kind !== "verified_holds" || r.decision_recorded) && r.status.kind !== "pending_recheck");
    Promise.all(
      rows.map(async (r) => {
        const cached = peekFinding(r.finding_id ?? r.control_id) ?? peekFinding(r.control_id);
        if (cached && cached.finding.snapshot_id === pkg.snapshot.snapshot_id) return [r.control_id, { receipt: cached.receipt, severity: cached.finding.severity }] as const;
        try {
          const c = await api.finding(r.control_id);
          return [r.control_id, { receipt: c.receipt, severity: c.finding.severity }] as const;
        } catch {
          return [r.control_id, undefined] as const;
        }
      }),
    ).then((pairs) => alive && setReceipts(Object.fromEntries(pairs)));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return skip ? {} : receipts;
}

/** The file that changed on this snapshot: the highest version label, then the latest update. */
function changedFile(pkg: PackageView): { name: string; version: string } | null {
  if (!pkg.trace_run_id) return null;
  const num = (v?: string) => Number((v ?? "").replace(/[^\d]/g, "")) || 0;
  if (pkg.files?.length) {
    const f = pkg.files
      .slice()
      .sort((a, b) => num(b.version_label) - num(a.version_label) || (b.updated_at ?? "").localeCompare(a.updated_at ?? ""))[0];
    return f ? { name: f.file_name, version: f.version_label ?? "" } : null;
  }
  const f = pkg.snapshot.files.slice().sort((a, b) => num(b.versionLabel) - num(a.versionLabel))[0];
  return f ? { name: f.fileName, version: f.versionLabel ?? "" } : null;
}

/** "SEC-ARCH-01 · 02 · 04": the shared prefix once, then the suffixes. */
function idLine(ids: string[]): string {
  if (!ids.length) return "";
  const prefix = ids[0].replace(/[^-]+$/, "");
  return ids.map((id, i) => (i > 0 && id.startsWith(prefix) ? id.slice(prefix.length) : id)).join(" · ");
}

export function Level1() {
  const { pkg, pkgError, run, replay, endReplay, pushView } = useKeelState();
  const running = Boolean(run?.running);
  const locked = running || Boolean(replay);
  const receipts = useReceipts(pkg, Boolean(replay) || running);
  const awaiting = useMemo(() => new Set((pkg?.awaiting_drafts ?? []).map((a) => a.control_id)), [pkg]);

  const groups = useMemo(() => {
    // Rule 1 while a re-check runs: every row reads Re-check pending with its prior label struck through,
    // even before the engine has marked the rows pending (the same transform the provider applies to replays).
    const rows = (pkg?.rows ?? []).map((r) =>
      running && r.status.kind !== "pending_recheck"
        ? { ...r, status: { ...r.status, rule: 1, kind: "pending_recheck" as const, label: "Re-check pending", struck: r.status.label, tone: "grey" as const } }
        : r,
    );
    const pending = rows.filter((r) => r.status.kind === "pending_recheck");
    // decision_recorded wins over the kind: an acknowledged row may come back as rule 10 "Verified, holds".
    const recordedRaw = rows.filter(
      (r) => r.status.kind !== "pending_recheck" && (r.decision_recorded === true || (r.status.kind !== "verified_holds" && isRecordedRow(r, receipts[r.control_id]?.receipt))),
    );
    const holds = orderById(rows.filter((r) => r.status.kind === "verified_holds" && !recordedRaw.includes(r)));
    const rec = new Set(recordedRaw.map((r) => r.control_id));
    const decide = orderByAttention(rows.filter((r) => !rec.has(r.control_id) && isDecisionKind(r.status.kind)));
    const ack = orderByAttention(rows.filter((r) => !rec.has(r.control_id) && r.status.kind === "acknowledge"));
    // Stable order (design 2.4): a row keeps the place it had while it needed the reviewer.
    const snapId = pkg?.snapshot.snapshot_id ?? "";
    const seen = SEEN_ORDER.get(snapId) ?? [];
    for (const r of [...decide, ...ack]) if (!seen.includes(r.control_id)) seen.push(r.control_id);
    if (snapId) SEEN_ORDER.set(snapId, seen);
    const attention = orderByAttention(recordedRaw).map((r) => r.control_id);
    const place = (id: string) => (seen.includes(id) ? seen.indexOf(id) : 1000 + attention.indexOf(id));
    const recorded = recordedRaw.slice().sort((a, b) => place(a.control_id) - place(b.control_id));
    const placed = new Set([...pending, ...holds, ...recorded, ...decide, ...ack].map((r) => r.control_id));
    // Anything the engine adds later still shows, under Recorded (human-owned) or Needs your decision.
    const rest = rows.filter((r) => !placed.has(r.control_id));
    return { pending: orderById(pending), holds, recorded, decide: [...decide, ...rest], ack };
  }, [pkg, receipts, running]);

  const onlyHolds = Boolean(pkg) && groups.holds.length === (pkg?.rows.length ?? -1);
  const [holdsOpen, setHoldsOpen] = useState<boolean | null>(null);
  const showHolds = holdsOpen ?? onlyHolds;

  if (!pkg) {
    return (
      <div className="px-5 py-4 text-[13px]" style={{ color: pkgError ? C.red : C.secondary }}>
        {pkgError ? `Keel is not reachable: ${pkgError}` : "Loading the package…"}
      </div>
    );
  }

  const snap = pkg.snapshot.snapshot_id;
  const changed = changedFile(pkg);
  const n = pkg.rows.length;
  const holdText = `${groups.holds.length} ${groups.holds.length === 1 ? "verification holds" : "verifications hold"}`;
  const line1 = changed ? `${changed.name} ${changed.version} · snapshot ${snap}` : onlyHolds ? `snapshot ${snap} · ${holdText}` : `snapshot ${snap}`;
  // Not evaluated comes from the engine's counts (keyed by displayed label); timing lives in How it was checked.
  const notEvaluated = Object.entries(pkg.counts ?? {})
    .filter(([label]) => /^not evaluated/i.test(label))
    .reduce((a, [, v]) => a + (Number(v) || 0), 0);
  const line2 = running
    ? `Re-checking ${n} controls…`
    : pkg.trace_run_id
      ? notEvaluated > 0
        ? `Re-checked ${n - notEvaluated} controls · ${notEvaluated} not evaluated`
        : `Re-checked ${n} controls`
      : null;

  const open = (r: ControlRow) => !locked && pushView({ kind: "control", controlId: r.control_id });

  // ArrowUp / ArrowDown move between rows (roving, like the menu); Enter opens.
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    const items = Array.from(e.currentTarget.querySelectorAll<HTMLElement>("button[data-row]:not([disabled])"));
    const i = items.indexOf(document.activeElement as HTMLElement);
    if (i < 0 || !items.length) return;
    e.preventDefault();
    items[(i + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
  };

  return (
    <div className="px-5 pt-3 pb-6" onKeyDown={onKeyDown}>
      {replay ? (
        <div className="mb-3 flex items-center justify-between gap-2 rounded-[4px] border px-3 py-2 text-[12.5px]" style={{ borderColor: C.border, background: C.greyBg, color: C.text }}>
          <span>
            <span className="font-bold">Replay</span> of {replay.runId}. Nothing is re-evaluated.
          </span>
          <button type="button" className="font-bold hover:underline" style={{ color: C.boxBlue }} onClick={endReplay}>
            End replay
          </button>
        </div>
      ) : null}
      <header className="mb-4">
        <div className="text-[14px] font-bold" style={{ color: C.text }}>
          {line1}
        </div>
        {line2 ? (
          <div className="text-[12.5px] tabular-nums" style={{ color: C.secondary }}>
            {line2}
          </div>
        ) : null}
      </header>

      {groups.pending.length ? (
        <Section label="Re-check pending">
          {groups.pending.map((r) => (
            <Row key={r.control_id} row={r} locked onOpen={open} />
          ))}
        </Section>
      ) : null}
      {groups.decide.length ? (
        <Section label="Needs your decision">
          {groups.decide.map((r) => (
            <Row key={r.control_id} row={r} locked={locked} onOpen={open} awaiting={awaiting.has(r.control_id)} severity={stableSeverity(r, receipts[r.control_id]?.severity, pkg.snapshot.snapshot_id)} />
          ))}
        </Section>
      ) : null}
      {groups.ack.length ? (
        <Section label="Acknowledge">
          {groups.ack.map((r) => (
            <Row key={r.control_id} row={r} locked={locked} onOpen={open} hollow severity={stableSeverity(r, receipts[r.control_id]?.severity, pkg.snapshot.snapshot_id)} />
          ))}
        </Section>
      ) : null}
      {groups.recorded.length ? (
        <Section label="Recorded">
          {groups.recorded.map((r) => (
            <Row key={r.control_id} row={r} locked={locked} onOpen={open} receipt={receipts[r.control_id]?.receipt} recorded severity={stableSeverity(r, receipts[r.control_id]?.severity, pkg.snapshot.snapshot_id)} />
          ))}
        </Section>
      ) : null}

      {groups.holds.length ? (
        <section className="mt-1" aria-label="Verifications that hold">
          <button
            type="button"
            className="flex w-full items-center justify-between rounded-[4px] px-1 py-1.5 text-left text-[13px] font-bold hover:bg-[#F4F6FA]"
            style={{ color: C.text }}
            aria-expanded={showHolds}
            onClick={() => setHoldsOpen(!showHolds)}
          >
            <span>{holdText}</span>
            <Chevron dir={showHolds ? "up" : "down"} size={13} />
          </button>
          <AnimatePresence initial={false}>
            {showHolds ? (
              <motion.ul
                key="holds"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: DUR.inline, ease: EASE_OUT }}
                style={{ overflow: "hidden", borderColor: C.border }}
                className="mt-1 rounded-[4px] border"
              >
                {groups.holds.map((r) => (
                  <li key={r.control_id} className="border-b last:border-b-0" style={{ borderColor: C.border }}>
                    <button
                      type="button"
                      disabled={locked}
                      data-row={r.control_id}
                      onClick={() => open(r)}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] enabled:hover:bg-[#F4F6FA] disabled:cursor-default"
                    >
                      <span className="mono flex-none text-[12px] font-bold" style={{ color: C.text }}>
                        {r.control_id}
                      </span>
                      <span className="min-w-0 flex-1 truncate" style={{ color: C.secondary }} title={r.title}>
                        {r.title}
                      </span>
                      {!locked ? <Chevron size={12} /> : null}
                    </button>
                  </li>
                ))}
              </motion.ul>
            ) : (
              <motion.p key="ids" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mono px-1 text-[12px]" style={{ color: C.secondary }}>
                {idLine(groups.holds.map((r) => r.control_id))}
              </motion.p>
            )}
          </AnimatePresence>
        </section>
      ) : null}
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="mb-4" aria-label={label}>
      <SectionLabel>{label}</SectionLabel>
      <ul className="overflow-hidden rounded-[4px] border" style={{ borderColor: C.border }}>
        {children}
      </ul>
    </section>
  );
}

function Row({
  row,
  locked,
  onOpen,
  awaiting,
  hollow,
  recorded,
  receipt,
  severity,
}: {
  row: ControlRow;
  severity?: string;
  locked: boolean;
  onOpen: (r: ControlRow) => void;
  awaiting?: boolean;
  hollow?: boolean;
  recorded?: boolean;
  receipt?: FindingCard["receipt"];
}) {
  const s = row.status;
  const pending = s.kind === "pending_recheck";
  const secondaryFull = s.short ?? s.detail ?? s.label;
  const dot = toneColor(s.tone);
  return (
    <li className="border-b last:border-b-0" style={{ borderColor: C.border }}>
      <motion.button
        layout="position"
        type="button"
        disabled={locked}
        onClick={() => onOpen(row)}
        className="group flex w-full items-start gap-2.5 px-3 py-2.5 text-left transition-colors enabled:hover:bg-[#F4F6FA] disabled:cursor-default"
        data-kind={s.kind}
        data-row={row.control_id}
        aria-label={`${row.control_id} ${row.title}. ${pending ? "Re-check pending" : s.label}`}
      >
        <span className="mt-[5px] flex-none" aria-hidden>
          {recorded ? (
            <CheckIcon size={13} color={toneColor(receipt?.tone ?? s.tone)} />
          ) : (
            <span
              className="block h-[9px] w-[9px] rounded-full"
              style={hollow ? { border: `1.5px solid ${dot}` } : { background: pending ? C.grey : dot, transition: "background-color 300ms" }}
            />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-2">
            <span className="mono flex-none text-[12.5px] font-bold" style={{ color: C.text }}>
              {row.control_id}
            </span>
            <span className="min-w-0 line-clamp-2 text-[13.5px] leading-[1.35]" style={{ color: C.text }} title={row.title}>
              {row.title}
            </span>
          </span>
          <span className="mt-0.5 flex items-center gap-2">
            {!pending ? <RowChip row={row} severity={severity} /> : null}
            {pending ? (
              <span className="min-w-0 text-[12.5px]" style={{ color: C.secondary }}>
                {s.struck ? <s className="mr-1.5">{s.struck}</s> : null}
                {s.label}
              </span>
            ) : recorded ? (
              <span className="min-w-0 truncate text-[12.5px]" style={{ color: C.text }} title={receipt?.line1 ?? s.short ?? s.label}>
                {receipt?.line1 ?? s.short ?? s.label}
              </span>
            ) : (
              <span className="min-w-0 truncate text-[12.5px]" style={{ color: C.secondary }} title={secondaryFull}>
                {clampWords(secondaryFull, 10)}
              </span>
            )}
          </span>
          {awaiting && !recorded ? (
            <span className="mt-0.5 block text-[12px]" style={{ color: C.blue }}>
              Draft awaiting your approval
            </span>
          ) : null}
        </span>
        {!locked ? (
          <span className="mt-[3px] flex-none" style={{ color: C.secondary }}>
            <Chevron size={13} />
          </span>
        ) : null}
      </motion.button>
    </li>
  );
}
