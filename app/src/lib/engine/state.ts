/**
 * Control state on a snapshot, derived from the ledger (spec 3 step 13). The ledger is the single
 * source: the latest evaluation event for the control on the snapshot, the staleness events, the
 * human disposition recorded on that snapshot (default unreviewed), and the most recent prior
 * verification as a separate historical record. Rows are then one displayStatus call per control.
 */
import type {
  ChangeClassification,
  ClauseSupport,
  Control,
  ControlProfile,
  ControlRow,
  DisplayInputs,
  DisplayedStatus,
  DispositionRecord,
  EvaluationState,
  EvidenceRef,
  LedgerEvent,
  MachineAssessment,
  PriorVerification,
} from "../types";
import type { Store, StoredTask } from "../store";
import { dispositionOf, priorVerificationFromEvent } from "./ledger";
import { displayStatus } from "./display";
import { findQuote } from "./normalize";

export interface ControlState {
  control: Control;
  snapshot_id: string;
  evaluation_state: EvaluationState;
  evaluation_reason?: string;
  not_evaluated_reason?: { code: string; message: string };
  evaluation_event: LedgerEvent | null;
  machine_assessment: MachineAssessment;
  change_classification: ChangeClassification;
  clause_support: ClauseSupport[];
  binding: EvidenceRef | null;
  evidence: EvidenceRef[];
  verification_holds: boolean;
  acknowledgment_required: boolean;
  acknowledgment_reason?: "evidencing file changed" | "evidencing section changed";
  staleness_event: LedgerEvent | null;
  current_disposition: DispositionRecord | null;
  current_disposition_event: LedgerEvent | null;
  prior_verification: PriorVerification | null;
  prior_verification_event: LedgerEvent | null;
  finding_id?: string;
  open_task?: StoredTask;
}

const EVAL_TYPES = new Set(["control_evaluated", "evaluation_error"]);

/**
 * Evaluation state of a snapshot: the outcome of its latest attempt. An attempt started after the
 * last evaluation_completed (a retry, Codex finding 8) makes the snapshot pending again.
 */
export function snapshotEvaluationState(events: LedgerEvent[], snapshotId: string): { state: EvaluationState; reason?: string } {
  let completed: LedgerEvent | undefined;
  let completedAt = -1;
  let attemptAt = -1;
  let captured = false;
  events.forEach((e, i) => {
    if (e.snapshot_id !== snapshotId) return;
    if (e.event_type === "snapshot_captured") captured = true;
    if (e.event_type === "evaluation_attempt") attemptAt = i;
    if (e.event_type === "evaluation_completed") {
      completed = e;
      completedAt = i;
    }
  });
  if (completed && completedAt > attemptAt) {
    const done = completed as LedgerEvent;
    const st = (done.evaluation_state ?? "complete") as EvaluationState;
    return { state: st, reason: st === "error" ? done.error?.message ?? "evaluation error" : undefined };
  }
  return { state: captured ? "pending" : "complete" };
}

/** Ledger index that bounds history for a snapshot: the capture of the next snapshot (else the end). */
export function historyBound(events: LedgerEvent[], snapshotIds: string[], snapshotId: string): number {
  const next = snapshotIds[snapshotIds.indexOf(snapshotId) + 1];
  if (!next) return events.length;
  const i = events.findIndex((e) => e.snapshot_id === next && (e.event_type === "file_version_observed" || e.event_type === "snapshot_captured"));
  return i < 0 ? events.length : i;
}

export function dispositionRecordFromEvent(e: LedgerEvent): DispositionRecord {
  const hd = e.human_disposition as unknown;
  const detail = (hd && typeof hd === "object" ? hd : {}) as { reason?: string; due_at?: string };
  return {
    disposition: dispositionOf(e) ?? "unreviewed",
    actor: { name: e.actor.name, role: e.actor.role ?? "", box_user_id: e.actor.box_user_id },
    recorded_at: e.ts,
    snapshot_id: e.snapshot_id ?? "",
    binding: { fileId: e.fileId ?? "", fileName: e.fileName ?? "", versionId: e.versionId ?? "", quote: e.quote ?? undefined },
    reason: (e.comment as string | undefined) ?? detail.reason,
    due_at: (e.due_at as string | undefined) ?? detail.due_at,
  };
}

