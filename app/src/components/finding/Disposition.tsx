"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { ActionResponse, FindingCard, RunMode } from "@/lib/types";
import { api, ApiError, type DraftAuthorMessage } from "@/lib/client";
import { Modal } from "@/components/ui/Modal";
import { fromLocalInput, listJoin, toLocalInput, utc, utcDate, utcInText } from "@/lib/ui/format";
import { compactSecondary } from "@/lib/ui/secondary";
import { clauseNoun } from "@/lib/engine/display";
import { T_BASE } from "@/lib/ui/motion";
import { authorTaskFromThread } from "./Thread";
import { useKeel } from "@/components/AppProvider";

const PROPOSED_LABELS: Record<string, string> = {
  not_applicable: "Not applicable",
  compensating_control: "Compensating control",
  exception_requested: "Request exception",
  false_positive: "Mark false positive",
};

export function DispositionBlock({
  card,
  mode,
  onResult,
  lastResult,
  onSeeThread,
}: {
  card: FindingCard;
  mode?: RunMode;
  onResult: (r: ActionResponse) => void;
  lastResult?: ActionResponse | null;
  onSeeThread?: () => void;
}) {
  const [rta, setRta] = useState(false);
  const [verify, setVerify] = useState(false);
  const [opens, setOpens] = useState(0);
  const { actions, reviewer } = card;
  const isMock = mode === "mock" || /simulated|fixture/i.test(reviewer.source);
  const row = lastResult?.row ?? card.row;
  const returned = row.current_disposition === "returned_to_author" || row.status.kind === "returned_to_author";
  const returnedDue = lastResult?.author_task?.due_at ?? authorTaskFromThread(card.thread)?.task.due_at ?? compactSecondary(row.status.secondary)?.rest.find((p) => p.startsWith("due "))?.slice(4);
  const verifyFirst = row.status.kind === "needs_review_binding" || row.status.kind === "acknowledge";

  // A6: the clause reason always comes first; task or row state is a second, muted line.
  const uns = card.finding.clause_support.filter((c) => c.support === "unsupported").map((c) => clauseNoun(c.clause));
  const engineReason = actions.verify.reason?.replace(/^verify is disabled[:.,]?\s*/i, "").replace(/^./, (c) => c.toUpperCase());
  const clauseReason = engineReason && /^no document/i.test(engineReason)
    ? engineReason
    : uns.length
      ? `No document in this package supports the ${listJoin(uns)} clause${uns.length === 1 ? "" : "s"}.`
      : card.finding.machine_assessment === "evidence_contradicted"
        ? "A conflicting statement in this snapshot must be resolved by a new snapshot first."
        : null;
  const stateReason = engineReason && engineReason !== clauseReason ? engineReason : null;

  const openRta = () => {
    setOpens((n) => n + 1);
    setRta(true);
  };
  const openVerify = () => {
    setOpens((n) => n + 1);
    setVerify(true);
  };

  const returnButton = returned ? (
    <div className="flex items-center gap-2 rounded-lg border border-blue-line bg-blue-bg/50 px-3 py-2 text-[13px] text-blue-ink">
      <ArrowIcon />
      <span>
        Returned{returnedDue ? <>, due <span className="tabular-nums">{utcDate(returnedDue)}</span></> : null}
      </span>
    </div>
  ) : (
    <div>
      <button
        className={`btn w-full justify-between ${verifyFirst ? "btn-secondary" : "btn-human"}`}
        disabled={!actions.return_to_author.enabled}
        onClick={openRta}
      >
        <span>Return to author</span>
        <ArrowIcon />
      </button>
      {!actions.return_to_author.enabled && actions.return_to_author.reason ? (
        <p className="mt-1 text-[12px] text-muted">{actions.return_to_author.reason}</p>
      ) : null}
    </div>
  );
  const verifyButton = (
    <div>
      <button
        className={`btn w-full justify-between ${actions.verify.enabled && (verifyFirst || !actions.return_to_author.enabled) ? "btn-human" : "btn-secondary"}`}
        disabled={!actions.verify.enabled}
        onClick={openVerify}
      >
        <span>Verify</span>
        <CheckIcon />
      </button>
      {!actions.verify.enabled && (clauseReason || stateReason) ? (
        <div className="mt-1.5 text-[12.5px] leading-[1.45]">
          <p className="text-ink-2">
            <span className="font-medium">Verify is disabled.</span> {clauseReason ?? stateReason}
          </p>
          {clauseReason && stateReason ? <p className="mt-0.5 text-[12px] text-muted">{stateReason}</p> : null}
        </div>
      ) : null}
    </div>
  );

  return (
    <section aria-label="Human disposition" className="rounded-[12px] border border-blue-line bg-panel overflow-hidden">
      <div className="px-4 pt-3.5 pb-3 bg-blue-bg/70 border-b border-blue-line">
        <div className="eyebrow !text-blue-ink">Human disposition</div>
        <p className="mt-1 text-[13.5px] text-ink-2 leading-snug">
          Reviewer: <span className="font-semibold text-blue-ink">{reviewer.name}</span>, {reviewer.role}
        </p>
        <p className="mt-0.5 text-[12px] text-muted" title={`${reviewer.source}${reviewer.box_user_id ? ` · Box user ${reviewer.box_user_id}` : ""}`}>
          {isMock ? "Identity from the Box task · simulated in mock" : "Identity from the Box task"}
        </p>
      </div>

      <div className="px-4 py-3.5 space-y-3">
        <div className={`flex items-start gap-2 text-[12.5px] ${card.binding_fresh ? "text-ink-2" : "text-amber-ink"}`}>
          <span
            className="mt-[5px] h-1.5 w-1.5 flex-none rounded-full"
            style={{ background: card.binding_fresh ? "var(--blue-dot)" : "var(--amber-dot)" }}
            aria-hidden
          />
          <span>
            {card.binding_fresh ? (
              <>
                Binding check: this control&apos;s evidence binding is current on snapshot{" "}
                <span className="mono">{card.finding.snapshot_id}</span>.
              </>
            ) : (
              <>A newer snapshot changed this binding since the card was opened. The server re-checks before any action.</>
            )}
          </span>
        </div>

        <div className="space-y-2.5">
          {verifyFirst ? (
            <>
              {verifyButton}
              {returnButton}
            </>
          ) : (
            <>
              {returnButton}
              {verifyButton}
            </>
          )}
        </div>

        <p className="text-[12px] text-muted">Every action writes an append-only event bound to this evidence.</p>

        <AnimatePresence initial={false}>
          {lastResult ? (
            <motion.div key={lastResult.events.map((e) => e.event_id).join()} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} transition={T_BASE} style={{ overflow: "hidden" }}>
              <ResultPanel r={lastResult} onSeeThread={onSeeThread} />
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      <div className="px-4 py-3 border-t hairline bg-panel-cool">
        <div className="flex items-baseline justify-between">
          <span className="text-[12px] font-medium text-faint">Proposed actions</span>
          <span className="text-[11.5px] text-faint">proposed, no transition</span>
        </div>
        <ul className="mt-1.5 flex flex-wrap gap-1.5" aria-label="Proposed actions, not built">
          {actions.proposed.map((p) => (
            <li
              key={p}
              className="inline-flex h-[26px] items-center rounded-md border border-dashed border-line-strong px-2 text-[12px] text-faint select-none"
            >
              {PROPOSED_LABELS[p] ?? p}
            </li>
          ))}
        </ul>
      </div>

      <ReturnToAuthorModal key={`rta-${opens}`} open={rta} onClose={() => setRta(false)} card={card} onResult={onResult} />
      <VerifyModal key={`verify-${opens}`} open={verify} onClose={() => setVerify(false)} card={card} onResult={onResult} />
    </section>
  );
}

function ResultPanel({ r, onSeeThread }: { r: ActionResponse; onSeeThread?: () => void }) {
  const tone =
    r.result === "rejected"
      ? "border-amber-line bg-amber-bg text-amber-ink"
      : "border-blue-line bg-blue-bg/60 text-blue-ink";
  const title =
    r.result === "applied" ? "Recorded" : r.result === "reapplied" ? "Re-applied on the newer snapshot" : "Rejected, nothing recorded as a disposition";
  const t = r.author_task;
  const firstLine = t?.message ? t.message.split(/(?<=[.!?])\s+/)[0] : "";
  return (
    <div className={`rounded-lg border px-3 py-2.5 text-[12.5px] ${tone}`} role="status">
      <div className="font-semibold">{title}</div>
      {r.explanation ? <p className="mt-0.5 text-ink-2">{utcInText(r.explanation)}</p> : null}
      {t ? (
        <div className="mt-2 rounded-md border border-blue-line bg-panel px-2.5 py-2 text-ink-2">
          <div className="flex flex-wrap items-baseline justify-between gap-x-2">
            <span className="font-medium text-blue-ink">Author task in Box</span>
            <span className="mono text-[11.5px]">{t.task_id}</span>
          </div>
          <div className="mt-0.5">
            <span className="text-blue-ink">{t.assignee}</span>
            {t.due_at ? <> · due <span className="tabular-nums">{utc(t.due_at)}</span></> : null}
          </div>
          {firstLine ? <p className="mt-1 text-[12px] leading-[1.45] line-clamp-2">{firstLine}</p> : null}
          {onSeeThread ? (
            <button type="button" className="mt-1 link text-[12px]" onClick={onSeeThread}>
              See it in the thread
            </button>
          ) : null}
        </div>
      ) : null}
      <div className="mt-1.5 text-ink-2">
        Ledger events{" "}
        {r.events.map((e, i) => (
          <span key={e.event_id}>
            {i ? ", " : ""}
            <span className="mono" title={e.event_type}>
              {e.event_id}
            </span>
          </span>
        ))}
      </div>
      <div className="mt-0.5 text-ink-2">
        Now: <span className="font-medium">{r.row.status.label}</span>
      </div>
    </div>
  );
}

function errorText(e: unknown): string {
  if (e instanceof ApiError) {
    const b = e.body as { explanation?: string } | null;
    return b?.explanation ?? e.message;
  }
  return e instanceof Error ? e.message : String(e);
}

function ReturnToAuthorModal({
  open,
  onClose,
  card,
  onResult,
}: {
  open: boolean;
  onClose: () => void;
  card: FindingCard;
  onResult: (r: ActionResponse) => void;
}) {
  const rta = card.actions.return_to_author as FindingCard["actions"]["return_to_author"] & { suggested_reason?: string };
  const [step, setStep] = useState<"reason" | "draft">("reason");
  const [reason, setReason] = useState("");
  const [due, setDue] = useState(toLocalInput(rta.default_due_at));
  const [draft, setDraft] = useState<DraftAuthorMessage | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const unsupported = card.finding.clause_support.filter((c) => c.support === "unsupported");

  const toDraft = async () => {
    setBusy(true);
    setErr(null);
    try {
      const d = await api.draftAuthorMessage(card.finding.finding_id, reason.trim());
      setDraft(d);
      setMessage(d.text);
      setStep("draft");
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    setBusy(true);
    setErr(null);
    try {
      const r = await api.action({
        finding_id: card.finding.finding_id,
        control_id: card.finding.control_id,
        decision_snapshot_id: card.finding.snapshot_id,
        action: "return_to_author",
        reason: reason.trim(),
        due_at: fromLocalInput(due) || rta.default_due_at,
        author_message: message,
      });
      onResult(r);
      onClose();
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const { config } = useKeel();
  const mode = config?.mode;
  const draftedByBoxAi = draft && /box_ai|box ai/i.test(String(draft.drafted_by));

  return (
    <Modal
      open={open}
      onClose={onClose}
      eyebrow={`Box task response · ${card.finding.finding_id} · ${card.finding.control_id}`}
      title={step === "reason" ? "Return to author" : "Author task message"}
      width={640}
      footer={
        <div className="flex items-center justify-between gap-3">
          <span className="text-[12px] text-muted">
            {step === "reason" ? "Step 1 of 2. Stands in for rejecting the review task in Box." : "Step 2 of 2. Recorded only after the author task exists in Box."}
          </span>
          <div className="flex gap-2">
            {step === "draft" ? (
              <button className="btn btn-secondary" onClick={() => setStep("reason")} disabled={busy}>
                Back
              </button>
            ) : (
              <button className="btn btn-ghost" onClick={onClose} disabled={busy}>
                Cancel
              </button>
            )}
            {step === "reason" ? (
              <button className="btn btn-human" onClick={toDraft} disabled={busy || reason.trim().length === 0}>
                {busy ? "Drafting" : "Draft author task"}
              </button>
            ) : (
              <button className="btn btn-human" onClick={confirm} disabled={busy || message.trim().length === 0}>
                {busy ? "Recording" : "Confirm and return to author"}
              </button>
            )}
          </div>
        </div>
      }
    >
      <AnimatePresence mode="wait" initial={false}>
        {step === "reason" ? (
          <motion.div key="reason" initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }} transition={T_BASE} className="space-y-4">
            {unsupported.length ? (
              <div>
                <div className="eyebrow mb-1">Unsupported clauses that will be quoted to the author</div>
                <ul className="text-[13px] text-ink-2 list-disc pl-5 space-y-0.5">
                  {unsupported.map((c) => (
                    <li key={c.clause_id}>
                      {c.clause} <span className="mono text-[11.5px] text-faint">{c.clause_id}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <label className="block">
              <span className="text-[13px] font-medium text-ink">Reason</span>
              <span className="ml-2 text-[12px] text-muted">your words, recorded as the task response message</span>
              <textarea
                className="mt-1.5 w-full rounded-lg border border-line-strong bg-white px-3 py-2 text-[14px] leading-[1.5] text-ink focus:border-[var(--blue-dot)] focus:outline-none"
                rows={4}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="What is missing, and what the author must restore."
                autoFocus
              />
            </label>
            {rta.suggested_reason ? (
              <button
                type="button"
                className="inline-flex items-center gap-1.5 rounded-full border border-line-strong bg-panel px-3 py-1 text-[12px] text-ink-2 hover:border-ink-2 transition-colors"
                onClick={() => setReason(rta.suggested_reason ?? "")}
                title={rta.suggested_reason}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--grey-dot)]" aria-hidden />
                Use suggested reason (drafted by Keel)
              </button>
            ) : null}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="text-[13px] font-medium text-ink">Author</span>
                <div className="mt-1.5 h-9 flex items-center rounded-lg border hairline bg-panel-cool px-3 text-[14px] text-blue-ink">{rta.author}</div>
              </div>
              <label className="block">
                <span className="text-[13px] font-medium text-ink">Due (UTC)</span>
                <input
                  type="datetime-local"
                  className="mt-1.5 h-9 w-full rounded-lg border border-line-strong bg-white px-3 text-[14px] mono text-ink focus:border-[var(--blue-dot)] focus:outline-none"
                  value={due}
                  onChange={(e) => setDue(e.target.value)}
                />
                <span className="mt-1 block text-[11.5px] text-muted">default {utc(rta.default_due_at)}, profile remediation window</span>
              </label>
            </div>
            {err ? <p className="text-[13px] text-red-ink">{err}</p> : null}
          </motion.div>
        ) : (
          <motion.div key="draft" initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 8 }} transition={T_BASE} className="space-y-3">
            <div className="flex items-center gap-2">
              <span
                className={`inline-flex h-6 items-center rounded-md px-2 text-[12px] font-medium border ${
                  draftedByBoxAi ? "border-[color:var(--src-boxai)] text-[color:var(--src-boxai)]" : "border-line-strong text-muted"
                }`}
              >
                {draftedByBoxAi ? "Drafted by Box AI" : "Template"}
                {mode === "mock" ? " (fixture)" : ""}
              </span>
              <span className="text-[12px] text-muted">Edit before sending. Stored verbatim in the ledger.</span>
            </div>
            <textarea
              className="w-full rounded-lg border border-line-strong bg-white px-3 py-2 text-[14px] leading-[1.55] text-ink focus:border-[var(--blue-dot)] focus:outline-none"
              rows={8}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
            <div className="text-[12.5px] text-muted">
              To <span className="text-blue-ink">{rta.author}</span> · due <span className="mono">{utc(fromLocalInput(due) || rta.default_due_at)}</span> · reason{" "}
              <q className="text-ink-2">{reason}</q>
            </div>
            {err ? <p className="text-[13px] text-red-ink">{err}</p> : null}
          </motion.div>
        )}
      </AnimatePresence>
    </Modal>
  );
}

function VerifyModal({
  open,
  onClose,
  card,
  onResult,
}: {
  open: boolean;
  onClose: () => void;
  card: FindingCard;
  onResult: (r: ActionResponse) => void;
}) {
  const phrase = card.actions.verify.attestation_phrase;
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const allSupported = card.finding.clause_support.every((c) => c.support === "supported");
  const notContradicted = card.finding.machine_assessment !== "evidence_contradicted";
  const hasPhrase = message.includes(phrase);
  const binding = card.row.evidencing;

  const checks: [string, boolean | null][] = [
    [`Every required clause supported by a validated quote (${card.finding.clause_support.filter((c) => c.support === "supported").length} of ${card.finding.clause_support.length})`, allSupported],
    [`Machine assessment is not evidence_contradicted (${card.finding.machine_assessment})`, notContradicted],
    ["Evidence binding is current on this snapshot", card.binding_fresh],
    ["Attestation phrase present in your message", hasPhrase],
    ["Responding identity is a configured reviewer and not the file's author (checked by the server)", null],
  ];

  const confirm = async () => {
    setBusy(true);
    setErr(null);
    try {
      const r = await api.action({
        finding_id: card.finding.finding_id,
        control_id: card.finding.control_id,
        decision_snapshot_id: card.finding.snapshot_id,
        action: "verify",
        message,
      });
      onResult(r);
      onClose();
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      eyebrow={`Box task response · ${card.finding.finding_id} · ${card.finding.control_id}`}
      title="Verify"
      width={600}
      footer={
        <div className="flex items-center justify-between gap-3">
          <span className="text-[12px] text-muted">Stands in for approving the review task in Box.</span>
          <div className="flex gap-2">
            <button className="btn btn-ghost" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button className="btn btn-human" onClick={confirm} disabled={busy || !hasPhrase || !allSupported || !notContradicted}>
              {busy ? "Recording" : "Confirm verification"}
            </button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        {binding ? (
          <p className="text-[13.5px] text-ink-2">
            You are verifying <span className="mono">{card.finding.control_id}</span> on{" "}
            <span className="mono">
              {binding.fileName} {binding.versionLabel ?? binding.versionId}
            </span>
            {binding.section ? <>, {binding.section}</> : null}, snapshot <span className="mono">{card.finding.snapshot_id}</span>.
          </p>
        ) : null}
        <ul className="space-y-1.5">
          {checks.map(([label, ok]) => (
            <li key={label} className="flex items-start gap-2.5 text-[13px]">
              <span
                className={`mt-[3px] inline-flex h-4 w-4 flex-none items-center justify-center rounded-full text-white ${
                  ok === null ? "bg-[var(--grey-dot)]" : ok ? "bg-[var(--blue-dot)]" : "bg-[var(--amber-dot)]"
                }`}
                aria-label={ok === null ? "server check" : ok ? "met" : "not met"}
              >
                <svg width="8" height="8" viewBox="0 0 10 10" aria-hidden>
                  {ok === false ? (
                    <path d="M2 5h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                  ) : (
                    <path d="M2 5.2 4.1 7.3 8 2.8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  )}
                </svg>
              </span>
              <span className={ok === false ? "text-amber-ink" : "text-ink-2"}>{label}</span>
            </li>
          ))}
        </ul>
        <label className="block">
          <span className="text-[13px] font-medium text-ink">Message</span>
          <span className="ml-2 text-[12px] text-muted">must contain the attestation phrase</span>
          <textarea
            className="mt-1.5 w-full rounded-lg border border-line-strong bg-white px-3 py-2 text-[14px] leading-[1.5] text-ink focus:border-[var(--blue-dot)] focus:outline-none"
            rows={3}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Your words. Verification is recorded only if the attestation phrase is present."
          />
        </label>
        <div className="flex flex-wrap items-center gap-2 -mt-2">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={hasPhrase}
            onClick={() => setMessage((m) => (m.trim() ? `${m.trim()} ${phrase}` : phrase))}
          >
            Insert attestation phrase
          </button>
          <span className="text-[11.5px] text-muted">
            <q>{phrase}</q>
          </span>
        </div>
        {err ? <p className="text-[13px] text-red-ink">{err}</p> : null}
      </div>
    </Modal>
  );
}

function ArrowIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
      <path d="M8.5 3 5 7l3.5 4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5.5 7H12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
      <path d="M3 7.4 5.8 10.2 11 4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
