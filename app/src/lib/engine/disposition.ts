/**
 * The human response handler (spec 3 steps 11 and 12; spec 4 "Rules enforced by code"). It is the
 * only writer of a human disposition. Input: a Box task assignment as returned by Box plus the
 * immutable server-side task mapping. Checks, in order:
 *   1. dedup on `${assignment_id}|${completed_at}`: a second delivery is an attempt record only
 *      (no second disposition, no second author task; acceptance 12);
 *   2. responding identity (assigned_to as returned by Box) is on the configured reviewer list and
 *      is not the configured author;
 *   3. binding freshness: a decision made on an older snapshot is re-applied when the control's
 *      binding is unchanged (action_reapplied) and rejected with what changed otherwise
 *      (action_rejected_stale; acceptance 8); a response that a newer human decision already
 *      superseded is recorded as history only (late_result_recorded; acceptance 9);
 *   4. resolution mapping: rejected + message -> returned_to_author, only after the author task
 *      exists (else Confirm-finding fallback: acknowledgment only; acceptance 18); approved +
 *      attestation phrase -> verified only if every required clause is supported on the current
 *      snapshot and the assessment is not contradicted (acceptance 14); completed -> acknowledgment.
 * Every path writes box_task_response_ingested with the identity, Box completed_at and Keel
 * ingested_at, the dedup key, the mapped action and the freshness check. After a disposition the
 * projection is rewritten with the pointer check.
 */
import type { BoxAdapter, BoxTaskAssignmentView } from "../box/adapter";
import type { KeelConfig } from "../config";
import type { Store, StoredTask } from "../store";
import type { BoxTask, BoxTaskResponse, ControlProfile, EvidenceRef, LedgerEvent, TaskMapping } from "../types";
import { bindingsEqual, verifyPrecondition } from "./assess";
import { clauseNoun } from "./display";
import { listJoin } from "./basis";
import { utcNow } from "./ledger";
import { quoteValid } from "./normalize";
import { APP_ACTOR, eventOpts, publishProjection } from "./publish";
import { deriveControlState, latestVerification, snapshotEvaluationState, verificationBinding, type ControlState } from "./state";
import { draftFromBrief, type AuthorDraftBrief } from "./draft";

export const REVIEWER_IDENTITY_SOURCE = "identity as returned by Box (task assignment assigned_to)";

// ------------------------------------------------------------------------------------------------
// Business days (profile default remediation window)
// ------------------------------------------------------------------------------------------------

/** N business days after `from` (UTC, Saturday and Sunday skipped), at 17:00:00Z. 2026-10-17 + 5 -> 2026-10-23T17:00:00Z. */
export function addBusinessDays(from: Date, days: number): string {
  const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate(), 17, 0, 0));
  let left = days;
  while (left > 0) {
    d.setUTCDate(d.getUTCDate() + 1);
    const wd = d.getUTCDay();
    if (wd !== 0 && wd !== 6) left--;
  }
  return d.toISOString().replace(/\.\d{3}Z$/, "Z");
}

// ------------------------------------------------------------------------------------------------
// Author message draft (Box AI text generation, template fallback)
// ------------------------------------------------------------------------------------------------

export function authorDraftBrief(store: Store, st: ControlState, reviewer: { name: string; role: string }, reason: string): AuthorDraftBrief {
  const pvEvent = latestVerification(store.events, st.control.id);
  const pb = verificationBinding(store, pvEvent);
  const snap = store.snapshot(st.snapshot_id);
  const newFile = pb ? snap?.files.find((f) => f.fileId === pb.fileId) : undefined;
  const newText = newFile ? store.text(newFile.versionId) : undefined;
  const priorQuotes = (pvEvent?.clause_support ?? []).flatMap((c) => (c.quote ? [c.quote.quote] : []));
  const lost = [...new Set(priorQuotes)].filter((q) => !newText || !quoteValid(q, newText));
  const uns = st.clause_support.filter((c) => c.support !== "supported").map((c) => c.clause);
  return {
    reviewer: reviewer.name,
    reviewer_role_short: reviewer.role.split(",")[0].trim(),
    reason,
    fileName: pb?.fileName ?? st.binding?.fileName ?? "",
    section_number: (pb?.section ?? st.binding?.section ?? "").split(" ")[0],
    new_version_label: newFile ? (newFile.versionLabel ?? store.versionLabel(newFile.fileId, newFile.versionId) ?? newFile.versionId) : "",
    lost_quotes: lost,
    focus: uns.length ? clauseNoun(uns.find((u) => /key management model/i.test(u)) ?? uns[0]) : "evidence",
  };
}

