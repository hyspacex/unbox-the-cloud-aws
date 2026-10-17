"use client";

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { ActionResponse, FindingCard } from "@/lib/types";
import { api, peekFinding } from "@/lib/client";
import { ClauseChecklist } from "@/components/finding/Clauses";
import { VersionColumns } from "@/components/finding/Versions";
import { useKeelState } from "@/components/KeelStateProvider";
import { QuotePair } from "./QuotePair";
import { Receipt } from "./Receipt";
import { RecordList } from "./RecordList";
import { InlineReturn } from "./InlineReturn";
import { InlineVerify } from "./InlineVerify";
import { InlineAcknowledge } from "./InlineAcknowledge";
import { C, CheckIcon, Chevron, DUR, EASE_OUT, RowChip, stableSeverity, btnPrimary, btnSecondary, errorText, prose, toneColor } from "./parts";

type Inline = "return" | "verify" | "ack" | null;
type Disclosure = "clauses" | "versions" | "record" | null;

/** "Verified by Priya Natarajan on architecture.md v2 · Oct 8", from the prior verification on the card. */
function reviewLine(card: FindingCard): string | null {
  const p = card.prior_version;
  if (p?.verified_by) {
    return `Verified by ${p.verified_by} on ${p.file.fileName} ${p.file.versionLabel ?? ""}`.trim() + (p.verified_at ? ` · ${prose(p.verified_at)}` : "");
  }
  const pv = card.row.prior_verification;
  if (pv?.actor) return `Verified by ${pv.actor} on ${pv.fileName}` + (pv.verified_at ? ` · ${prose(pv.verified_at)}` : "");
  return null;
}

