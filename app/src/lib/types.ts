/**
 * Keel shared shapes. Frozen for the Saturday build (design spec v3.4,
 * docs/research/30-design-v3.md). Add optional fields; do not rename or
 * remove. Every lane imports from here.
 *
 * Shapes mirror the fixture in demo-data/lantern/ (profile-us-bank.json,
 * snapshots.json, ledger.json, expected-findings.json, agent-trace.json).
 */

// ---------------------------------------------------------------------------
// Vocabulary (spec section 4)
// ---------------------------------------------------------------------------

export type MachineAssessment =
  | "evidence_found"
  | "evidence_weakened"
  | "evidence_absent"
  | "evidence_contradicted"
  | "not_evaluated";

/** Precedence applied by code, not the model: not_evaluated > contradicted > absent > weakened > found. */
export const ASSESSMENT_PRECEDENCE: MachineAssessment[] = [
  "not_evaluated",
  "evidence_contradicted",
  "evidence_absent",
  "evidence_weakened",
  "evidence_found",
];

export type ChangeClassification =
  | "unchanged"
  | "moved"
  | "weakened"
  | "removed"
  | "contradicted"
  | "none";

export type ClauseSupportState = "supported" | "unsupported";

export type HumanDisposition =
  | "unreviewed"
  | "verified"
  | "returned_to_author"
  | "not_applicable"
  | "compensating_control"
  | "exception_requested"
  | "exception_approved"
  | "superseded";

/** Built in the hackathon. The rest are proposed and have no transition. */
export const BUILT_DISPOSITIONS: HumanDisposition[] = ["verified", "returned_to_author"];

export type EvaluationState = "pending" | "complete" | "error";

export type ControlTier = "Critical" | "High" | "Medium";

export type Materiality =
  | "acknowledge_on_evidencing_file_change" // Critical
  | "acknowledge_on_evidencing_section_change" // High
  | "hold_if_quote_unchanged"; // Medium

/** Fixed enum codes written to the Box folder metadata template (spec section 3 step 10). */
export type ProjectionCode =
  | "PENDING"
  | "NOT_EVALUATED"
  | "VERIFIED"
  | "VERIFIED_HOLDS"
  | "ACKNOWLEDGE"
  | "NEEDS_REVIEW_BINDING"
  | "NEEDS_REVIEW_WEAKENED"
  | "NEEDS_REVIEW_ABSENT"
  | "NEEDS_REVIEW_CONFLICT"
  | "RETURNED_TO_AUTHOR"
  | "NOT_APPLICABLE"
  | "EXCEPTION";

export type Severity = "Critical" | "High" | "Medium" | "Low";

export type RunMode = "mock" | "live" | "replay";

// ---------------------------------------------------------------------------
// Control profile (spec section 5)
// ---------------------------------------------------------------------------

export interface RequiredClause {
  clause_id: string; // "SEC-ARCH-07.3"
  clause: string;
  hint_terms: string[];
}

export interface FrameworkMap {
  status: string; // "illustrative; not reviewed by a compliance owner"
  [framework: string]: string | string[];
}

export interface Control {
  id: string;
  title: string;
  requirement: string;
  required_clauses: RequiredClause[];
  standard: string;
  applicability: string;
  evidence: string[]; // evidence locations, free text naming files/sections
  tier: ControlTier;
  framework_map: FrameworkMap;
  reviewer_role: string;
}

export interface ControlProfile {
  profile_id: string;
  profile_version: string;
  default?: boolean;
  name: string;
  fields: string[];
  handed_to_model: string[];
  materiality: Record<ControlTier, Materiality>;
  attestation_phrase: string;
  default_remediation_window_business_days: number;
  severity_rule: string;
  assessment_rule: string;
  out_of_profile: string[];
  controls: Control[];
}

// ---------------------------------------------------------------------------
// Snapshot and manifest (spec section 3 step 2)
// ---------------------------------------------------------------------------

