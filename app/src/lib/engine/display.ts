/**
 * Displayed status: the sixteen ordered rules of spec section 4, applied by one reducer.
 * Inputs are exactly those listed in spec 3 step 13 (DisplayInputs): current disposition and the
 * prior verification are separate inputs, and the prior verification is never installed as the
 * current disposition. The UI never decides a label; it renders `label`, `secondary` and `tone`.
 *
 * Tone: grey = machine state, amber = needs review or acknowledge, blue = human-owned state
 * (returned, pending review), teal = a prior verification that holds (rule 10), green ONLY for a
 * human Verified on the current snapshot and binding (rule 9).
 */
import type { DisplayedStatus, DisplayInputs, DisplayKind, ProjectionCode, Severity } from "../types";
import { norm } from "./normalize";

export interface DisplayOptions {
  now?: Date;
  /** Resolve "v2" style labels for the secondary line; falls back to the Box version id. */
  versionLabel?: (fileId: string, versionId: string) => string | undefined;
}

export interface DisplayRule {
  rule: number;
  condition: string;
  label: string;
  kind: DisplayKind | DisplayKind[];
  projection_code: ProjectionCode;
  tone: DisplayedStatus["tone"];
  built: boolean;
  note?: string;
}

/** The published rules (UI /rules page). Order is precedence. */
export const RULES: DisplayRule[] = [
  { rule: 1, condition: "Evaluation state pending", label: "Re-check pending (prior status shown struck through)", kind: "pending_recheck", projection_code: "PENDING", tone: "grey", built: true },
  { rule: 2, condition: "Evaluation state error, or machine assessment not_evaluated", label: "Not evaluated, with reason", kind: "not_evaluated", projection_code: "NOT_EVALUATED", tone: "grey", built: true },
  { rule: 3, condition: "Disposition superseded (profile changed since verification)", label: "Superseded, re-verify under profile v[n]", kind: "superseded", projection_code: "PENDING", tone: "amber", built: false, note: "Proposed; unreachable in the build." },
  { rule: 4, condition: "Disposition not_applicable approved and applicability unchanged", label: "Not applicable", kind: "not_applicable", projection_code: "NOT_APPLICABLE", tone: "blue", built: false, note: "Proposed; unreachable in the build." },
  { rule: 5, condition: "Disposition exception_approved: not expired / expired", label: "Exception approved until [date] / Exception expired, re-review due", kind: ["exception_approved", "exception_expired"], projection_code: "EXCEPTION", tone: "blue", built: false, note: "Proposed; written only by the IRM integration or an approver-role user." },
  { rule: 6, condition: "Disposition exception_requested", label: "Exception requested", kind: "exception_requested", projection_code: "EXCEPTION", tone: "blue", built: false, note: "Proposed." },
  { rule: 7, condition: "Disposition compensating_control with its evidence validated", label: "Compensating control", kind: "compensating_control", projection_code: "EXCEPTION", tone: "blue", built: false, note: "Proposed." },
  { rule: 8, condition: "Disposition returned_to_author on the current binding", label: "Returned to author, open", kind: "returned_to_author", projection_code: "RETURNED_TO_AUTHOR", tone: "blue", built: true },
  { rule: 9, condition: "Disposition verified on the current binding", label: "Verified", kind: "verified", projection_code: "VERIFIED", tone: "green", built: true, note: "The only green status." },
  { rule: 10, condition: "Prior verification holds (classification unchanged, materiality permits)", label: "Verified, holds (secondary line names the original review)", kind: "verified_holds", projection_code: "VERIFIED_HOLDS", tone: "teal", built: true, note: "Muted teal: a prior human verification that holds, never the green of a current Verified." },
  { rule: 11, condition: "Prior verification, classification unchanged, materiality requires acknowledgment", label: "Acknowledge: evidencing file changed (Critical) / Acknowledge: evidencing section changed (High)", kind: "acknowledge", projection_code: "ACKNOWLEDGE", tone: "amber", built: true },
  { rule: 12, condition: "Assessment evidence_found, classification moved", label: "Needs review: evidence binding changed (severity Low)", kind: "needs_review_binding", projection_code: "NEEDS_REVIEW_BINDING", tone: "amber", built: true },
  { rule: 13, condition: "Assessment evidence_weakened", label: "Needs review: [unsupported clause] missing (prior verification on the secondary line)", kind: "needs_review_weakened", projection_code: "NEEDS_REVIEW_WEAKENED", tone: "amber", built: true },
  { rule: 14, condition: "Assessment evidence_absent", label: "Needs review: evidence lost", kind: "needs_review_absent", projection_code: "NEEDS_REVIEW_ABSENT", tone: "amber", built: true },
  { rule: 15, condition: "Assessment evidence_contradicted", label: "Needs review: conflicting evidence", kind: "needs_review_conflict", projection_code: "NEEDS_REVIEW_CONFLICT", tone: "amber", built: true },
  { rule: 16, condition: "Otherwise (evidence_found, unreviewed)", label: "Pending review", kind: "pending_review", projection_code: "PENDING", tone: "blue", built: true },
];

