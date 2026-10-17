/**
 * Box review tasks (spec 3 step 11): one task of action "review" per finding that needs review or
 * acknowledgment, attached to the evidencing file, assigned to the configured reviewer, with the
 * finding id and snapshot id in the message. The immutable server-side mapping from task id and
 * assignment id to finding, control and snapshot is stored; ids in the message are for the human.
 * A quarantined file (input gate) also gets a reviewer task.
 */
import type { BoxAdapter } from "../box/adapter";
import { boxAssignee, type KeelConfig } from "../config";
import type { Store, StoredTask } from "../store";
import type { Control, ControlProfile, InputGateResult, LedgerEvent, TaskMapping } from "../types";
import { clauseNoun, NEEDS_REVIEW_KINDS } from "./display";
import { listJoin } from "./basis";
import { APP_ACTOR } from "./publish";
import { buildRows, type RowWithState } from "./state";
import { utcNow } from "./ledger";
import { bindingsEqual } from "./assess";

const KIND_PRIORITY: Record<string, number> = { needs_review_weakened: 0, needs_review_absent: 0, needs_review_conflict: 0, needs_review_binding: 1, acknowledge: 2, pending_review: 3 };
const TIER_PRIORITY: Record<string, number> = { Critical: 0, High: 1, Medium: 2 };
const sec = (s?: string) => (s ?? "").split(" ")[0];
const date = (iso?: string) => (iso ?? "").slice(0, 10);

/** Task message for the reviewer (fixture TASK_A, TASK_C, TASK_D style). */
export function reviewTaskMessage(row: RowWithState, store: Store): string {
  const st = row.state;
  const head = `${row.finding_id} (snapshot ${st.snapshot_id}): ${row.control_id}`;
  const b = st.binding;
  const bl = b ? `${b.fileName} ${b.versionLabel ?? store.versionLabel(b.fileId, b.versionId) ?? ""}`.trim() : "";
  const pv = st.prior_verification;
  const pvLabel = pv ? store.versionLabel(pv.fileId, pv.versionId) ?? pv.versionId : "";
  switch (row.status.kind) {
    case "needs_review_weakened": {
      const sup = st.clause_support.filter((c) => c.support === "supported");
      const uns = st.clause_support.filter((c) => c.support !== "supported").map((c) => clauseNoun(c.clause));
      const s0 = sup[0];
      const still = s0?.quote ? `${clauseNoun(s0.clause).replace(/^./, (x) => x.toUpperCase())} is still stated in ${bl} ${sec(s0.quote.section)}, but the ` : "The ";
      return `${head} ${st.control.title} needs review. ${still}${listJoin(uns)} ${uns.length === 1 ? "has" : "have"} no support.${pv ? ` ${pv.actor} verified the ${pvLabel} sentence on ${date(pv.verified_at)}.` : ""}`;
    }
    case "needs_review_absent":
      return `${head} ${st.control.title} needs review: no readable file in snapshot ${st.snapshot_id} supports any required clause.${pv ? ` ${pv.actor} verified the ${pvLabel} evidence on ${date(pv.verified_at)}.` : ""}`;
    case "needs_review_conflict": {
      const cq = (st.evaluation_event?.conflicting_quote as { fileName: string; section: string } | undefined) ?? undefined;
      return `${head} ${st.control.title} needs review: conflicting evidence. ${bl} ${sec(b?.section)} conflicts with ${cq ? `${cq.fileName} ${sec(cq.section)}` : "another file in the snapshot"}. Verify is blocked until a new snapshot resolves it.`;
    }
    case "needs_review_binding": {
      const prior = pv ? `${pv.fileName}` : "the prior evidencing file";
      const priorNow = pv ? store.snapshot(st.snapshot_id)?.files.find((f) => f.fileId === pv.fileId) : undefined;
      const priorNowLabel = priorNow ? ` ${priorNow.versionLabel ?? store.versionLabel(priorNow.fileId, priorNow.versionId) ?? ""}`.trimEnd() : "";
      return `${head} evidence binding changed (Low). The bound sentence left ${prior}${priorNowLabel}; the same support is in ${bl} ${sec(b?.section)}. Confirm the new binding.`;
    }
    case "acknowledge":
      return st.acknowledgment_reason === "evidencing section changed"
        ? `${head} Acknowledge: evidencing section changed, ${sec(b?.section)} text differs around an unchanged quote.`
        : `${head} Acknowledge: evidencing file changed, ${bl} differs from the verified ${pvLabel} around an unchanged quote.`;
    case "pending_review":
      return `${head} ${st.control.title}: first review. Every required clause is supported in ${bl} ${sec(b?.section)}; verify with the attestation phrase or return to author.`;
    default:
      return `${head} ${row.status.label}.`;
  }
}