export interface SnapshotFile {
  fileId: string;
  fileName: string;
  versionId: string;
  contentHash: string; // "sha256:<hex>"
  /** Display label such as "v2" when known. */
  versionLabel?: string;
}

export interface Snapshot {
  snapshot_id: string; // "S4"
  captured_at: string; // UTC ISO
  control_profile_version: string;
  files: SnapshotFile[];
  era?: string;
  manifest_hash: string;
}

export interface PackageHeader {
  folderId: string;
  folderName?: string;
  project: string;
  application_id: string;
  application_tier: string;
  regulatory_scope: string;
  arb_decision: { id: string; outcome: string; date: string; chair: string };
}

/** Coverage of the fetch step. A failed read makes dependent controls not_evaluated. */
export interface Coverage {
  readable: number;
  total: number;
  files?: { fileName: string; versionId: string; readable: boolean; reason?: string }[];
}

// ---------------------------------------------------------------------------
// Evidence and quotes
// ---------------------------------------------------------------------------

export interface EvidenceRef {
  fileId: string;
  fileName: string;
  versionId: string;
  versionLabel?: string;
  section: string; // "§4.3 Data protection at rest"
  paragraph?: number;
  page?: number;
  quote: string; // must string-match the pinned version text after normalization
  box_deep_link?: string;
}

export interface PriorEvidenceRef extends EvidenceRef {
  verified_by?: string;
  verified_role?: string;
  verified_at?: string;
  verified_snapshot_id?: string;
}

export interface ClauseSupport {
  clause_id: string;
  clause: string;
  support: ClauseSupportState;
  quote: EvidenceRef | null;
}

/** The thing a verification is bound to: one file version (and section) for one control. */
export interface EvidenceBinding {
  fileId: string;
  fileName: string;
  versionId: string;
  section?: string;
  quote?: string;
}

export interface PriorVerification {
  actor: string;
  role: string;
  snapshot_id: string;
  fileId: string;
  fileName: string;
  versionId: string;
  verified_at: string;
  event_id: string;
}

// ---------------------------------------------------------------------------
// Findings (model output after validation; spec section 3 steps 6 and 7)
// ---------------------------------------------------------------------------

export interface Finding {
  finding_id: string; // "KEEL-2026-0405"
  control_id: string;
  control_title: string;
  tier: ControlTier;
  materiality: Materiality;
  snapshot_id: string;
  machine_assessment: MachineAssessment;
  change_classification: ChangeClassification;
  basis: string[]; // from recorded operations only
  evidence: EvidenceRef[];
  clause_support: ClauseSupport[];
  prior_evidence: PriorEvidenceRef[];
  verification_holds: boolean;
  acknowledgment_required: boolean;
  acknowledgment_reason?: "evidencing file changed" | "evidencing section changed";
  severity?: Severity;
  not_evaluated_reason?: { code: string; message: string };
  model_id: string;
  inference_profile: string;
  prompt_version: string;
  prompt_hash: string;
  mrm_model_id: string;
  normalization: string;
  box_deep_link?: string;
  suggested_action?: string;
  // Expected values exist only in the fixture file; never read by the app for state.
  expected_display?: string;
  expected_projection_code?: ProjectionCode;
  expected_display_after_human_action?: string;
  expected_projection_code_after_human_action?: ProjectionCode;
}

// ---------------------------------------------------------------------------
// Displayed status (spec section 4, sixteen ordered rules)
// ---------------------------------------------------------------------------

export interface DispositionRecord {
  disposition: HumanDisposition;
  actor: { name: string; role: string; box_user_id?: string };
  recorded_at: string;
  snapshot_id: string;
  binding: EvidenceBinding;
  reason?: string;
  due_at?: string;
  expires_at?: string; // exception_approved
  profile_version?: string;
}