/** Stored-field definitions (spec 4) for the published rules page. */
export const STORED_FIELDS = [
  { field: "Machine assessment", scope: "per control, per snapshot", values: ["evidence_found", "evidence_weakened", "evidence_absent", "evidence_contradicted", "not_evaluated"], writer: "code, from clause support" },
  { field: "Change classification", scope: "relative to prior evidence", values: ["unchanged", "moved", "weakened", "removed", "contradicted", "none"], writer: "code" },
  { field: "Clause support", scope: "per required clause", values: ["supported (with validated quote)", "unsupported"], writer: "model proposes, code validates" },
  { field: "Human disposition", scope: "per control, bound to an evidence binding and snapshot", values: ["unreviewed", "verified", "returned_to_author", "not_applicable", "compensating_control", "exception_requested", "exception_approved", "superseded"], writer: "the human response handler only; built: verified, returned_to_author" },
  { field: "Evaluation state", scope: "per snapshot", values: ["pending", "complete", "error"], writer: "code" },
  { field: "Verification holds", scope: "per control, computed", values: ["true", "false"], writer: "code, binding + tier materiality" },
];

export const ASSESSMENT_PRECEDENCE_TEXT = "not_evaluated > evidence_contradicted > evidence_absent > evidence_weakened > evidence_found (applied by code)";

/**
 * Short noun phrase for a group of unsupported clauses (rule 13 label). Data-driven on clause text,
 * with a generic fallback that trims the first unsupported clause to its noun phrase.
 */
export const CLAUSE_GROUP_LABELS: { match: RegExp; label: string }[] = [
  { match: /key management model/i, label: "key-management evidence" },
  { match: /rto and rpo/i, label: "recovery-target evidence" },
  { match: /tprm assessment id/i, label: "TPRM evidence" },
];

/** "rotation period stated (at least annually)" -> "rotation period"; "key custodians named" -> "key custodians". */
export function clauseNoun(clause: string): string {
  let s = clause.replace(/\s*\([^)]*\)\s*/g, " ").trim();
  s = s.replace(/\s+(stated|named|given|described|flagged|required|listed|documented)$/i, "");
  if (/^key management model$/i.test(s)) return "key model";
  return s;
}

export function weakenedLabel(unsupported: string[]): string {
  for (const g of CLAUSE_GROUP_LABELS) if (unsupported.some((c) => g.match.test(c))) return `Needs review: ${g.label} missing`;
  return `Needs review: ${unsupported.length ? clauseNoun(unsupported[0]) : "clause"} missing`;
}

function secondaryFromPrior(i: DisplayInputs, o: DisplayOptions): string | undefined {
  const pv = i.prior_verification;
  if (!pv) return undefined;
  const v = o.versionLabel?.(pv.fileId, pv.versionId) ?? pv.versionId;
  return `Verified by ${pv.actor}, ${pv.role}, on ${pv.fileName} ${v}, ${pv.verified_at}`;
}

function secondaryFromDisposition(i: DisplayInputs, o: DisplayOptions): string | undefined {
  const d = i.current_disposition;
  if (!d) return undefined;
  const v = o.versionLabel?.(d.binding.fileId, d.binding.versionId) ?? d.binding.versionId;
  if (d.disposition === "returned_to_author") {
    return `Returned by ${d.actor.name}, ${d.actor.role}, on ${d.binding.fileName} ${v}, ${d.recorded_at}${d.due_at ? `; due ${d.due_at}` : ""}`;
  }
  return `Verified by ${d.actor.name}, ${d.actor.role}, on ${d.binding.fileName} ${v}, ${d.recorded_at}`;
}

const tierSeverity = (t: DisplayInputs["tier"]): Severity => t;

/**
 * A disposition applies only to the binding it was recorded on: same snapshot, and same file,
 * version and normalized quote as the control's current binding. Fails closed when the current
 * binding is unknown; a disposition recorded with no binding matches only a control with none.
 */