/** The selected binding recorded on an evaluation event (evidence[0], else the envelope fields). */
export function bindingFromEvent(e: LedgerEvent | null): EvidenceRef | null {
  if (!e || !e.fileId || !e.quote) return null;
  const ev = (e.evidence as EvidenceRef[] | undefined)?.[0];
  if (ev && ev.versionId === e.versionId && ev.quote === e.quote) return ev;
  const fromClause = e.clause_support?.find((c) => c.quote && c.quote.versionId === e.versionId && c.quote.quote === e.quote)?.quote;
  if (fromClause) return fromClause;
  return { fileId: e.fileId, fileName: e.fileName ?? "", versionId: e.versionId ?? "", section: "", quote: e.quote, box_deep_link: e.box_deep_link ?? undefined };
}

/** Latest verified disposition for a control: the prior verification (historical record). */
export function latestVerification(events: LedgerEvent[], controlId: string, before?: number): LedgerEvent | null {
  const end = before ?? events.length;
  for (let i = end - 1; i >= 0; i--) {
    const e = events[i];
    if (e.control_id === controlId && e.event_type === "human_disposition_recorded" && dispositionOf(e) === "verified") return e;
  }
  return null;
}

/** Most recent evaluation of a control on any snapshot other than `snapshotId` (the prior binding). */
export function priorEvaluation(events: LedgerEvent[], controlId: string, snapshotId: string): { binding: LedgerEvent | null; last: LedgerEvent | null } {
  let binding: LedgerEvent | null = null;
  let last: LedgerEvent | null = null;
  for (const e of events) {
    if (e.control_id !== controlId || e.snapshot_id === snapshotId || !EVAL_TYPES.has(e.event_type)) continue;
    last = e;
    if (e.event_type === "control_evaluated") binding = e;
  }
  return { binding, last };
}

/** Prior verification's evidence as EvidenceRef, with section from its clause support or by locating the quote. */
export function verificationBinding(store: Store, e: LedgerEvent | null): EvidenceRef | null {
  if (!e || !e.fileId || !e.quote) return null;
  const cs = e.clause_support?.find((c) => c.quote && c.quote.versionId === e.versionId && c.quote.quote === e.quote)?.quote;
  if (cs) return { ...cs, versionLabel: cs.versionLabel ?? store.versionLabel(e.fileId, e.versionId ?? "") };
  const text = store.text(e.versionId ?? "");
  const loc = text ? findQuote(e.quote, text) : null;
  return {
    fileId: e.fileId,
    fileName: e.fileName ?? "",
    versionId: e.versionId ?? "",
    versionLabel: store.versionLabel(e.fileId, e.versionId ?? ""),
    section: loc?.section ?? "",
    paragraph: loc?.paragraph,
    page: loc?.page,
    quote: e.quote,
    box_deep_link: e.box_deep_link ?? undefined,
  };
}

export function deriveControlState(store: Store, control: Control, snapshotId: string): ControlState {
  const events = store.events;
  let evalEvent: LedgerEvent | null = null;
  let staleness: LedgerEvent | null = null;
  let disp: LedgerEvent | null = null;
  for (const e of events) {
    if (e.snapshot_id !== snapshotId || e.control_id !== control.id) continue;
    if (EVAL_TYPES.has(e.event_type)) {
      evalEvent = e;
      staleness = null; // a re-evaluation supersedes earlier staleness on the same snapshot
    }
    if (e.event_type === "verification_holds" || e.event_type === "verification_requires_acknowledgment" || e.event_type === "binding_changed") staleness = e;
    if (e.event_type === "human_disposition_recorded") disp = e;
  }
  const snapState = snapshotEvaluationState(events, snapshotId);
  // History is bounded to the viewed snapshot: S3's row never names a later S4 review (Codex finding 15).
  const pvEvent = latestVerification(events, control.id, historyBound(events, store.data.snapshots.map((x) => x.snapshot_id), snapshotId));
  const clause_support = evalEvent?.clause_support ?? [];
  const binding = evalEvent?.event_type === "control_evaluated" ? bindingFromEvent(evalEvent) : null;
  const notEval =
    evalEvent?.event_type === "evaluation_error"
      ? { code: evalEvent.error?.code ?? "evaluation_error", message: evalEvent.error?.message ?? "not evaluated" }
      : undefined;
  let assessment: MachineAssessment = (evalEvent?.machine_assessment as MachineAssessment | null) ?? "not_evaluated";
  let evaluation_state = snapState.state;
  let evaluation_reason = notEval?.message ?? snapState.reason;
  if (!evalEvent && snapState.state === "complete") {
    assessment = "not_evaluated";
    evaluation_reason = "no evaluation recorded for this control on this snapshot";
  }
  if (snapState.state === "error") evaluation_state = "error";
  const ack = staleness?.event_type === "verification_requires_acknowledgment";
  const open_task = [...store.data.tasks].reverse().find((t) => t.control_id === control.id && (t.kind ?? "reviewer") === "reviewer" && t.status === "open");
  return {
    control,
    snapshot_id: snapshotId,
    evaluation_state,
    evaluation_reason,
    not_evaluated_reason: notEval,
    evaluation_event: evalEvent,
    machine_assessment: assessment,
    change_classification: (evalEvent?.change_classification as ChangeClassification | null) ?? "none",
    clause_support,
    binding,
    evidence: (evalEvent?.evidence as EvidenceRef[] | undefined) ?? (binding ? [binding] : []),
    verification_holds: staleness?.event_type === "verification_holds",
    acknowledgment_required: ack,
    acknowledgment_reason: ack ? ((staleness?.acknowledgment?.reason as ControlState["acknowledgment_reason"]) ?? "evidencing file changed") : undefined,
    staleness_event: staleness,
    current_disposition: disp ? dispositionRecordFromEvent(disp) : null,
    current_disposition_event: disp,
    prior_verification: pvEvent ? priorVerificationFromEvent(pvEvent) : null,
    prior_verification_event: pvEvent,
    finding_id: (evalEvent?.finding_id as string | undefined) ?? undefined,
    open_task,
  };
}