/** Reducer input, exactly as listed in spec section 3 step 13. */
export interface DisplayInputs {
  current_snapshot_id: string;
  current_disposition: DispositionRecord | null; // default unreviewed
  prior_verification: PriorVerification | null; // historical, never installed
  verification_holds: boolean;
  acknowledgment_required: boolean;
  acknowledgment_reason?: "evidencing file changed" | "evidencing section changed";
  machine_assessment: MachineAssessment;
  change_classification: ChangeClassification;
  unsupported_clauses: string[]; // clause text of unsupported required clauses
  evaluation_state: EvaluationState;
  evaluation_reason?: string;
  tier: ControlTier;
  prior_displayed_status?: string; // for strike-through while pending
  current_binding?: EvidenceBinding;
}

export type DisplayKind =
  | "pending_recheck"
  | "not_evaluated"
  | "superseded"
  | "not_applicable"
  | "exception_approved"
  | "exception_expired"
  | "exception_requested"
  | "compensating_control"
  | "returned_to_author"
  | "verified"
  | "verified_holds"
  | "acknowledge"
  | "needs_review_binding"
  | "needs_review_weakened"
  | "needs_review_absent"
  | "needs_review_conflict"
  | "pending_review";

export interface DisplayedStatus {
  rule: number; // 1..16, which ordered rule fired
  kind: DisplayKind;
  label: string; // "Needs review: key-management evidence missing"
  projection_code: ProjectionCode;
  severity?: Severity;
  /** "Verified by Dana Okafor, ARB reviewer, on architecture.md v2, 2026-10-07T15:40:12Z" */
  secondary?: string;
  /** Prior label to render struck through (rule 1). */
  struck?: string;
  /** Who, visually: machine-grey, human-blue, needs-review amber, human-verified green. */
  tone: "grey" | "blue" | "amber" | "green" | "red";
}

// ---------------------------------------------------------------------------
// Ledger (spec section 3 step 9). Append-only, hash chained.
// ---------------------------------------------------------------------------

export type LedgerEventType =
  | "file_version_observed"
  | "snapshot_captured"
  | "texts_fetched"
  | "input_gate"
  | "evaluation_attempt"
  | "evaluation_error"
  | "control_evaluated"
  | "evaluation_completed"
  | "verification_holds"
  | "verification_requires_acknowledgment"
  | "binding_changed"
  | "box_metadata_written"
  | "box_metadata_write_failed"
  | "box_task_created"
  | "box_task_create_failed"
  | "box_task_response_ingested"
  | "human_disposition_recorded"
  | "acknowledgment_recorded"
  | "action_rejected_stale"
  | "action_reapplied"
  | "late_result_recorded"
  | "arb_decision_recorded";

export type ActorType = "human" | "app" | "agent" | "gate" | "boxai";

export interface Actor {
  type: ActorType;
  name: string;
  role?: string;
  box_user_id?: string;
  model_id?: string;
  inference_profile?: string;
  runtime?: string;
}

/**
 * One ledger event. Fixed envelope plus a type-specific tail. The envelope keys
 * are always present (null when not applicable) so every event looks the same
 * in the ledger table and in the export.
 */
export interface LedgerEvent {
  event_id: string; // "EVT-0095"
  ts: string; // UTC ISO, observation time
  phase: "seed" | "live_v3" | "live" | "replay";
  snapshot_id: string | null;
  control_id: string | null;
  event_type: LedgerEventType;
  machine_assessment: MachineAssessment | null;
  prior_machine_assessment: MachineAssessment | null;
  change_classification: ChangeClassification | null;
  actor: Actor;
  fileId: string | null;
  fileName: string | null;
  versionId: string | null;
  contentHash: string | null;
  quote: string | null;
  basis: string[] | null;
  clause_support: ClauseSupport[] | null;
  prompt_hash: string | null;
  projection: { box_metadata: "n/a" | "ok" | "failed" | "deferred" | "ambiguous" };
  mrm_model_id: string;
  normalization: string;
  box_deep_link: string | null;
  chain_hash: string;