export function onCurrentBinding(i: DisplayInputs): boolean {
  const d = i.current_disposition;
  if (!d || d.snapshot_id !== i.current_snapshot_id) return false;
  const db = d.binding && d.binding.fileId ? d.binding : null;
  const cb = i.current_binding ?? null;
  if (!db || !cb) return !db && !cb && i.machine_assessment !== "evidence_found";
  return db.fileId === cb.fileId && db.versionId === cb.versionId && normQ(db.quote) === normQ(cb.quote);
}
const normQ = (q?: string) => norm(q ?? "");

/** Short category for a Not evaluated label (judge B11); the full reason goes to `detail`. */
export function notEvaluatedCategory(code: string | undefined, state?: DisplayInputs["evaluation_state"]): string {
  if (code === "input_gate") return "input quarantined";
  if (code && /^QUOTE_/.test(code)) return "quote not found";
  if (code && /(UNREADABLE|NOT_READY|VERSION_NOT_FOUND|TEXT_REPRESENTATION|EXTRACTION|READ|DOWNLOAD)/.test(code)) return "file unreadable";
  void state;
  return "evaluation error";
}

/** Spec 4, the sixteen ordered rules. First match wins. */
export function displayStatus(i: DisplayInputs, o: DisplayOptions = {}): DisplayedStatus {
  const mk = (rule: number, kind: DisplayKind, label: string, projection_code: ProjectionCode, tone: DisplayedStatus["tone"], extra: Partial<DisplayedStatus> = {}): DisplayedStatus => ({
    rule,
    kind,
    label,
    projection_code,
    tone,
    ...extra,
  });
  const d = i.current_disposition;
  const dispOnSnapshot = d && d.snapshot_id === i.current_snapshot_id ? d.disposition : "unreviewed";
  const prior2nd = secondaryFromPrior(i, o);

  // Rule 1
  if (i.evaluation_state === "pending") return mk(1, "pending_recheck", "Re-check pending", "PENDING", "grey", { struck: i.prior_displayed_status, secondary: prior2nd });
  // Rule 2
  if (i.evaluation_state === "error" || i.machine_assessment === "not_evaluated") {
    return mk(2, "not_evaluated", `Not evaluated: ${notEvaluatedCategory(i.evaluation_reason_code, i.evaluation_state)}`, "NOT_EVALUATED", "grey", {
      secondary: prior2nd,
      ...(i.evaluation_reason ? { detail: i.evaluation_reason } : {}),
    });
  }
  // Rules 3 to 7: proposed dispositions (no transition behind them in the build)
  if (dispOnSnapshot === "superseded") return mk(3, "superseded", `Superseded, re-verify under profile v${d?.profile_version ?? "?"}`, "PENDING", "amber", { secondary: prior2nd });
  if (dispOnSnapshot === "not_applicable") return mk(4, "not_applicable", "Not applicable", "NOT_APPLICABLE", "blue");
  if (dispOnSnapshot === "exception_approved") {
    const now = o.now ?? new Date();
    const exp = d?.expires_at ? new Date(d.expires_at) : null;
    if (exp && exp.getTime() > now.getTime()) return mk(5, "exception_approved", `Exception approved until ${d!.expires_at!.slice(0, 10)}`, "EXCEPTION", "blue");
    return mk(5, "exception_expired", "Exception expired, re-review due", "EXCEPTION", "amber", { severity: tierSeverity(i.tier) });
  }
  if (dispOnSnapshot === "exception_requested") return mk(6, "exception_requested", "Exception requested", "EXCEPTION", "blue");
  if (dispOnSnapshot === "compensating_control") return mk(7, "compensating_control", "Compensating control", "EXCEPTION", "blue");
  // Rule 8
  if (dispOnSnapshot === "returned_to_author" && onCurrentBinding(i)) {
    return mk(8, "returned_to_author", "Returned to author, open", "RETURNED_TO_AUTHOR", "blue", { secondary: secondaryFromDisposition(i, o) });
  }
  // Rule 9
  if (dispOnSnapshot === "verified" && onCurrentBinding(i)) {
    return mk(9, "verified", "Verified", "VERIFIED", "green", { secondary: secondaryFromDisposition(i, o) });
  }
  const hasPrior = !!i.prior_verification || (d?.disposition === "verified" && d.snapshot_id !== i.current_snapshot_id);
  // Rule 10
  if (hasPrior && i.verification_holds && i.change_classification === "unchanged") {
    return mk(10, "verified_holds", "Verified, holds", "VERIFIED_HOLDS", "teal", { secondary: prior2nd });
  }
  // Rule 11
  if (hasPrior && i.change_classification === "unchanged" && i.acknowledgment_required) {
    const section = i.acknowledgment_reason === "evidencing section changed";
    return mk(11, "acknowledge", section ? "Acknowledge: evidencing section changed" : "Acknowledge: evidencing file changed", "ACKNOWLEDGE", "amber", {
      severity: tierSeverity(i.tier),
      secondary: prior2nd,
    });
  }
  // Rule 12
  if (i.machine_assessment === "evidence_found" && i.change_classification === "moved") {
    return mk(12, "needs_review_binding", "Needs review: evidence binding changed", "NEEDS_REVIEW_BINDING", "amber", { severity: "Low", secondary: prior2nd });
  }
  // Rule 13
  if (i.machine_assessment === "evidence_weakened") {
    return mk(13, "needs_review_weakened", weakenedLabel(i.unsupported_clauses), "NEEDS_REVIEW_WEAKENED", "amber", { severity: tierSeverity(i.tier), secondary: prior2nd });
  }
  // Rule 14
  if (i.machine_assessment === "evidence_absent") {
    return mk(14, "needs_review_absent", "Needs review: evidence lost", "NEEDS_REVIEW_ABSENT", "amber", { severity: tierSeverity(i.tier), secondary: prior2nd });
  }
  // Rule 15
  if (i.machine_assessment === "evidence_contradicted") {
    return mk(15, "needs_review_conflict", "Needs review: conflicting evidence", "NEEDS_REVIEW_CONFLICT", "amber", { severity: tierSeverity(i.tier), secondary: prior2nd });
  }
  // Rule 16
  return mk(16, "pending_review", "Pending review", "PENDING", "blue", { secondary: prior2nd });
}

