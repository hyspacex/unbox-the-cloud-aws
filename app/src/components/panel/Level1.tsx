"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from "motion/react";
import type { ControlRow, DashboardTile, FindingCard, PackageStandards, PackageView, TimelinePoint } from "@/lib/types";
import { api, peekFinding } from "@/lib/client";
import { orderByAttention, orderById } from "@/lib/ui/order";
import { useKeelState } from "@/components/KeelStateProvider";
import { cardKeyOf } from "./Level2";
import { Count, Tiles, RuleChip } from "./RuleChip";
import { Timeline } from "./Timeline";
import { StatusCard } from "@/components/box/StatusCard";
import { C, CheckIcon, Chevron, DUR, EASE_OUT, SectionLabel, isDecisionKind, isRecordedRow, prose, toneColor } from "./parts";

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

/**
 * The package overview. In the panel it is level 1; on the folder page (variant "page") it is the project's welcome
 * screen, with the standards header on top, and a row click opens the control in the side panel.
 */
export function Level1({ variant = "panel" }: { variant?: "panel" | "page" }) {
  const { pkg, pkgError, run, replay, endReplay, pushView, openPanel } = useKeelState();
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
  /** A past timeline point the panel is showing (its snapshot id); null shows the current snapshot. */
  const [asOfId, setAsOfId] = useState<string | null>(null);

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
  const asOf: TimelinePoint | null = (!locked && asOfId && pkg.timeline?.find((p) => p.snapshot_id === asOfId && !p.current && p.as_of)) || null;
  if (asOfId && !asOf) setAsOfId(null);
  const tiles = asOf ? asOf.as_of!.tiles : (pkg.dashboard?.tiles ?? []);
  // A filter whose tile dropped to 0 (the last decision was recorded) clears itself.
  const activeFilter = filter && (tiles.find((t) => t.key === filter)?.value ?? 0) > 0 ? filter : null;
  if (activeFilter !== filter) setFilter(null);
  // A re-check or replay shows every row; the tiles are not selectable then.
  const view = locked || asOf ? null : activeFilter;
  const shown = (key: DashboardTile["key"]) => view === null || view === key;
  const showHolds = view === "hold" || (holdsOpen ?? (onlyHolds || variant === "page"));
  const holdTile = tiles.find((t) => t.key === "hold");
  // "5 hold": the engine's hold tile, value and label, as the fold title; holds_line when there are no tiles.
  // Baseline (lane E): holds_line is absent and the hold list shows expanded with no fold title. After a run the
  // fold title is the engine's hold tile ("5 hold"), or holds_line when there are no tiles.
  const holdText = !pkg.holds_line ? null : holdTile ? `${holdTile.value} ${holdTile.label.toLowerCase()}` : pkg.holds_line;

  const open = (r: ControlRow) => {
    if (locked) return;
    if (variant === "page") openPanel({ kind: "control", controlId: r.control_id });
    else pushView({ kind: "control", controlId: r.control_id });
  };

  // ArrowUp / ArrowDown move between rows (roving, like the menu); Enter opens.
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    const items = Array.from(e.currentTarget.querySelectorAll<HTMLElement>("button[data-row]:not([disabled])"));
    const i = items.indexOf(document.activeElement as HTMLElement);
    if (i < 0 || !items.length) return;
    e.preventDefault();
    items[(i + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
  };

  const page = variant === "page";

  const replayBanner = replay ? (
    <div className="mb-3 flex items-center justify-between gap-2 rounded-[4px] border px-3 py-2 text-[12.5px]" style={{ borderColor: C.border, background: C.greyBg, color: C.text }}>
      <span>
        <span className="font-bold">Replay</span> of {replay.runId}. Nothing is re-evaluated.
      </span>
      <button type="button" className="font-bold hover:underline" style={{ color: C.boxBlue }} onClick={endReplay}>
        End replay
      </button>
    </div>
  ) : null;

  const changed = (
    <div hidden={Boolean(asOf)}>
      <div className={`${page ? "text-[14px]" : "text-[13.5px]"} font-bold`} style={{ color: C.text }}>
        {line1}
      </div>
      {running && pkg.header_line ? (
        <div className="text-[12.5px]" style={{ color: C.secondary }}>
          {pkg.header_line}
        </div>
      ) : null}
    </div>
  );

  const tilesEl = tiles.length ? <Tiles tiles={tiles} selected={view} onSelect={locked || asOf ? undefined : setFilter} size={page ? "hero" : "compact"} /> : null;
  const timelineEl = pkg.timeline?.length ? (
    <Timeline
      points={pkg.timeline}
      label="Package history, one point per snapshot"
      selected={asOf?.snapshot_id ?? null}
      onSelect={locked ? undefined : setAsOfId}
      size={page ? "hero" : "compact"}
    />
  ) : null;

  const lists = (
    <div className={page ? "grid gap-x-6 min-[900px]:grid-cols-2" : ""}>
      <div>
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
      </div>
      <div>
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
    </div>
  );

  // Now and a past point cross-fade; the body slides a little in the direction of travel on the timeline.
  const body = (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={asOf?.snapshot_id ?? "now"}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -6 }}
        transition={{ duration: 0.2, ease: EASE_OUT }}
      >
        {asOf ? <AsOf point={asOf} onBack={() => setAsOfId(null)} showCard={!page} /> : lists}
      </motion.div>
    </AnimatePresence>
  );

  if (page) {
    // The welcome board: the three tile counts head three columns, so a metric and its rows are one thing.
    const tileOf = (k: DashboardTile["key"]) => tiles.find((t) => t.key === k);
    const fly = (r: ControlRow) => `board-${r.control_id}`;
    const nowCols: { key: DashboardTile["key"]; rows: React.ReactNode[] }[] = [
      {
        key: "need_you",
        rows: [
          ...groups.decide.map((r) => <Row key={r.control_id} flyId={fly(r)} row={r} locked={locked} onOpen={open} awaiting={awaiting.has(r.control_id)} />),
          ...groups.ack.map((r) => <Row key={r.control_id} flyId={fly(r)} row={r} locked={locked} onOpen={open} hollow />),
        ],
      },
      { key: "recorded", rows: groups.recorded.map((r) => <Row key={r.control_id} flyId={fly(r)} row={r} locked={locked} onOpen={open} receipt={receipts[r.control_id]?.receipt} recorded />) },
      { key: "hold", rows: groups.holds.map((r) => <Row key={r.control_id} flyId={fly(r)} row={r} locked={locked} onOpen={open} />) },
    ];
    const pastCols = asOf
      ? (["need_you", "recorded", "hold"] as const).map((key) => ({ key, rows: asOf.as_of!.controls.filter((c) => c.group === key).map((c) => <PastRow key={c.control_id} c={c} />) }))
      : [];
    const cols = asOf ? pastCols : nowCols;
    return (
      <div onKeyDown={onKeyDown} data-testid="welcome">
        {replayBanner}
        <ProjectTitle header={pkg.header} />
        {pkg.standards ? <StandardsHero standards={pkg.standards} /> : null}
        <div className="mt-6 rounded-[8px] border px-6 pb-4 pt-4" style={{ borderColor: C.border }}>
          <div className="mb-4 flex min-h-[20px] items-center justify-between gap-3">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div key={asOf?.snapshot_id ?? "now"} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.18 }}>
                {asOf ? (
                  <span className="text-[14px] font-bold" style={{ color: C.text }}>
                    Status on {prose(asOf.at)}
                  </span>
                ) : (
                  changed
                )}
              </motion.div>
            </AnimatePresence>
            {asOf ? (
              <button type="button" onClick={() => setAsOfId(null)} className="text-[12.5px] font-bold hover:underline" style={{ color: C.boxBlue }} data-testid="as-of-back">
                Back to now
              </button>
            ) : null}
          </div>
          {timelineEl}
        </div>
        {groups.pending.length && !asOf ? (
          <div className="mt-6">
            <Section label="Re-check pending">
              {groups.pending.map((r) => (
                <Row key={r.control_id} row={r} locked onOpen={open} />
              ))}
            </Section>
          </div>
        ) : null}
        <LayoutGroup>
          <div className="mt-6 grid gap-5 min-[900px]:grid-cols-3" data-testid="board">
            {cols.map((col) => {
              const t = tileOf(col.key);
              return <Column key={col.key} tile={t} fallback={col.key} past={Boolean(asOf)} items={col.rows} />;
            })}
          </div>
        </LayoutGroup>
      </div>
    );
  }

  return (
    <div className="px-5 pt-3 pb-6" onKeyDown={onKeyDown}>
      {replayBanner}
      <header className="mb-4 space-y-3">
        {tilesEl}
        {changed}
        {timelineEl}
      </header>
      {body}
    </div>
  );
}