export async function draftAuthorMessage(args: { store: Store; box: BoxAdapter; config: KeelConfig; st: ControlState; reason: string }): Promise<{ text: string; drafted_by: "box_ai_text_gen" | "template" }> {
  const { store, box, config, st, reason } = args;
  const brief = authorDraftBrief(store, st, config.reviewer, reason);
  const uns = st.clause_support.filter((c) => c.support !== "supported").map((c) => clauseNoun(c.clause));
  const prompt = [
    `Draft a short Box task message to the author of ${brief.fileName} for control ${st.control.id} (${st.control.title}).`,
    `Quote the reviewer's reason verbatim, quote the sentences lost from ${brief.fileName} ${brief.section_number} in ${brief.new_version_label}, and ask the author to restore them or cite where the ${brief.focus} is now documented.`,
    `Unsupported clauses: ${listJoin(uns)}. Requirement: ${st.control.requirement}`,
    `<keel-draft>${JSON.stringify(brief)}</keel-draft>`,
  ].join("\n");
  const fileIds = [st.binding?.fileId ?? brief.fileName].filter(Boolean);
  try {
    const r = await box.aiTextGen(fileIds, prompt);
    if (!("unavailable" in r && r.unavailable)) return { text: (r as { text: string }).text, drafted_by: "box_ai_text_gen" };
  } catch {
    /* fall through to the labelled template */
  }
  return { text: draftFromBrief(brief), drafted_by: "template" };
}

// ------------------------------------------------------------------------------------------------
// Ingestion
// ------------------------------------------------------------------------------------------------

export interface IngestInput {
  view: BoxTaskAssignmentView;
  mapping: TaskMapping;
  /** The snapshot the reviewer's card was opened on (mock /api/action); defaults to the task's snapshot. */
  decision_snapshot_id?: string;
  /** Reviewer-approved draft for the author task (stored verbatim). */
  author_message?: string;
  due_at?: string;
}

export interface IngestResult {
  result: "applied" | "reapplied" | "rejected" | "duplicate" | "recorded" | "ignored";
  mapped_action: "returned_to_author" | "verified" | "acknowledged" | "rejected" | null;
  explanation: string;
  events: LedgerEvent[];
  author_task?: BoxTask;
  fallback?: "confirm_finding";
}

export interface DispositionDeps {
  store: Store;
  box: BoxAdapter;
  profile: ControlProfile;
  config: KeelConfig;
  now?: () => Date;
}

const bindingText = (store: Store, b: EvidenceRef | null) => (b ? `${b.fileName} ${b.versionLabel ?? store.versionLabel(b.fileId, b.versionId) ?? b.versionId} ${b.section.split(" ")[0]}`.trim() : "no binding");