export function Level2({ controlId }: { controlId: string }) {
  const { pkg, run, replay, afterAction } = useKeelState();
  const [card, setCard] = useState<FindingCard | null>(() => peekFinding(controlId) ?? null);
  const [err, setErr] = useState<string | null>(null);
  const [inline, setInline] = useState<Inline>(null);
  const [disc, setDisc] = useState<Disclosure>(null);
  const [last, setLast] = useState<ActionResponse | null>(null);
  const [recordKey, setRecordKey] = useState(0);
  const [autoOpened, setAutoOpened] = useState(false);
  const locked = Boolean(run?.running) || Boolean(replay);

  const load = useCallback(async () => {
    try {
      const c = await api.finding(controlId);
      setCard(c);
      setErr(null);
      return c;
    } catch (e) {
      setErr(errorText(e));
      return null;
    }
  }, [controlId]);

  // Reload when the package moves (a new snapshot, an action, a Box task response ingested).
  const pkgKey = pkg ? `${pkg.snapshot.snapshot_id}|${pkg.rows.find((r) => r.control_id === controlId)?.status.label ?? ""}` : "";
  useEffect(() => {
    const ctrl = new AbortController();
    api
      .finding(controlId, ctrl.signal)
      .then((c) => {
        setCard(c);
        setErr(null);
      })
      .catch((e) => !ctrl.signal.aborted && setErr(errorText(e)));
    return () => ctrl.abort();
  }, [controlId, pkgKey]);

  // A Box AI draft already waiting for approval opens the Return form on its second step (once).
  if (card?.pending_author_draft && !autoOpened && !card.receipt) {
    setAutoOpened(true);
    setInline("return");
  }

  const onFinal = useCallback(
    async (r: ActionResponse) => {
      setLast(r);
      setInline(null);
      await afterAction();
      await load();
      setRecordKey((k) => k + 1);
    },
    [afterAction, load],
  );
  const onChanged = useCallback(async () => {
    await afterAction();
    await load();
  }, [afterAction, load]);

  if (!card) {
    return (
      <div className="px-5 py-4 text-[13px]" style={{ color: err ? C.red : C.secondary }}>
        {err ? `Could not load ${controlId}: ${err}` : "Loading…"}
      </div>
    );
  }

  const row = card.row;
  const ack = row.status.kind === "acknowledge";
  const review = reviewLine(card);
  const receipt = card.receipt ?? null;
  const { return_to_author: rta, verify } = card.actions;
  const verifyPrimary = verify.enabled;
  const toggle = (k: Inline) => setInline((cur) => (cur === k ? null : k));

  return (
    <div className="px-5 pt-3 pb-6">
      <h2 className="text-[16px] font-bold leading-[1.3]" style={{ color: C.text }}>
        {card.control.title ?? row.title}
      </h2>
      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px]" style={{ color: C.secondary }}>
        <RowChip row={row} severity={stableSeverity(row, card.finding.severity, card.finding.snapshot_id)} />
        {review ? <span>{review}</span> : null}
      </div>

      <div className="mt-4">
        <QuotePair card={card} />
      </div>

      {card.verdict_line ? (
        <p className="mt-3 text-[13.5px] leading-[1.5]" style={{ color: C.text }} data-testid="verdict-line">
          {card.verdict_line}
        </p>
      ) : null}

      <div className="mt-4">
        {receipt ? (
          <Receipt receipt={receipt} />
        ) : last && last.result !== "rejected" ? (
          <div className="flex gap-2 text-[13px]" role="status">
            <span className="mt-[2px]">
              <CheckIcon size={15} color={toneColor(last.row.status.tone)} />
            </span>
            <span style={{ color: C.text }}>
              <span className="font-bold">{last.row.status.label}</span>
              {last.events.length ? <span style={{ color: C.secondary }}> · {last.events.map((e) => e.event_id).join(", ")}</span> : null}
            </span>
          </div>
        ) : ack ? (
          <>
            <button type="button" className={btnPrimary} disabled={locked} aria-expanded={inline === "ack"} onClick={() => toggle("ack")}>
              Acknowledge
            </button>
            <AnimatePresence initial={false}>{inline === "ack" ? <InlineAcknowledge key="ack" card={card} disabled={locked} onFinal={onFinal} /> : null}</AnimatePresence>
          </>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                className={verifyPrimary ? btnSecondary : btnPrimary}
                disabled={locked || !rta.enabled}
                aria-expanded={inline === "return"}
                onClick={() => toggle("return")}
              >
                {card.pending_author_draft ? "Review Box AI draft" : "Return to author"}
              </button>
              <button
                type="button"
                className={verifyPrimary ? btnPrimary : btnSecondary}
                disabled={locked || !verify.enabled}
                aria-expanded={inline === "verify"}
                onClick={() => toggle("verify")}
              >
                Verify
              </button>
            </div>
            {!rta.enabled && rta.reason ? (
              <p className="mt-1.5 text-[12.5px] leading-[1.4]" style={{ color: C.secondary }}>
                {rta.reason}
              </p>
            ) : null}
            {!verify.enabled && verify.reason ? (
              <p className="mt-1.5 text-[12.5px] leading-[1.4]" style={{ color: C.secondary }}>
                {verify.reason}
              </p>
            ) : null}
            <AnimatePresence initial={false} mode="wait">
              {inline === "return" ? <InlineReturn key="return" card={card} disabled={locked} onChanged={onChanged} onFinal={onFinal} /> : null}
              {inline === "verify" ? <InlineVerify key="verify" card={card} disabled={locked} onFinal={onFinal} /> : null}
            </AnimatePresence>
          </>
        )}
      </div>

      <div className="mt-5 flex flex-wrap gap-x-4 gap-y-1 border-t pt-3" style={{ borderColor: C.border }}>
        <DiscButton label="Clauses" open={disc === "clauses"} onClick={() => setDisc(disc === "clauses" ? null : "clauses")} />
        <DiscButton label="Versions" open={disc === "versions"} onClick={() => setDisc(disc === "versions" ? null : "versions")} />
        <DiscButton label="Show the record" open={disc === "record"} onClick={() => setDisc(disc === "record" ? null : "record")} />
      </div>
      <AnimatePresence initial={false} mode="wait">
        {disc ? (
          <motion.div
            key={disc}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: DUR.inline, ease: EASE_OUT }}
            style={{ overflow: "hidden" }}
          >
            <div className="pt-3">
              {disc === "clauses" ? (
                <div className="kp-compact-clauses">
                  <ClauseChecklist clauses={card.finding.clause_support} />
                </div>
              ) : disc === "versions" ? (
                <div className="kp-one-col">
                  <VersionColumns prior={card.prior_version} next={card.new_version} oldLocation={card.old_location} />
                </div>
              ) : (
                <RecordList controlId={controlId} refreshKey={recordKey} />
              )}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function DiscButton({ label, open, onClick }: { label: string; open: boolean; onClick: () => void }) {
  return (
    <button type="button" className="inline-flex items-center gap-1 text-[13px] font-bold hover:underline" style={{ color: C.boxBlue }} aria-expanded={open} onClick={onClick}>
      {label}
      <Chevron dir={open ? "up" : "down"} size={12} />
    </button>
  );
}