const COLUMN_TONE: Record<DashboardTile["tone"], string> = { teal: C.teal, amber: C.amber, blue: C.blue, grey: C.grey };
const COLUMN_NAME: Record<DashboardTile["key"], string> = { need_you: "Need you", recorded: "Recorded", hold: "Hold" };

/** One welcome-board column: the tile's count and label as the header, a tone rule, then its rows. */
function Column({ tile, fallback, past, items }: { tile?: DashboardTile; fallback: DashboardTile["key"]; past: boolean; items: React.ReactNode[] }) {
  const tone = COLUMN_TONE[tile?.tone ?? "grey"] ?? C.grey;
  return (
    <section aria-label={tile?.label ?? COLUMN_NAME[fallback]} data-column={fallback} className="min-w-0">
      <header className="flex items-baseline gap-2 border-b-[3px] pb-2" style={{ borderColor: tone, transition: "border-color 300ms" }}>
        <span className="text-[30px] font-bold leading-none tabular-nums" style={{ color: tone, transition: "color 300ms" }}>
          <Count value={tile?.value ?? 0} />
        </span>
        <span className="text-[14px] font-bold" style={{ color: tone, transition: "color 300ms" }}>
          {tile?.label ?? COLUMN_NAME[fallback]}
        </span>
      </header>
      {items.length ? (
        <ul className="mt-3 overflow-hidden rounded-[4px] border" style={{ borderColor: C.border }}>
          {items}
        </ul>
      ) : (
        <p className="mt-3 rounded-[4px] border border-dashed px-3 py-4 text-center text-[12.5px]" style={{ borderColor: C.border, color: C.secondary }}>
          {past ? "None on this date" : "None"}
        </p>
      )}
    </section>
  );
}