export async function ingestTaskResponse(deps: DispositionDeps, input: IngestInput): Promise<IngestResult> {
  const { store, box, profile, config } = deps;
  const now = deps.now ?? (() => new Date());
  const opts = eventOpts(config);
  const events: LedgerEvent[] = [];
  const append = (e: Parameters<Store["append"]>[0]) => {
    const ev = store.append({ phase: "live", ...e }, opts);
    events.push(ev);
    return ev;
  };
  const { view, mapping } = input;
  if (view.resolution_state === "incomplete" || !view.completed_at) {
    return { result: "ignored", mapped_action: null, explanation: "assignment not resolved yet", events };
  }
  const control = profile.controls.find((c) => c.id === mapping.control_id);
  if (!control) throw new Error(`disposition: mapping names unknown control ${mapping.control_id}`);
  const ingested_at = utcNow(now());
  const dedup_key = `${view.assignment_id}|${view.completed_at}`;
  const response: BoxTaskResponse = {
    task_id: mapping.task_id,
    assignment_id: view.assignment_id,
    resolution_state: view.resolution_state,
    message: view.message,
    completed_at: view.completed_at,
    ingested_at,
    dedup_key,
  };
  const reviewer_identity = { assigned_to: view.assigned_to, source: REVIEWER_IDENTITY_SOURCE };
  const base = { actor: APP_ACTOR, control_id: control.id, finding_id: mapping.finding_id, response, reviewer_identity };

  // 1. Dedup (acceptance 12).
  if (store.data.dedup_keys.includes(dedup_key)) {
    append({
      event_type: "box_task_response_ingested",
      snapshot_id: mapping.snapshot_id,
      ...base,
      duplicate: true,
      mapped_action: "rejected",
      note: "duplicate delivery of the same response (same assignment id and completed_at): recorded as an attempt; no second disposition and no second author task",
    });
    return { result: "duplicate", mapped_action: null, explanation: "Duplicate delivery recorded as an attempt; nothing applied twice.", events };
  }

  // 2. Identity: on the configured reviewer list, not the configured author.
  const who = view.assigned_to;
  const reviewer = config.reviewers.find((r) => r.box_user_id === who.id || r.login === who.login);
  const isAuthor = config.author.box_user_id === who.id || config.author.login === who.login;
  const attestation = view.message.includes(profile.attestation_phrase);
  let mapped: IngestResult["mapped_action"] =
    view.resolution_state === "rejected" && view.message.trim()
      ? "returned_to_author"
      : view.resolution_state === "approved" && attestation
        ? "verified"
        : "acknowledged";
  const checks: Record<string, boolean | null> = {
    reviewer_on_configured_list: !!reviewer,
    reviewer_is_not_author: !isAuthor,
    binding_current: null,
    all_clauses_supported: null,
    attestation_present: view.resolution_state === "approved" ? attestation : null,
  };

  // 3. Freshness against the authoritative current snapshot.
  const current = store.data.current_snapshot_id ?? mapping.snapshot_id;
  const decision = input.decision_snapshot_id ?? mapping.snapshot_id;
  const decisionState = deriveControlState(store, control, decision);
  const currentState = deriveControlState(store, control, current);
  const unchanged = bindingsEqual(decisionState.binding, currentState.binding);
  const pending = snapshotEvaluationState(store.events, current).state === "pending";
  let freshness: "applied" | "reapplied" | "rejected" = decision === current ? "applied" : unchanged ? "reapplied" : "rejected";
  if (pending) freshness = "rejected";
  checks.binding_current = freshness !== "rejected";
  const freshness_check = { decision_snapshot_id: decision, current_snapshot_id: current, binding_unchanged: decision === current || unchanged, result: freshness };

  let rejection: string | null = null;
  if (!reviewer) rejection = `${who.name} (${who.id}) is not on the configured reviewer list`;
  else if (isAuthor) rejection = `${who.name} is the configured author of the evidencing file and cannot review it`;
  else if (pending) rejection = `snapshot ${current} is being re-checked; respond again when the evaluation completes`;

  // A newer human decision on the current snapshot already exists: this response is history only (acceptance 9).
  // Compare on Box's clock: the completed_at behind the standing decision vs this response's completed_at.
  const standing = currentState.current_disposition_event;
  const standingAt = standing ? ((standing.response_times as { box_completed_at?: string } | undefined)?.box_completed_at ?? standing.ts) : null;
  const supersededBy = !rejection && decision !== current && standing && standingAt && standingAt > (view.completed_at ?? "") ? standing : null;

  // Verify preconditions on the snapshot the disposition would be recorded on.
  const target = freshness === "applied" ? decisionState : currentState;
  if (!rejection && !supersededBy && mapped === "verified") {
    const pre = verifyPrecondition(target.machine_assessment, target.clause_support);
    checks.all_clauses_supported = pre.unsupported.length === 0 && target.clause_support.length > 0;
    if (!pre.ok) {
      rejection =
        pre.reason === "contradicted"
          ? "Verify is blocked: the machine assessment is evidence_contradicted; a new snapshot must resolve the conflict"
          : pre.reason === "not_evaluated"
            ? "Verify is blocked: the control is not evaluated on this snapshot"
            : `Verify is blocked: no validated quote supports the ${listJoin(pre.unsupported.map((c) => clauseNoun(c.clause)), "or")} clause`;
    }
  }
  if (!rejection && !supersededBy && freshness === "rejected") {
    rejection = `binding changed since the decision: ${bindingText(store, decisionState.binding)} on ${decision} is now ${bindingText(store, currentState.binding)} on ${current}`;
  }
  if (rejection || supersededBy) mapped = supersededBy ? mapped : "rejected";

  append({
    event_type: "box_task_response_ingested",
    snapshot_id: decision,
    ...base,
    mapped_action: mapped,
    attestation_present: attestation,
    checks,
    freshness_check,
    ...(rejection ? { rejection } : {}),
  });
  store.data.dedup_keys.push(dedup_key);
  const task = store.data.tasks.find((t) => t.task_id === mapping.task_id);
  if (task) {
    task.status = "completed";
    task.resolution_state = view.resolution_state;
    task.response = { ...response, assigned_to: who };
    task.completed_at = view.completed_at;
  }
  store.save();

  if (supersededBy) {
    append({
      event_type: "late_result_recorded",
      snapshot_id: decision,
      actor: APP_ACTOR,
      control_id: control.id,
      finding_id: mapping.finding_id,
      superseded_by: supersededBy.event_id,
      current_snapshot_id: current,
      note: `response for ${decision} arrived after ${supersededBy.event_id} on ${current}; recorded as history, displayed status unchanged`,
    });
    return { result: "recorded", mapped_action: null, explanation: `Recorded as history: a newer decision (${supersededBy.event_id}) on ${current} stands.`, events };
  }
  if (rejection) {
    if (freshness === "rejected" && !pending && reviewer && !isAuthor) {
      append({
        event_type: "action_rejected_stale",
        snapshot_id: current,
        actor: APP_ACTOR,
        control_id: control.id,
        finding_id: mapping.finding_id,
        freshness_check,
        previous_binding: decisionState.binding,
        current_binding: currentState.binding,
        explanation: rejection,
      });
    }
    return { result: "rejected", mapped_action: "rejected", explanation: rejection, events };
  }

  if (freshness === "reapplied") {
    append({
      event_type: "action_reapplied",
      snapshot_id: current,
      actor: APP_ACTOR,
      control_id: control.id,
      finding_id: mapping.finding_id,
      freshness_check,
      note: `decision made on ${decision}; binding ${bindingText(store, currentState.binding)} unchanged on ${current}, so the action is applied to ${current}`,
    });
  }
  const snap = target.snapshot_id;
  const human = { type: "human" as const, name: reviewer!.name, role: reviewer!.role, box_user_id: reviewer!.box_user_id };
  const b = target.binding;
  const via = { channel: "Box task", task_id: mapping.task_id, assignment_id: view.assignment_id, resolution_state: view.resolution_state };
  const contentHash = b ? store.snapshot(snap)?.files.find((f) => f.versionId === b.versionId)?.contentHash ?? null : null;
  const dispBase = {
    event_type: "human_disposition_recorded" as const,
    actor: human,
    snapshot_id: snap,
    control_id: control.id,
    finding_id: target.finding_id ?? mapping.finding_id,
    machine_assessment: target.machine_assessment,
    change_classification: target.change_classification,
    fileId: b?.fileId ?? null,
    fileName: b?.fileName ?? null,
    versionId: b?.versionId ?? null,
    contentHash,
    quote: b?.quote ?? null,
    clause_support: target.clause_support,
    comment: view.message,
    via,
    reviewer_identity,
    response_times: { box_completed_at: view.completed_at, keel_ingested_at: ingested_at },
    dedup_key,
    freshness_check: { ...freshness_check, result: freshness === "applied" ? "pass" : "reapplied" },
    projection: { box_metadata: "pending" as const },
  };

  if (mapped === "acknowledged") {
    append({
      event_type: "acknowledgment_recorded",
      snapshot_id: snap,
      actor: human,
      control_id: control.id,
      finding_id: mapping.finding_id,
      comment: view.message,
      via,
      reviewer_identity,
      note:
        view.resolution_state === "approved"
          ? "approved without the attestation phrase: recorded as an acknowledgment; no disposition"
          : "task completed: acknowledgment recorded; no disposition; the row label is unchanged",
    });
    return { result: freshness === "reapplied" ? "reapplied" : "applied", mapped_action: "acknowledged", explanation: "Acknowledgment recorded; no disposition written.", events };
  }

  if (mapped === "verified") {
    const pvEvent = latestVerification(store.events, control.id);
    const rebinding = pvEvent && b && !bindingsEqual({ fileId: pvEvent.fileId, versionId: pvEvent.versionId, quote: pvEvent.quote }, b) ? `re-verified on ${b.fileName} ${b.versionLabel ?? store.versionLabel(b.fileId, b.versionId)}` : undefined;
    append({
      ...dispBase,
      human_disposition: "verified" as never,
      disposition_detail: { disposition: "verified", binding: b, task_id: mapping.task_id, assignment_id: view.assignment_id, attestation_present: true },
      checks,
      ...(rebinding ? { rebinding } : {}),
    });
    await publishProjection({ store, box, profile, config, snapshotId: snap, extra: { phase: "live" } }).then((r) => events.push(r.event));
    return { result: freshness === "reapplied" ? "reapplied" : "applied", mapped_action: "verified", explanation: freshness === "reapplied" ? `Verified, re-applied to ${snap}: the binding is unchanged.` : `Verified on ${bindingText(store, b)}.`, events };
  }

  // returned_to_author: the author task first, the disposition only after it exists.
  const due_at = input.due_at ?? addBusinessDays(now(), profile.default_remediation_window_business_days);
  const draft = input.author_message ? null : await draftAuthorMessage({ store, box, config, st: target, reason: view.message });
  const stored = store.data.drafts[mapping.finding_id];
  const authorMessage = input.author_message ?? draft!.text;
  const drafted_by = input.author_message ? (stored?.drafted_by ?? "box_ai_text_gen") : draft!.drafted_by;
  const edited_before_sending = input.author_message ? !!stored && stored.text !== input.author_message : false;
  const lost_clauses = target.clause_support.filter((c) => c.support !== "supported").map((c) => c.clause);
  const authorFileId = b?.fileId ?? target.prior_verification?.fileId ?? "";
  let authorTask: StoredTask | null = null;
  try {
    const { task_id } = await box.createTask(authorFileId, authorMessage, "complete", due_at);
    const asg = await box.assignTask(task_id, { id: config.author.box_user_id });
    authorTask = {
      task_id,
      assignment_id: asg.assignment_id,
      action: "complete",
      kind: "author",
      fileId: authorFileId,
      assignee: asg.assigned_to.name,
      assignee_box_user_id: asg.assigned_to.id,
      finding_id: mapping.finding_id,
      control_id: control.id,
      snapshot_id: snap,
      message: authorMessage,
      due_at,
      due_rule: `${profile.default_remediation_window_business_days} business days (profile default remediation window)`,
      drafted_by,
      status: "open",
      created_at: utcNow(now()),
    };
  } catch (err) {
    // Confirm-finding fallback (acceptance 18): acknowledgment only, row unchanged, routing proposed.
    append({
      event_type: "box_task_create_failed",
      snapshot_id: snap,
      actor: APP_ACTOR,
      control_id: control.id,
      finding_id: mapping.finding_id,
      error: { code: "AUTHOR_TASK_CREATE_FAILED", message: err instanceof Error ? err.message : String(err) },
      intended: { kind: "author", assignee: config.author.name, due_at },
    });
    append({
      event_type: "acknowledgment_recorded",
      snapshot_id: snap,
      actor: human,
      control_id: control.id,
      finding_id: mapping.finding_id,
      comment: view.message,
      via,
      reviewer_identity,
      fallback: "confirm_finding",
      author_routing: "proposed",
      note: "Confirm finding: the reviewer's finding is recorded against these versions; author task creation failed, so no disposition is written and the row keeps its Needs review label. Routing to the author is proposed.",
    });
    return {
      result: "applied",
      mapped_action: "acknowledged",
      fallback: "confirm_finding",
      explanation: "Author task creation failed: recorded Confirm finding (acknowledgment), no disposition; routing to the author is proposed.",
      events,
    };
  }
  const mappingB: TaskMapping = { task_id: authorTask.task_id, assignment_id: authorTask.assignment_id, finding_id: mapping.finding_id, control_id: control.id, snapshot_id: snap, immutable: true };
  store.data.tasks.push(authorTask);
  store.data.task_mappings[authorTask.assignment_id] = Object.freeze(mappingB) as TaskMapping;
  const { status: _s, created_at: _c, ...boxTask } = authorTask;
  append({
    event_type: "box_task_created",
    snapshot_id: snap,
    actor: APP_ACTOR,
    control_id: control.id,
    finding_id: mapping.finding_id,
    task: { ...boxTask, message_drafted_by: drafted_by === "box_ai_text_gen" ? "Box AI text generation from the finding and the reviewer's reason" : "template (Box AI text generation unavailable)", shown_to_reviewer_before_sending: !!input.author_message, stored_verbatim: true } as never,
    drafted_by,
    edited_before_sending,
    lost_clauses,
    server_mapping: mappingB,
  });
  append({
    ...dispBase,
    human_disposition: "returned_to_author" as never,
    disposition_detail: { disposition: "returned_to_author", reason: view.message, due_at, binding: b, task_id: mapping.task_id, assignment_id: view.assignment_id, author_task_id: authorTask.task_id },
    checks,
    due_at,
    author_task_id: authorTask.task_id,
    recorded_after: "author task created successfully",
  });
  await publishProjection({ store, box, profile, config, snapshotId: snap, extra: { phase: "live" } }).then((r) => events.push(r.event));
  return {
    result: freshness === "reapplied" ? "reapplied" : "applied",
    mapped_action: "returned_to_author",
    explanation: `${freshness === "reapplied" ? `Re-applied to ${snap} (binding unchanged). ` : ""}Returned to author: task ${authorTask.task_id} for ${authorTask.assignee}, due ${due_at}.`,
    events,
    author_task: boxTask as BoxTask,
  };
}

/** Live and mock: poll every open task mapping and ingest resolved assignments through the same handler. */
export async function pollAssignments(deps: DispositionDeps): Promise<IngestResult[]> {
  const out: IngestResult[] = [];
  for (const t of deps.store.data.tasks.filter((x) => x.status === "open" && (x.kind ?? "reviewer") === "reviewer")) {
    const mapping = deps.store.data.task_mappings[t.assignment_id];
    if (!mapping) continue;
    const views = await deps.box.listTaskAssignments(t.task_id);
    for (const v of views) if (v.assignment_id === t.assignment_id && v.resolution_state !== "incomplete" && v.completed_at) out.push(await ingestTaskResponse(deps, { view: v, mapping }));
  }
  return out;
}