/** Suggested action, derived by code from the displayed outcome (the model's suggestion is kept separately). */
export function suggestedAction(row: RowWithState, control: Control, store: Store): string {
  const st = row.state;
  const b = st.binding;
  const bl = b ? `${b.fileName} ${b.versionLabel ?? store.versionLabel(b.fileId, b.versionId) ?? ""}`.trim() : "";
  switch (row.status.kind) {
    case "verified_holds":
      return "None. The prior verification holds.";
    case "acknowledge":
      return st.acknowledgment_reason === "evidencing section changed"
        ? `Acknowledge (${control.tier}): the cited quote is unchanged but the surrounding ${sec(b?.section)} text changed; confirm the section still supports the control.`
        : `Acknowledge (${control.tier}): ${bl} changed around an unchanged quote; confirm the evidence still supports the control.`;
    case "needs_review_binding":
      return `Acknowledge the new binding (Low): confirm ${bl} ${sec(b?.section)} as the evidence of record.`;
    case "needs_review_weakened": {
      const uns = st.clause_support.filter((c) => c.support !== "supported").map((c) => clauseNoun(c.clause));
      return `Return to author: restore the ${listJoin(uns)} statement${uns.length === 1 ? "" : "s"}${b ? ` in ${sec(b.section)}` : ""} (${control.standard}). Verify stays unavailable until every required clause has a supporting quote.`;
    }
    case "needs_review_absent":
      return `Return to author: no file in the package supports any required clause (${control.standard}).`;
    case "needs_review_conflict":
      return "Resolve the conflict with a new document version; Verify is blocked while the evidence conflicts.";
    case "not_evaluated":
      return `Resolve the input issue and re-run: ${st.evaluation_reason ?? "not evaluated"}.`;
    case "pending_review":
      return "Review the cited evidence, then Verify or Return to author.";
    default:
      return row.status.label;
  }
}