  // Machine events carry these, never a human disposition (spec section 4).
  current_disposition?: HumanDisposition;
  prior_verification?: PriorVerification | null;

  // Only on human_disposition_recorded.
  human_disposition?: {
    disposition: HumanDisposition;
    reason?: string;
    due_at?: string;
    binding: EvidenceBinding;
    task_id?: string;
    assignment_id?: string;
    author_task_id?: string;
    attestation_present?: boolean;
  } | null;

  // Type-specific tails (all optional).
  evaluation_id?: string;
  attempt?: number;
  attempts?: number;
  coverage?: Coverage;
  files?: unknown[];
  manifest_hash?: string;
  control_profile_version?: string;
  model_id?: string;
  inference_profile?: string;
  prompt_version?: string;
  evaluation_state?: EvaluationState;
  controls_evaluated?: number;
  outcomes?: { control_id: string; machine_assessment: MachineAssessment; change_classification: ChangeClassification }[];
  error?: { code: string; message: string };
  verification_holds?: boolean;
  materiality?: Materiality;
  note?: string;
  acknowledgment?: { required: boolean; severity?: string; reason?: string };
  previous_binding?: EvidenceRef;
  target?: { type: "folder"; id: string; template: string; instance: string };
  pointer_check?: { current_snapshot_id: string; matches: boolean };
  fields_written?: Record<string, string | null>;
  last_projected_snapshot?: string;
  finding_id?: string;
  task?: BoxTask;
  server_mapping?: TaskMapping;
  response?: BoxTaskResponse;
  reviewer_identity?: { assigned_to: BoxIdentity; source: string };
  mapped_action?: "returned_to_author" | "verified" | "acknowledged" | "rejected";
  freshness_check?: { decision_snapshot_id: string; current_snapshot_id: string; binding_unchanged: boolean; result: "applied" | "reapplied" | "rejected" };
  detail?: unknown;
  decision?: PackageHeader["arb_decision"];
  conditions?: string[];
  edited_before_sending?: boolean;
  drafted_by?: "box_ai_text_gen" | "template";
  [extra: string]: unknown;
}

export interface Ledger {
  folderId: string;
  folderName?: string;
  project: string;
  application_id: string;
  application_tier: string;
  regulatory_scope: string;
  arb_decision: PackageHeader["arb_decision"];
  control_profile: string;
  control_profile_version: string;
  append_only: true;
  scope?: string;
  staleness_rule?: string;
  chain: { algorithm: string; genesis: string; head: string };
  population?: Record<string, number>;
  phases?: Record<string, string>;
  events: LedgerEvent[];
}

// ---------------------------------------------------------------------------
// Box surfaces (spec section 3 steps 10 and 11)
// ---------------------------------------------------------------------------

export interface BoxIdentity {
  id: string;
  login: string;
  name: string;
}

export interface BoxTask {
  task_id: string;
  assignment_id: string;
  action: "review" | "complete";
  fileId: string;
  assignee: string;
  assignee_box_user_id: string;
  finding_id: string;
  control_id: string;
  snapshot_id: string;
  message: string;
  due_at?: string;
  kind?: "reviewer" | "author";
}

export interface TaskMapping {
  task_id: string;
  assignment_id: string;
  finding_id: string;
  control_id: string;
  snapshot_id: string;
  immutable: true;
}

export type BoxResolutionState = "approved" | "rejected" | "completed" | "incomplete";

export interface BoxTaskResponse {
  task_id: string;
  assignment_id: string;
  resolution_state: BoxResolutionState;
  message: string;
  completed_at: string; // Box's time
  ingested_at: string; // Keel's time
  dedup_key: string; // `${assignment_id}|${completed_at}`
  assigned_to?: BoxIdentity;
}

export interface FolderProjection {
  keel_snapshot_id: string;
  keel_last_human_review: string | null; // "name|role|controlId|snapshotId|utc"
  keel_record_url: string;
  statuses: Record<string, ProjectionCode>; // control id -> code
  written_at?: string;
  result: "ok" | "failed" | "ambiguous" | "deferred";
  last_projected_snapshot?: string;
  pointer_check?: { current_snapshot_id: string; matches: boolean };
}

