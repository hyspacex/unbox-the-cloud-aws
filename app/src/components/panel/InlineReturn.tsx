"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { ActionResponse, FindingCard } from "@/lib/types";
import { api } from "@/lib/client";
import { ErrorLine, InlineExpand } from "./Inline";
import { C, DUR, EASE_OUT, btnPrimary, btnSmall, errorText, fieldClass, personName, prose } from "./parts";

type PendingDraft = NonNullable<FindingCard["pending_author_draft"]>;
type AwaitingResponse = ActionResponse & { awaiting_draft?: unknown; pending_author_draft?: PendingDraft | null };

/**
 * Inline Return to author (design 2.4). Step 1 records the reviewer's reason as the Box task response, without an
 * author message, so the engine asks Box AI for a draft. Step 2 shows that draft for approval; Returned to author
 * is recorded only when the reviewer approves and the author task exists in Box.
 */
export function InlineReturn({
  card,
  disabled,
  onChanged,
  onFinal,
}: {
  card: FindingCard;
  disabled?: boolean;
  /** Step 1 was recorded: refresh the package and the card, keep this form open. */
  onChanged: () => Promise<void>;
  /** The return is complete (or the API answered with a final result). */
  onFinal: (r: ActionResponse) => Promise<void>;
}) {
  const rta = card.actions.return_to_author;
  const resume = card.pending_author_draft ?? null;
  const [step, setStep] = useState<"reason" | "draft">(resume ? "draft" : "reason");
  const [reason, setReason] = useState("");
  const [draft, setDraft] = useState<{ text: string; drafted_by: string } | null>(
    resume?.draft ? { text: resume.draft, drafted_by: resume.drafted_by ?? "box_ai_text_gen" } : null,
  );
  const [message, setMessage] = useState(resume?.draft ?? "");
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [decisionSnap, setDecisionSnap] = useState(resume?.snapshot_id ?? card.finding.snapshot_id);
  const author = personName(rta.author) || rta.author;
  const byBoxAi = !draft || /box_ai|box ai/i.test(draft.drafted_by);

  const toDraft = async () => {
    setBusy(true);
    setErr(null);
    try {
      const r = (await api.action({
        finding_id: card.finding.finding_id,
        control_id: card.finding.control_id,
        decision_snapshot_id: card.finding.snapshot_id,
        action: "return_to_author",
        reason: reason.trim(),
        due_at: rta.default_due_at,
      })) as AwaitingResponse;
      if (r.result === "rejected") {
        setErr(r.explanation ?? "Rejected. Nothing was recorded as a disposition.");
        return;
      }
      if (!r.awaiting_draft && r.author_task) {
        await onFinal(r);
        return;
      }
      let pd: PendingDraft | null = r.pending_author_draft ?? null;
      if (!pd?.draft) {
        const fresh = await api.finding(card.finding.finding_id);
        pd = fresh.pending_author_draft ?? pd;
      }
      let text = pd?.draft ?? "";
      let by = pd?.drafted_by ?? "box_ai_text_gen";
      if (!text) {
        const d = await api.draftAuthorMessage(card.finding.finding_id, reason.trim());
        text = d.text;
        by = d.drafted_by;
      }
      if (pd?.snapshot_id) setDecisionSnap(pd.snapshot_id);
      setDraft({ text, drafted_by: by });
      setMessage(text);
      setStep("draft");
      await onChanged();
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const approve = async () => {
    setBusy(true);
    setErr(null);
    try {
      const r = await api.action({
        finding_id: card.finding.finding_id,
        control_id: card.finding.control_id,
        decision_snapshot_id: decisionSnap,
        action: "approve_author_draft",
        author_message: message.trim(),
        due_at: rta.default_due_at,
      });
      if (r.result === "rejected") {
        setErr(r.explanation ?? "Rejected. Nothing was recorded as a disposition.");
        return;
      }
      await onFinal(r);
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <InlineExpand label="Return to author">
      <AnimatePresence mode="wait" initial={false}>
        {step === "reason" ? (
          <motion.div key="reason" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.16, ease: EASE_OUT }}>
            <label className="block">
              <span className="block text-[12.5px] leading-[1.4]" style={{ color: C.text }}>
                Your reason. Recorded as the Box task response, in your words.
              </span>
              <textarea
                className={`${fieldClass} mt-1.5 max-h-[110px]`}
                rows={4}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                aria-label="Your reason"
              />
            </label>
            {rta.suggested_reason ? (
              <button
                type="button"
                className="mt-1.5 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] transition-colors hover:bg-[#F4F6FA]"
                style={{ borderColor: "#C9C9C9", color: C.text }}
                onClick={() => setReason(rta.suggested_reason ?? "")}
                title={rta.suggested_reason}
              >
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: C.grey }} aria-hidden />
                Use suggested reason (drafted by Keel)
              </button>
            ) : null}
            <div className="mt-2.5 flex items-center justify-between gap-3">
              <span className="text-[12.5px]" style={{ color: C.secondary }}>
                Due {prose(rta.default_due_at)}
              </span>
              <button type="button" className={btnPrimary} disabled={disabled || busy || !reason.trim()} onClick={toDraft}>
                {busy ? "Box AI is drafting…" : "Return and draft author task"}
              </button>
            </div>
            <ErrorLine text={err} />
          </motion.div>
        ) : (
          <motion.div key="draft" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: DUR.inline, ease: EASE_OUT }}>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[12.5px] font-bold" style={{ color: C.text }}>
                {byBoxAi ? `Box AI drafted this task for ${author}` : `Template task for ${author}`}
              </span>
              <span className="rounded-[4px] border px-1.5 py-0.5 text-[11px]" style={{ borderColor: "#C9C9C9", color: C.secondary }}>
                {byBoxAi ? "Drafted by Box AI" : "Template"}
              </span>
            </div>
            {editing ? (
              <textarea className={`${fieldClass} mt-1.5 max-h-[110px]`} rows={5} value={message} onChange={(e) => setMessage(e.target.value)} aria-label="Author task message" />
            ) : (
              <div className="relative mt-1.5">
                <blockquote className="max-h-[110px] overflow-y-auto border-l-[3px] pl-3 pb-3 text-[13px] leading-[1.5] whitespace-pre-wrap" style={{ borderColor: C.border, color: C.text }}>
                  {message}
                </blockquote>
                {/* A 24 px fade says the draft continues (judge C1); the preview scrolls. */}
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-6" style={{ background: "linear-gradient(to bottom, rgba(250,251,252,0), #FAFBFC)" }} aria-hidden />
              </div>
            )}
            <div className="mt-1.5 flex justify-end">
              <button type="button" className={btnSmall} onClick={() => setEditing((v) => !v)} disabled={busy}>
                {editing ? "Done editing" : "Edit"}
              </button>
            </div>
            <p className="mt-1.5 text-[12px] leading-[1.4]" style={{ color: C.secondary }}>
              Stored verbatim. Returned to author is recorded when the task exists in Box.
            </p>
            <div className="mt-2 flex justify-end">
              <button type="button" className={btnPrimary} disabled={disabled || busy || !message.trim()} onClick={approve}>
                {busy ? "Sending…" : "Approve and send"}
              </button>
            </div>
            <ErrorLine text={err} />
          </motion.div>
        )}
      </AnimatePresence>
    </InlineExpand>
  );
}