export async function createReviewTasks(args: {
  store: Store;
  box: BoxAdapter;
  profile: ControlProfile;
  config: KeelConfig;
  snapshotId: string;
  runId?: string;
  quarantined?: Pick<InputGateResult, "fileId" | "fileName" | "versionId" | "injection">[];
  append: (input: Parameters<Store["append"]>[0]) => LedgerEvent;
}): Promise<{ created: StoredTask[]; failed: string[]; carried: StoredTask[] }> {
  const { store, box, profile, config, snapshotId, append } = args;
  const carried: StoredTask[] = [];
  // An open review task whose binding is unchanged on this snapshot is carried over, not duplicated:
  // the reviewer's response is re-applied to the new snapshot by the freshness check (spec 3 step 12).
  const carriedOver = (r: RowWithState) => {
    const open = [...store.data.tasks].reverse().find((t) => t.control_id === r.control_id && (t.kind ?? "reviewer") === "reviewer" && t.status === "open" && !(t as { purpose?: string }).purpose);
    if (!open) return false;
    if (open.snapshot_id === snapshotId) return true; // a retry attempt: the task already exists

    const then = buildRows(store, profile, open.snapshot_id, { withPrior: false }).find((x) => x.control_id === r.control_id);
    if (!then || !bindingsEqual(then.state.binding, r.state.binding) || then.status.kind !== r.status.kind) return false;
    carried.push(open);
    return true;
  };
  const rows = buildRows(store, profile, snapshotId)
    // Pending review (supported, never verified) also gets a task, so a fresh baseline can be verified (Codex finding 4).
    .filter((r) => NEEDS_REVIEW_KINDS.includes(r.status.kind) || r.status.kind === "pending_review")
    .filter((r) => !carriedOver(r))
    .sort((a, b) => KIND_PRIORITY[a.status.kind] - KIND_PRIORITY[b.status.kind] || TIER_PRIORITY[a.tier] - TIER_PRIORITY[b.tier]);
  const plan: { row?: RowWithState; fileId: string; versionId?: string; control_id: string; finding_id: string; message: string }[] = rows.map((r) => ({
    row: r,
    fileId: r.state.binding?.fileId ?? r.state.prior_verification?.fileId ?? "",
    control_id: r.control_id,
    finding_id: r.finding_id ?? "",
    message: reviewTaskMessage(r, store),
  }));
  for (const q of args.quarantined ?? []) {
    const already = store.data.tasks.some((t) => t.status === "open" && (t as { purpose?: string }).purpose === "input_gate_quarantine" && t.fileId === q.fileId && (t as { versionId?: string }).versionId === q.versionId);
    if (already) continue;
    const all = buildRows(store, profile, snapshotId).filter((r) => r.state.not_evaluated_reason?.code === "input_gate" && r.state.evaluation_event?.fileId === q.fileId);
    if (!all.length) continue;
    const label = store.versionLabel(q.fileId, q.versionId) ?? q.versionId;
    plan.push({
      fileId: q.fileId,
      versionId: q.versionId,
      control_id: all[0].control_id,
      finding_id: all[0].finding_id ?? "",
      message: `Snapshot ${snapshotId}: ${q.fileName} ${label} was quarantined by the input gate (instructions addressed to an AI agent, p=${q.injection.probability.toFixed(2)}). Its text was not sent to the evaluator; ${all.map((r) => r.control_id).join(", ")} ${all.length === 1 ? "is" : "are"} Not evaluated. Review the file. Findings: ${all.map((r) => r.finding_id).join(", ")}.`,
    });
  }
  const created: StoredTask[] = [];
  const failed: string[] = [];
  for (const p of plan) {
    try {
      const { task_id } = await box.createTask(p.fileId, p.message, "review");
      // Assign by tenant id when configured, else by login; record the identity Box returns (Codex finding 9).
      const asg = await box.assignTask(task_id, boxAssignee(config.reviewer, config.mockMode));
      const task: StoredTask = {
        task_id,
        assignment_id: asg.assignment_id,
        action: "review",
        fileId: p.fileId,
        assignee: asg.assigned_to.name,
        assignee_box_user_id: asg.assigned_to.id,
        finding_id: p.finding_id,
        control_id: p.control_id,
        snapshot_id: snapshotId,
        message: p.message,
        kind: "reviewer",
        status: "open",
        created_at: utcNow(),
        ...(p.row ? {} : { purpose: "input_gate_quarantine", versionId: p.versionId }),
      };
      const mapping: TaskMapping = { task_id, assignment_id: asg.assignment_id, finding_id: p.finding_id, control_id: p.control_id, snapshot_id: snapshotId, immutable: true };
      store.data.tasks.push(task);
      store.data.task_mappings[asg.assignment_id] = Object.freeze(mapping) as TaskMapping;
      const { status: _s, created_at: _c, ...boxTask } = task;
      append({ event_type: "box_task_created", actor: APP_ACTOR, snapshot_id: snapshotId, control_id: p.control_id, finding_id: p.finding_id, task: boxTask, server_mapping: mapping });
      created.push(task);
    } catch (err) {
      failed.push(p.control_id);
      append({
        event_type: "box_task_create_failed",
        actor: APP_ACTOR,
        snapshot_id: snapshotId,
        control_id: p.control_id,
        finding_id: p.finding_id,
        error: { code: "BOX_TASK_CREATE_FAILED", message: err instanceof Error ? err.message : String(err) },
      });
    }
  }
  return { created, failed, carried };
}