// ---------------------------------------------------------------------------
// Trace (spec section 6, Live trace)
// ---------------------------------------------------------------------------

export type TraceSource = "app" | "agent" | "boxai" | "decider" | "box" | "human";

export interface TraceStep {
  seq?: number;
  source: TraceSource;
  startMs: number;
  durationMs?: number;
  kind: string; // snapshot_captured, texts_fetched, input_gate, prior_quotes_diffed, agent_evaluation, model_turn, tool_call, quotes_validated, findings_applied, ledger_events_written, box_folder_metadata_written, box_task_created, ...
  label: string;
  detail?: unknown;
  ts?: string; // UTC when known
  tool?: string;
  args?: Record<string, unknown>;
  result?: unknown;
  substeps?: TraceStep[];
  model_id?: string;
  inference_profile?: string;
  prompt_version?: string;
  prompt_hash?: string;
  mrm_model_id?: string;
}

export interface Trace {
  run_id: string;
  mode_label: "Live" | "Replay" | "Mock";
  snapshot_id: string;
  prior_snapshot_id?: string;
  started_at: string;
  total_duration_ms: number;
  model_id: string;
  inference_profile: string;
  mrm_model_id: string;
  steps: TraceStep[];
}

// ---------------------------------------------------------------------------
// Input gate (Strands Decider 2B) and Box AI (spec section 3 steps 5 and 6)
// ---------------------------------------------------------------------------

export interface InputGateResult {
  fileId: string;
  fileName: string;
  versionId: string;
  injection: { answer: "yes" | "no"; probability: number };
  material_change: { answer: "evaluate_now" | "batch" | "noise"; probability: number };
  options: ["evaluate_now", "batch", "noise"];
  latency_ms: number;
  quarantined: boolean;
  /** When the gate did not run, the step is omitted from the trace; never a fake "passed". */
  available: boolean;
}

export interface BoxAiCitation extends EvidenceRef {
  validated_against_pinned_text: boolean;
}

export interface BoxAiAskResult {
  query: string;
  mode: "multiple_item_qa";
  include_citations: true;
  files_asked: string[]; // file names
  answer?: string;
  cited_statements: number; // validated citations only
  citations: BoxAiCitation[];
  fallback?: "string_search"; // set when Box AI was unavailable
}

// ---------------------------------------------------------------------------
// Service-level view models (what the UI fetches)
// ---------------------------------------------------------------------------

export interface ControlRow {
  control_id: string;
  title: string;
  tier: ControlTier;
  severity?: Severity;
  reviewer_role: string;
  status: DisplayedStatus;
  evidencing: { fileName: string; versionLabel?: string; versionId: string; section?: string } | null;
  finding_id?: string;
  machine_assessment: MachineAssessment;
  change_classification: ChangeClassification;
  verification_holds: boolean;
  acknowledgment_required: boolean;
  current_disposition: HumanDisposition;
  prior_verification: PriorVerification | null;
  open_task_id?: string;
}

export interface PackageView {
  mode: RunMode;
  header: PackageHeader;
  snapshot: Snapshot;
  prior_snapshot_id?: string;
  profile: { profile_id: string; profile_version: string; name: string };
  evaluation_state: EvaluationState;
  rows: ControlRow[];
  count_line: string; // computed from displayed outcomes, never typed
  counts: Record<string, number>;
  projection: FolderProjection | null;
  trace_run_id?: string;
  elapsed_ms?: number;
  gate: { ran: boolean; label: string }; // "Decider 2B: injection no (0.03)..." or "omitted: Decider not running"
  search_tool: { label: string; fallback: boolean }; // "Box AI ask" or "string search (Box AI unavailable)"
  /** Added: live polling status of Box task responses (absent in mock). */
  poll?: { at: string; ok: boolean; ingested: number; errors: { task_id: string; message: string }[] };
  /** Added: returns to author whose author task waits for the reviewer to approve the draft. */
  awaiting_drafts?: { finding_id: string; control_id: string; task_id: string; target_snapshot_id?: string; updated_at: string }[];
}

