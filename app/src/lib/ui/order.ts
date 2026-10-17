import type { ControlRow } from "@/lib/types";

const SEV: Record<string, number> = { Critical: 0, High: 1, Medium: 2, Low: 3 };

/**
 * Attention order for the package view after a run. Presentation only: the status itself comes
 * from the engine. Not evaluated, then Needs review by severity, Acknowledge, Pending review,
 * human dispositions, then the verifications that hold.
 */
export function attentionRank(r: ControlRow): number {
  const k = r.status.kind;
  if (k === "not_evaluated") return 0;
  if (k.startsWith("needs_review")) return 10 + (SEV[r.status.severity ?? r.severity ?? r.tier] ?? 2);
  if (k === "acknowledge") return 20;
  if (k === "pending_review") return 30;
  if (k === "pending_recheck") return 35;
  if (k === "returned_to_author") return 40;
  if (k === "verified") return 41;
  if (k === "verified_holds") return 50;
  return 45;
}

const byId = (a: ControlRow, b: ControlRow) => a.control_id.localeCompare(b.control_id, undefined, { numeric: true });

export function orderByAttention(rows: ControlRow[]): ControlRow[] {
  return rows.slice().sort((a, b) => attentionRank(a) - attentionRank(b) || byId(a, b));
}

export function orderById(rows: ControlRow[]): ControlRow[] {
  return rows.slice().sort(byId);
}

export const isHold = (r: ControlRow) => r.status.kind === "verified_holds";