/** Count-line key of one displayed outcome (gen.py count_line). */
export function countKey(s: DisplayedStatus): string {
  switch (s.kind) {
    case "verified_holds":
      return "Verified holds";
    case "verified":
      return "Verified";
    case "acknowledge":
      return `Acknowledge (${s.severity ?? "High"})`;
    case "needs_review_binding":
    case "needs_review_weakened":
    case "needs_review_absent":
    case "needs_review_conflict":
      return `Needs review (${s.severity ?? "Low"})`;
    case "returned_to_author":
      return "Returned to author";
    case "not_evaluated":
      return "Not evaluated";
    case "pending_recheck":
      return "Re-check pending";
    case "exception_approved":
    case "exception_expired":
    case "exception_requested":
      return "Exception";
    case "compensating_control":
      return "Compensating control";
    case "not_applicable":
      return "Not applicable";
    case "superseded":
      return "Superseded";
    default:
      return "Pending review";
  }
}

export const COUNT_ORDER = [
  "Re-check pending",
  "Verified holds",
  "Acknowledge (Critical)",
  "Acknowledge (High)",
  "Acknowledge (Medium)",
  "Verified",
  "Needs review (Low)",
  "Needs review (Medium)",
  "Needs review (High)",
  "Needs review (Critical)",
  "Returned to author",
  "Exception",
  "Compensating control",
  "Not applicable",
  "Superseded",
  "Pending review",
  "Not evaluated",
];

/** The top line counts current displayed outcomes, not dispositions (spec 4). Computed, never typed. */
export function countLine(rows: { status: DisplayedStatus }[], snapshotId: string): string {
  const n = new Map<string, number>();
  for (const r of rows) n.set(countKey(r.status), (n.get(countKey(r.status)) ?? 0) + 1);
  const parts = COUNT_ORDER.filter((k) => n.has(k)).map((k) => `${n.get(k)} ${k}`);
  return `${rows.length} controls on snapshot ${snapshotId}: ${parts.join(", ")}`;
}

/** Displayed counts keyed by label (expected-findings.json summary.displayed_counts_*). */
export function displayedCounts(rows: { status: DisplayedStatus }[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) out[r.status.label] = (out[r.status.label] ?? 0) + 1;
  return out;
}

/** Kinds that need a reviewer's attention (one Box review task each, spec 3 step 11). */
export const NEEDS_REVIEW_KINDS: DisplayKind[] = ["needs_review_weakened", "needs_review_absent", "needs_review_conflict", "needs_review_binding", "acknowledge"];
