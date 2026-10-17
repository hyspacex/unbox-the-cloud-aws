/**
 * Machine assessment and change classification (spec 4, stored fields and definitions).
 * The model only says which quote supports which clause; code derives everything here.
 */
import { ASSESSMENT_PRECEDENCE } from "../types";
import type { ChangeClassification, ClauseSupport, EvidenceRef, MachineAssessment } from "../types";
import { norm } from "./normalize";

export interface NotEvaluatedReason {
  code: string;
  message: string;
}

/**
 * Spec 4: all required clauses supported -> evidence_found, some -> evidence_weakened,
 * none -> evidence_absent; a supporting quote plus a conflicting quote -> evidence_contradicted;
 * any not-evaluated reason -> not_evaluated. Precedence (not_evaluated > contradicted > absent >
 * weakened > found) is applied here, by code, never by the model.
 */
export function deriveAssessment(
  clauseSupport: ClauseSupport[],
  opts: { conflicting?: boolean; notEvaluatedReason?: NotEvaluatedReason | null } = {},
): MachineAssessment {
  const candidates = new Set<MachineAssessment>();
  const supported = clauseSupport.filter((c) => c.support === "supported" && c.quote).length;
  if (opts.notEvaluatedReason) candidates.add("not_evaluated");
  if (clauseSupport.length === 0) candidates.add("not_evaluated");
  if (opts.conflicting && supported > 0) candidates.add("evidence_contradicted");
  if (supported === 0) candidates.add("evidence_absent");
  else if (supported < clauseSupport.length) candidates.add("evidence_weakened");
  else candidates.add("evidence_found");
  return ASSESSMENT_PRECEDENCE.find((a) => candidates.has(a))!;
}

export interface BindingSelection {
  /** The evidence binding: the quote that supports the most required clauses (ties: first cited). */
  binding: EvidenceRef | null;
  /** Every distinct supporting quote, binding first, as the finding's evidence list. */
  evidence: EvidenceRef[];
}

/** gen.py binding_from: rank distinct (versionId, quote) pairs by how many clauses they support. */
export function selectBinding(clauseSupport: ClauseSupport[]): BindingSelection {
  const quotes = new Map<string, { ref: EvidenceRef; n: number; order: number }>();
  clauseSupport.forEach((c) => {
    if (!c.quote) return;
    const k = c.quote.versionId + "\u0000" + c.quote.quote;
    const cur = quotes.get(k);
    if (cur) cur.n += 1;
    else quotes.set(k, { ref: c.quote, n: 1, order: quotes.size });
  });
  if (!quotes.size) return { binding: null, evidence: [] };
  const ranked = [...quotes.values()].sort((a, b) => b.n - a.n || a.order - b.order);
  return { binding: ranked[0].ref, evidence: ranked.map((r) => r.ref) };
}

export interface PriorEvaluation {
  binding: { fileId: string; fileName?: string; versionId: string; quote: string } | null;
  assessment: MachineAssessment | null;
}

/**
 * Change classification relative to the prior evidence binding (spec 4 definitions; gen.py classify):
 * none (nothing to compare), removed (no clause supported), weakened (some lost), contradicted,
 * unchanged (same file, same quote after normalization), moved (the selected binding changed
 * file or version while support remains).
 */
export function classifyChange(prior: PriorEvaluation | null, assessment: MachineAssessment, binding: EvidenceRef | null): ChangeClassification {
  if (assessment === "not_evaluated") return "none";
  if (!prior || !prior.binding) return "none";
  if (assessment === "evidence_contradicted") return "contradicted";
  if (assessment === "evidence_absent") return "removed";
  if (assessment === "evidence_weakened") return "weakened";
  if (binding && binding.fileId === prior.binding.fileId && norm(binding.quote) === norm(prior.binding.quote)) return "unchanged";
  if (binding && norm(binding.quote) !== norm(prior.binding.quote) && prior.assessment !== "evidence_found") return "none";
  return "moved";
}

/** Same binding = same file, same version, same quote after normalization (freshness check, spec 3 step 12). */
export function bindingsEqual(
  a: { fileId?: string | null; versionId?: string | null; quote?: string | null } | null | undefined,
  b: { fileId?: string | null; versionId?: string | null; quote?: string | null } | null | undefined,
): boolean {
  if (!a || !b) return !a && !b;
  return a.fileId === b.fileId && a.versionId === b.versionId && norm(a.quote ?? "") === norm(b.quote ?? "");
}

/** Verify precondition (spec 4, rules enforced by code): every required clause supported, not contradicted. */
export function verifyPrecondition(
  assessment: MachineAssessment,
  clauseSupport: ClauseSupport[],
): { ok: boolean; unsupported: ClauseSupport[]; reason?: "not_evaluated" | "contradicted" | "unsupported" } {
  const unsupported = clauseSupport.filter((c) => c.support !== "supported" || !c.quote);
  if (assessment === "not_evaluated") return { ok: false, unsupported, reason: "not_evaluated" };
  if (assessment === "evidence_contradicted") return { ok: false, unsupported, reason: "contradicted" };
  if (unsupported.length || clauseSupport.length === 0) return { ok: false, unsupported, reason: "unsupported" };
  return { ok: true, unsupported };
}