export function displayInputsFor(st: ControlState, priorDisplayed?: string): DisplayInputs {
  return {
    current_snapshot_id: st.snapshot_id,
    current_disposition: st.current_disposition,
    prior_verification: st.prior_verification,
    verification_holds: st.verification_holds,
    acknowledgment_required: st.acknowledgment_required,
    acknowledgment_reason: st.acknowledgment_reason,
    machine_assessment: st.machine_assessment,
    change_classification: st.change_classification,
    unsupported_clauses: st.clause_support.filter((c) => c.support !== "supported").map((c) => c.clause),
    evaluation_state: st.evaluation_state,
    evaluation_reason: st.evaluation_reason,
    tier: st.control.tier,
    prior_displayed_status: priorDisplayed,
    current_binding: st.binding ? { fileId: st.binding.fileId, fileName: st.binding.fileName, versionId: st.binding.versionId, section: st.binding.section, quote: st.binding.quote } : undefined,
  };
}

export interface RowWithState extends ControlRow {
  state: ControlState;
}

/** One row per control in profile order, each with its displayed status (spec 6 package view). */
export function buildRows(store: Store, profile: ControlProfile, snapshotId: string, opts: { withPrior?: boolean } = {}): RowWithState[] {
  const withPrior = opts.withPrior ?? true;
  const pending = snapshotEvaluationState(store.events, snapshotId).state === "pending";
  const prevId = pending && withPrior ? store.previousSnapshot(snapshotId)?.snapshot_id : undefined;
  const priorRows = prevId ? buildRows(store, profile, prevId, { withPrior: false }) : [];
  const versionLabel = (f: string, v: string) => store.versionLabel(f, v);
  return profile.controls.map((control) => {
    const st = deriveControlState(store, control, snapshotId);
    const prior = priorRows.find((r) => r.control_id === control.id)?.status.label;
    const status: DisplayedStatus = displayStatus(displayInputsFor(st, prior), { versionLabel });
    // While a re-check is pending, keep showing the prior evidencing file rather than none.
    const b = st.binding ?? (pending ? (priorRows.find((r) => r.control_id === control.id)?.state.binding ?? null) : null);
    return {
      control_id: control.id,
      title: control.title,
      tier: control.tier,
      severity: status.severity,
      reviewer_role: control.reviewer_role,
      status,
      evidencing: b ? { fileName: b.fileName, versionLabel: b.versionLabel ?? store.versionLabel(b.fileId, b.versionId), versionId: b.versionId, section: b.section } : null,
      finding_id: st.finding_id,
      machine_assessment: st.machine_assessment,
      change_classification: st.change_classification,
      verification_holds: st.verification_holds,
      acknowledgment_required: st.acknowledgment_required,
      current_disposition: st.current_disposition?.disposition ?? "unreviewed",
      prior_verification: st.prior_verification,
      open_task_id: st.open_task?.task_id,
      state: st,
    };
  });
}

/** Strip the internal state for the API. */
export function publicRow(r: RowWithState): ControlRow {
  const { state: _s, ...row } = r;
  return row;
}