/** A control's status on a past snapshot, read-only. */
function PastRow({ c }: { c: NonNullable<TimelinePoint["as_of"]>["controls"][number] }) {
  return (
    <motion.li initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-start gap-2.5 border-b px-3 py-2 last:border-b-0" style={{ borderColor: C.border }} title={c.control_id}>
      <span className="mt-[5px] block h-[9px] w-[9px] flex-none rounded-full" style={{ background: toneColor(c.tone) }} aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13.5px] font-bold" style={{ color: C.text }}>
          {c.name}
        </span>
        <span className="mt-0.5 block text-[12px]" style={{ color: C.secondary }}>
          {c.word}
        </span>
      </span>
    </motion.li>
  );
}

/** The welcome screen's title: the project and its application facts, from the folder header. */
function ProjectTitle({ header: h }: { header: PackageView["header"] }) {
  const facts = [h.application_id, h.application_tier, h.regulatory_scope].filter(Boolean);
  if (!h.project) return null;
  return (
    <motion.div className="mb-5" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: EASE_OUT }}>
      <h2 className="text-[22px] font-bold leading-tight" style={{ color: C.text }}>
        {h.project}
      </h2>
      {facts.length ? (
        <p className="mt-1 text-[13px]" style={{ color: C.secondary }}>
          {facts.join(" · ")}
        </p>
      ) : null}
    </motion.div>
  );
}

