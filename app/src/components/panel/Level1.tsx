"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { ControlRow, DashboardTile, FindingCard, PackageView } from "@/lib/types";
import { api, peekFinding } from "@/lib/client";
import { orderByAttention, orderById } from "@/lib/ui/order";
import { useKeelState } from "@/components/KeelStateProvider";
import { cardKeyOf } from "./Level2";
import { Tiles, RuleChip } from "./RuleChip";
import { Timeline } from "./Timeline";
import { C, CheckIcon, Chevron, DUR, EASE_OUT, SectionLabel, isDecisionKind, isRecordedRow, toneColor } from "./parts";

/** First-seen attention order per snapshot, kept for the session so recorded rows do not jump. */
const SEEN_ORDER = new Map<string, string[]>();

type CardInfo = { receipt?: FindingCard["receipt"]; severity?: string; state: string };
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
        if (cached && cardKeyOf(cached.finding.snapshot_id, cached.row) === cardKeyOf(pkg.snapshot.snapshot_id, r))
          return [r.control_id, { receipt: cached.receipt, severity: cached.finding.severity, state: cardKeyOf(pkg.snapshot.snapshot_id, r) }] as const;
        try {
          const c = await api.finding(r.control_id);
          return [r.control_id, { receipt: c.receipt, severity: c.finding.severity, state: cardKeyOf(pkg.snapshot.snapshot_id, c.row) }] as const;
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
  if (skip || !pkg) return {};
  const fresh: Receipts = {};
  for (const r of pkg.rows) {
    const info = receipts[r.control_id];
    if (!info) continue;
    // Severity is stable across states; a receipt is used only when the card saw this row state.
    fresh[r.control_id] = info.state === cardKeyOf(pkg.snapshot.snapshot_id, r) ? info : { severity: info.severity, state: info.state };
  }
  return fresh;
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
    // Rule 1 while a re-check runs: the engine's pending status (PackageView.pending_status), with the row's
    // prior label struck through. No local rewrite of a status.
    const pendingStatus = pkg?.pending_status;
    const rows = (pkg?.rows ?? []).map((r) =>
      running && pendingStatus && r.status.kind !== "pending_recheck" ? { ...r, status: { ...pendingStatus, struck: r.status.label } } : r,
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
  /** The selected dashboard tile filters the list to its group (Need you also covers Acknowledge); null shows all. */
  const [filter, setFilter] = useState<DashboardTile["key"] | null>(null);

  if (!pkg) {
    return (
      <div className="px-5 py-4 text-[13px]" style={{ color: pkgError ? C.red : C.secondary }}>
        {pkgError ? `Keel is not reachable: ${pkgError}` : "Loading the package…"}
      </div>
    );
  }

  // v4.1 header (design 51): the engine's tiles, changed_line and package timeline. header_line is shown only while
  // a re-check runs, so the presenter sees that rows are pending.
  const line1 = pkg.changed_line ?? `snapshot ${pkg.snapshot.snapshot_id}`;
  const tiles = pkg.dashboard?.tiles ?? [];
  // A filter whose tile dropped to 0 (the last decision was recorded) clears itself.
  const activeFilter = filter && (tiles.find((t) => t.key === filter)?.value ?? 0) > 0 ? filter : null;
  if (activeFilter !== filter) setFilter(null);
  // A re-check or replay shows every row; the tiles are not selectable then.
  const view = locked ? null : activeFilter;
  const shown = (key: DashboardTile["key"]) => view === null || view === key;
  const showHolds = view === "hold" || (holdsOpen ?? onlyHolds);
  const holdTile = tiles.find((t) => t.key === "hold");
  // "5 hold": the engine's hold tile, value and label, as the fold title; holds_line when there are no tiles.
  // Baseline (lane E): holds_line is absent and the hold list shows expanded with no fold title. After a run the
  // fold title is the engine's hold tile ("5 hold"), or holds_line when there are no tiles.
  const holdText = !pkg.holds_line ? null : holdTile ? `${holdTile.value} ${holdTile.label.toLowerCase()}` : pkg.holds_line;

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
      <header className="mb-4 space-y-3">
        {tiles.length ? <Tiles tiles={tiles} selected={view} onSelect={locked ? undefined : setFilter} /> : null}
        <div>
          <div className="text-[13.5px] font-bold" style={{ color: C.text }}>
            {line1}
          </div>
          {running && pkg.header_line ? (
            <div className="text-[12.5px]" style={{ color: C.secondary }}>
              {pkg.header_line}
            </div>
          ) : null}
        </div>
        {pkg.timeline?.length ? <Timeline points={pkg.timeline} label="Package history, one point per snapshot" /> : null}
      </header>

      {groups.pending.length && view === null ? (
        <Section label="Re-check pending">
          {groups.pending.map((r) => (
            <Row key={r.control_id} row={r} locked onOpen={open} />
          ))}
        </Section>
      ) : null}
      {groups.decide.length && shown("need_you") ? (
        <Section label="Need you">
          {groups.decide.map((r) => (
            <Row key={r.control_id} row={r} locked={locked} onOpen={open} awaiting={awaiting.has(r.control_id)} />
          ))}
        </Section>
      ) : null}
      {groups.ack.length && shown("need_you") ? (
        <Section label="Acknowledge">
          {groups.ack.map((r) => (
            <Row key={r.control_id} row={r} locked={locked} onOpen={open} hollow />
          ))}
        </Section>
      ) : null}
      {groups.recorded.length && shown("recorded") ? (
        <Section label="Recorded">
          {groups.recorded.map((r) => (
            <Row key={r.control_id} row={r} locked={locked} onOpen={open} receipt={receipts[r.control_id]?.receipt} recorded />
          ))}
        </Section>
      ) : null}

      {groups.holds.length && shown("hold") ? (
        <section className="mt-1" aria-label="Verifications that hold">
          {holdText ? (
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
          ) : null}
          <AnimatePresence initial={false}>
            {showHolds || !holdText ? (
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
                  <Row key={r.control_id} row={r} locked={locked} onOpen={open} />
                ))}
              </motion.ul>
            ) : null}
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

/** The row's status word: the engine label's text before the colon ("Needs review", "Acknowledge", "Verified, holds"). */
function statusWord(row: ControlRow): string {
  return row.status.label.split(":")[0].trim();
}

function Row({
  row,
  locked,
  onOpen,
  awaiting,
  hollow,
  recorded,
  receipt,
}: {
  row: ControlRow;
  locked: boolean;
  onOpen: (r: ControlRow) => void;
  awaiting?: boolean;
  hollow?: boolean;
  recorded?: boolean;
  receipt?: FindingCard["receipt"];
}) {
  const s = row.status;
  const pending = s.kind === "pending_recheck";
  const dot = toneColor(s.tone);
  const name = row.rule_name ?? row.title;
  // Recorded rows keep their receipt's first line (design decision 4); others show the status word.
  const word = recorded ? receipt?.line1 ?? statusWord(row) : statusWord(row);
  return (
    <li className="border-b last:border-b-0" style={{ borderColor: C.border }}>
      <motion.button
        layout="position"
        type="button"
        disabled={locked}
        onClick={() => onOpen(row)}
        className="group flex w-full items-start gap-2.5 px-3 py-2 text-left transition-colors enabled:hover:bg-[#F4F6FA] disabled:cursor-default"
        data-kind={s.kind}
        data-row={row.control_id}
        aria-label={`${row.control_id} ${row.title}. ${s.label}`}
        title={`${row.control_id} · ${row.title}`}
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
          <span className="block truncate text-[13.5px] font-bold" style={{ color: C.text }}>
            {name}
          </span>
          <span className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[12px]" style={{ color: C.secondary }}>
            {pending ? (
              <span className="min-w-0 truncate">
                {s.struck ? <s className="mr-1.5">{s.struck}</s> : null}
                {s.label}
              </span>
            ) : (
              <>
                <span className="flex-none whitespace-nowrap" style={{ color: recorded ? C.text : C.secondary }}>
                  {word}
                </span>
                {/* The chip's border separates it; no "·", so a wrapped chip never starts a line with a dot. */}
                {row.rule_source ? <RuleChip rs={row.rule_source} /> : null}
              </>
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