export interface FindingCard {
  finding: Finding;
  control: Control;
  profile_version: string;
  row: ControlRow;
  prior_version: {
    file: SnapshotFile;
    uploader?: string;
    verified_by?: string;
    verified_role?: string;
    verified_at?: string;
    section?: string;
    page?: number;
    quote: string;
    deep_link?: string;
    text?: string; // section text for context
  } | null;
  new_version: {
    file: SnapshotFile;
    uploader?: string;
    version_comment?: string;
    section?: string;
    page?: number;
    quote: string | null;
    deep_link?: string;
    text?: string; // section text for the word diff
  } | null;
  related: ControlRow[];
  actions: {
    return_to_author: { enabled: boolean; reason?: string; default_due_at: string; author: string; /** Added */ suggested_reason?: string };
    verify: { enabled: boolean; reason?: string; attestation_phrase: string };
    proposed: ("not_applicable" | "compensating_control" | "exception_requested" | "false_positive")[];
  };
  reviewer: { name: string; role: string; box_user_id: string; source: string };
  binding_fresh: boolean;
  thread: LedgerEvent[];
  trace_steps?: TraceStep[]; // the agent's recorded operations for this control (basis provenance)
  /** Added: time of the first ledger event of this finding. */
  opened_at?: string;
  /** Added: a reviewer's return to author waiting for draft approval (action approve_author_draft). */
  pending_author_draft?: { reason: string; draft?: string; drafted_by?: string; task_id: string; snapshot_id?: string };
}

// ---------------------------------------------------------------------------
// API contracts (see docs/CONTRACTS.md)
// ---------------------------------------------------------------------------

export interface SubmitRequest {
  /** Mock: which fixture upload to play. Live: the Box file id that received a new version. */
  fileId?: string;
  fileName?: string;
  scenario?: "architecture_v3" | "contradiction" | "injection" | "unreadable";
}

export interface SubmitResponse {
  run_id: string;
  snapshot_id: string;
  evaluation_state: EvaluationState;
}

export interface ActionRequest {
  finding_id: string;
  control_id: string;
  decision_snapshot_id: string; // the snapshot the card was opened on
  /** Added "approve_author_draft": the reviewer approves the author-task draft; a waiting return to author resumes. */
  action: "return_to_author" | "verify" | "acknowledge" | "approve_author_draft";
  reason?: string;
  due_at?: string;
  message?: string; // for verify, must include the attestation phrase
  author_message?: string; // reviewer-approved Box AI draft for the author task
  /** Mock only: which configured identity is responding. Live: identity comes from Box. */
  as?: string;
}

export interface ActionResponse {
  result: "applied" | "reapplied" | "rejected";
  explanation?: string;
  events: LedgerEvent[];
  row: ControlRow;
  author_task?: BoxTask;
  count_line: string;
}

export interface ExportManifest {
  exported_at: string;
  run_ids: string[];
  snapshot_ids: string[];
  event_count: number;
  events_hash: string; // sha256 over the exported event bodies in order
  chain_head: string;
  limitation: string;
}

export interface AppConfig {
  mode: RunMode;
  model_id: string;
  inference_profile: string;
  mrm_model_id: string;
  prompt_version: string;
  reviewer: { name: string; role: string; box_user_id: string; login: string };
  author: { name: string; role: string; box_user_id: string; login: string };
  reviewers: { name: string; role: string; box_user_id: string; login: string }[];
  decider: { enabled: boolean; endpoint?: string; /** Added: "mock" labels the gate "Decider 2B (mock)". */ kind?: "mock" | "decider" | "absent" };
  box_ai: { enabled: boolean };
}