/** The welcome screen's "Checked against" header: framework badges with control counts, the mapping caveat, the profile. */
function StandardsHero({ standards: s }: { standards: PackageStandards }) {
  const reduce = useReducedMotion();
  return (
    <section aria-label="Checked against" data-testid="standards">
      <SectionLabel>Checked against</SectionLabel>
      <ul className="mt-1 flex flex-wrap gap-2">
        {s.frameworks.map((f, i) => (
          <motion.li
            key={f.key}
            initial={{ opacity: reduce ? 1 : 0, y: reduce ? 0 : 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: reduce ? 0 : 0.3, delay: reduce ? 0 : 0.05 * i, ease: EASE_OUT }}
            className="flex min-w-[132px] flex-col rounded-[8px] border px-3.5 py-2.5"
            style={{ borderColor: "#D6E6FB", background: "linear-gradient(180deg,#F5F9FF,#FFFFFF)" }}
            title={`${f.label}: ${f.controls} controls, ${f.clauses} mapped clauses`}
          >
            <span className="text-[15px] font-bold leading-tight" style={{ color: C.boxBlue }}>
              {f.label}
            </span>
            <span className="mt-0.5 text-[12px]" style={{ color: C.secondary }}>
              {f.controls} controls · {f.clauses} clauses
            </span>
          </motion.li>
        ))}
      </ul>
      <p className="mt-2 text-[12.5px]" style={{ color: C.secondary }}>
        <span style={{ color: C.text }}>{s.profile_line}</span> · {s.bank_line}
        {s.mapping_note ? <span className="block text-[12px] italic">{s.mapping_note}</span> : null}
      </p>
    </section>
  );
}

/** A past timeline point: the status card and each control's status as they stood then. Read-only. */
function AsOf({ point, onBack, showCard = true }: { point: TimelinePoint; onBack: () => void; showCard?: boolean }) {
  const s = point.as_of!;
  return (
    <section aria-label={`Status on ${prose(point.at)}`} data-testid="as-of">
      <div className="mb-2 flex items-center justify-between gap-2">
        <SectionLabel>Status on {prose(point.at)}</SectionLabel>
        <button type="button" onClick={onBack} className="text-[12.5px] font-bold hover:underline" style={{ color: C.boxBlue }} data-testid="as-of-back">
          Back to now
        </button>
      </div>
      {showCard ? <StatusCard card={s.status_card} /> : null}
      <ul className="overflow-hidden rounded-[4px] border" style={{ borderColor: C.border }}>
        {s.controls.map((c) => (
          <li key={c.control_id} className="flex items-start gap-2.5 border-b px-3 py-2 last:border-b-0" style={{ borderColor: C.border }} title={c.control_id}>
            <span className="mt-[5px] block h-[9px] w-[9px] flex-none rounded-full" style={{ background: toneColor(c.tone) }} aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13.5px] font-bold" style={{ color: C.text }}>
                {c.name}
              </span>
              <span className="mt-0.5 block text-[12px]" style={{ color: C.secondary }}>
                {c.word}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </section>
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
  flyId,
}: {
  row: ControlRow;
  locked: boolean;
  onOpen: (r: ControlRow) => void;
  awaiting?: boolean;
  hollow?: boolean;
  recorded?: boolean;
  receipt?: FindingCard["receipt"];
  /** Welcome board: a shared layout id, so a row flies between columns when its bucket changes. */
  flyId?: string;
}) {
  const s = row.status;
  const pending = s.kind === "pending_recheck";
  const dot = toneColor(s.tone);
  const name = row.rule_name ?? row.title;
  // Recorded rows keep their receipt's first line (design decision 4); others show the status word.
  const word = recorded ? receipt?.line1 ?? statusWord(row) : statusWord(row);
  return (
    <motion.li layoutId={flyId} layout={flyId ? true : undefined} transition={{ type: "spring", stiffness: 320, damping: 32 }} className="border-b bg-white last:border-b-0" style={{ borderColor: C.border }}>
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
    </motion.li>
  );
}
