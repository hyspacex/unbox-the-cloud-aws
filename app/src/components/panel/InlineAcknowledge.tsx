"use client";

import { useState } from "react";
import type { ActionResponse, FindingCard } from "@/lib/types";
import { api } from "@/lib/client";
import { ErrorLine, InlineExpand } from "./Inline";
import { C, btnPrimary, errorText, fieldClass } from "./parts";

/**
 * Inline Acknowledge (design 2.4, SEC-ARCH-05). The paragraph is the engine's verdict line; the note is optional.
 * Posts action "acknowledge" (ActionRequest), which the server records as an acknowledgment, not a disposition.
 */
export function InlineAcknowledge({ card, disabled, onFinal }: { card: FindingCard; disabled?: boolean; onFinal: (r: ActionResponse) => Promise<void> }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const ack = async () => {
    setBusy(true);
    setErr(null);
    try {
      const r = await api.action({
        finding_id: card.finding.finding_id,
        control_id: card.finding.control_id,
        decision_snapshot_id: card.finding.snapshot_id,
        action: "acknowledge",
        ...(note.trim() ? { message: note.trim() } : {}),
      });
      if (r.result === "rejected") {
        setErr(r.explanation ?? "Rejected. Nothing was recorded.");
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
    <InlineExpand label="Acknowledge">
      <label className="block">
        <span className="block text-[12.5px]" style={{ color: C.text }}>
          Note <span style={{ color: C.secondary }}>(optional)</span>
        </span>
        <textarea className={`${fieldClass} mt-1.5`} rows={2} value={note} onChange={(e) => setNote(e.target.value)} aria-label="Acknowledgment note" />
      </label>
      <div className="mt-2.5 flex justify-end">
        <button type="button" className={btnPrimary} disabled={disabled || busy} onClick={ack}>
          {busy ? "Recording…" : "Acknowledge"}
        </button>
      </div>
      <ErrorLine text={err} />
    </InlineExpand>
  );
}
