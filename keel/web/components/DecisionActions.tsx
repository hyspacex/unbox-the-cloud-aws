"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { resolveDecision } from "@/app/actions";

// Adopt / Keep for a proposed change. Only the decision owner can act; everyone else sees who decides.
export function DecisionActions({ folderId, topic, current, proposed, canDecide, owner, state, size }: {
  folderId: string; topic: string; current: string; proposed: string; canDecide: boolean; owner: string;
  state?: string | null; size?: "big";
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (state === "revert_requested") return <span className="muted" style={{ fontSize: 13 }}>Kept {current} · waiting for the author to revert</span>;
  if (!canDecide) return <span className="muted" style={{ fontSize: 13 }}>Waiting for {owner} to decide</span>;
  if (done) return <span className="checking"><span className="pulse" />{done}</span>;
  const act = (action: "adopt" | "keep") => start(async () => {
    const r = await resolveDecision(folderId, topic, action);
    if (!r.ok) setError(r.error);
    else { setDone(action === "adopt" ? `Adopting ${proposed}…` : `Keeping ${current}…`); router.refresh(); }
  });
  const cls = size === "big" ? " big" : " small";
  return (
    <div className="row" onClick={(e) => e.preventDefault()}>
      <button className={`btn${cls}`} disabled={pending} onClick={() => act("adopt")} data-testid={`adopt-${topic}`}>Adopt {proposed}</button>
      <button className={`btn ghost${cls}`} disabled={pending} onClick={() => act("keep")} data-testid={`keep-${topic}`}>Keep {current}</button>
      {error && <span className="error">{error}</span>}
    </div>
  );
}
