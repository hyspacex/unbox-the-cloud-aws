"use client";

import { useState } from "react";
import type { ActionResponse, FindingCard } from "@/lib/types";
import { api } from "@/lib/client";
import { attestationPresent } from "@/lib/engine/wording";
import { ErrorLine, InlineExpand } from "./Inline";
import { C, CheckIcon, btnPrimary, btnSmall, errorText, fieldClass, shortSection, useActionRunner } from "./parts";

/**
 * Inline Verify (design 2.4). The attestation field starts empty; the checklist shows the four preconditions a
 * presenter can watch change. The fifth (no open conflicting disposition) is checked by the server.
 */
export function InlineVerify({ card, disabled, onFinal }: { card: FindingCard; disabled?: boolean; onFinal: (r: ActionResponse) => Promise<void> }) {
  const phrase = card.actions.verify.attestation_phrase;
  const runAction = useActionRunner();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const ev = card.finding.evidence[0] ?? null;
  const where = ev ? `${ev.fileName} ${ev.versionLabel ?? ""} ${shortSection(ev.section)}`.replace(/\s+/g, " ").trim() : "";
  const checks: [string, boolean][] = [
    [where ? `Quote present in ${where}` : "Quote present", Boolean(ev?.quote)],
    [`Snapshot ${card.finding.snapshot_id} is current`, card.binding_fresh],
    ["You are the configured reviewer", Boolean(card.reviewer?.box_user_id || card.reviewer?.name)],
    ["Attestation phrase in your message", attestationPresent(message, phrase)],
  ];
  const ready = checks.every(([, ok]) => ok) && card.actions.verify.enabled;

  const confirm = async () => {
    setBusy(true);
    setErr(null);
    try {
      const r = await runAction(() => api.action({
        finding_id: card.finding.finding_id,
        control_id: card.finding.control_id,
        decision_snapshot_id: card.finding.snapshot_id,
        action: "verify",
        message,
      }));
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
    <InlineExpand label={where ? `Verify on ${where}` : "Verify"}>
      <label className="block">
        <span className="block text-[12.5px]" style={{ color: C.text }}>
          Your attestation
        </span>
        <textarea className={`${fieldClass} mt-1.5`} rows={2} value={message} onChange={(e) => setMessage(e.target.value)} aria-label="Your attestation" />
      </label>
      <button
        type="button"
        className={`${btnSmall} mt-1.5`}
        disabled={attestationPresent(message, phrase)}
        onClick={() => setMessage((m) => (m.trim() ? `${m.trim()} ${phrase}` : phrase))}
        title={phrase}
      >
        Insert attestation phrase
      </button>
      <ul className="mt-2.5 space-y-1" aria-label="Verify preconditions">
        {checks.map(([label, ok]) => (
          <li key={label} className="flex items-center gap-2 text-[12.5px]" style={{ color: ok ? C.text : C.secondary }} data-ok={ok}>
            {ok ? (
              <CheckIcon size={14} color={C.blue} />
            ) : (
              <span className="inline-block h-[12px] w-[12px] flex-none rounded-full border-[1.5px]" style={{ borderColor: "#B8B8B8", margin: "0 1px" }} aria-hidden />
            )}
            <span>{label}</span>
            <span className="sr-only">{ok ? "met" : "not met"}</span>
          </li>
        ))}
      </ul>
      <div className="mt-2.5 flex justify-end">
        <button type="button" className={btnPrimary} disabled={disabled || busy || !ready} onClick={confirm}>
          {busy ? "Recording…" : "Confirm verify"}
        </button>
      </div>
      <ErrorLine text={err} />
    </InlineExpand>
  );
}
