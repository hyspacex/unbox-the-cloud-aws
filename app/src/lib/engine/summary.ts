/**
 * UI v4 read-model wording (design doc 50, sections 2.1, 2.3 and 2.4): which rows need a human, the
 * owl's summary sentence, the Box file list with per-file decision counts, and the three-line receipt
 * under a recorded decision. Everything is computed from the rows' displayed status and the ledger;
 * nothing here decides a status. Machine text passes the wording filter.
 */
import type { Store } from "../store";
import type { ControlRow, DisplayKind, FindingReceipt, LedgerEvent, PackageFile, Severity, Snapshot, StatusCard } from "../types";
import { capWords } from "./display";
import { bannedWords } from "./wording";
import type { RowWithState } from "./state";

export const SUMMARY_MAX_WORDS = 12;

/** Displayed kinds that wait for a human decision (the owl badge), unless one is already recorded. */
export const OPEN_DECISION_KINDS: DisplayKind[] = [
  "needs_review_weakened",
  "needs_review_absent",
  "needs_review_conflict",
  "needs_review_binding",
  "acknowledge",
  "pending_review",
  "not_evaluated",
];

/** Displayed kinds that are themselves a human disposition on the current snapshot. */
const DISPOSITION_KINDS: DisplayKind[] = ["verified", "returned_to_author", "not_applicable", "compensating_control", "exception_requested", "exception_approved", "exception_expired"];

/** The latest acknowledgment a human recorded for this control on this snapshot (an acknowledgment writes no disposition). */
export function acknowledgmentOn(store: Store, controlId: string, snapshotId: string): LedgerEvent | null {
  for (let i = store.events.length - 1; i >= 0; i--) {
    const e = store.events[i];
    if (e.control_id === controlId && e.snapshot_id === snapshotId && e.event_type === "acknowledgment_recorded" && e.actor.type === "human") return e;
  }
  return null;
}

/** Row-level view used by the counts: a public row plus whether a human acknowledgment is recorded on its snapshot. */
type RowLike = Pick<ControlRow, "control_id" | "status" | "severity" | "evidencing" | "needs_decision" | "decision_recorded">;

/** A human decision recorded on the row's snapshot: a disposition shown by the row, or an acknowledgment. */
export function recordedOnRow(row: RowLike, acknowledged: boolean): boolean {
  // Codex 23: a recorded row flag (a run's outcome) is authoritative; never re-derived from the live ledger.
  if (row.decision_recorded !== undefined) return row.decision_recorded;
  if (DISPOSITION_KINDS.includes(row.status.kind)) return true;
  if (acknowledgedHolds(row)) return true; // judge A1: an acknowledged rule-11 row reads rule 10 with the acknowledgment
  return row.status.kind === "acknowledge" && acknowledged;
}

/** Rule 10 reached through a recorded acknowledgment (display.ts names it on the detail line). */
export function acknowledgedHolds(row: Pick<ControlRow, "status">): boolean {
  return row.status.kind === "verified_holds" && /^Acknowledged by /.test(row.status.detail ?? "");
}
export function needsDecisionOnRow(row: RowLike, acknowledged: boolean): boolean {
  if (row.needs_decision !== undefined) return row.needs_decision;
  return OPEN_DECISION_KINDS.includes(row.status.kind) && !recordedOnRow(row, acknowledged);
}

export function hasRecordedDecision(store: Store, row: RowWithState): boolean {
  return recordedOnRow(row, row.status.kind === "acknowledge" && !!acknowledgmentOn(store, row.control_id, row.state.snapshot_id));
}

/** Does this row wait for a human decision? */
export function needsDecision(store: Store, row: RowWithState): boolean {
  return OPEN_DECISION_KINDS.includes(row.status.kind) && !hasRecordedDecision(store, row);
}

/** UI v4 flags on a public row, so the panel never counts or infers them. */
export function decisionFlags(store: Store, row: RowWithState): { needs_decision: boolean; decision_recorded: boolean } {
  return { needs_decision: needsDecision(store, row), decision_recorded: hasRecordedDecision(store, row) };
}

const SEVERITY_ORDER: Severity[] = ["Critical", "High", "Medium", "Low"];

function finish(text: string, fallback: string): string {
  const t = capWords(text, SUMMARY_MAX_WORDS);
  return bannedWords(t).length ? fallback : t;
}

/** Owl sentence over the live store's rows (acknowledgments read from the ledger). */
export function decisionSummary(store: Store, rows: RowWithState[], snapshotId: string, evaluationState: "pending" | "complete" | "error"): string {
  const acked = new Set(rows.filter((r) => r.status.kind === "acknowledge" && acknowledgmentOn(store, r.control_id, r.state.snapshot_id)).map((r) => r.control_id));
  return decisionSummaryFromRows(rows, snapshotId, evaluationState, (id) => acked.has(id));
}

/**
 * The owl's sentence for the package (at most twelve words), from rows alone (live rows or a run's recorded rows):
 * pending "Re-checking 8 controls on S4…"; quarantine "I did not read runbook.md v3. It carried instructions.";
 * open decisions "1 Critical needs your decision. 2 more to look at."; all recorded "All 8 recorded on S4.";
 * nothing changed "8 verifications hold."
 */
export function decisionSummaryFromRows(rows: RowLike[], snapshotId: string, evaluationState: "pending" | "complete" | "error", acknowledged: (controlId: string) => boolean = () => false): string {
  const n = rows.length;
  if (evaluationState === "pending") return finish(`Re-checking ${n} controls on ${snapshotId}…`, "Re-checking the controls…");
  const quarantined = rows.find((r) => r.status.kind === "not_evaluated" && r.evidencing?.quarantined);
  if (quarantined?.evidencing) {
    const f = `${quarantined.evidencing.fileName}${quarantined.evidencing.versionLabel ? ` ${quarantined.evidencing.versionLabel}` : ""}`;
    return finish(`I did not read ${f}. It carried instructions.`, "I did not read one file. It carried instructions.");
  }
  const open = rows.filter((r) => needsDecisionOnRow(r, acknowledged(r.control_id)));
  if (open.length) {
    const sev = (r: RowLike) => r.status.severity ?? r.severity;
    const top = SEVERITY_ORDER.find((s) => open.some((r) => sev(r) === s));
    const notEval = open.filter((r) => r.status.kind === "not_evaluated").length;
    if (!top) {
      if (notEval === open.length) return finish(`${notEval} ${notEval === 1 ? "control was" : "controls were"} not evaluated. ${notEval === 1 ? "It needs" : "They need"} you.`, "Some controls need your decision.");
      return finish(`${open.length} ${open.length === 1 ? "control needs" : "controls need"} your decision.`, "Some controls need your decision.");
    }
    const k = open.filter((r) => sev(r) === top).length;
    const rest = open.length - k;
    return finish(`${k} ${top} ${k === 1 ? "needs" : "need"} your decision.${rest ? ` ${rest} more to look at.` : ""}`, "Some controls need your decision.");
  }
  if (evaluationState === "error") return finish(`The check on ${snapshotId} stopped. Nothing was decided.`, "The check stopped.");
  if (rows.some((r) => recordedOnRow(r, acknowledged(r.control_id)))) return finish(`All ${n} recorded on ${snapshotId}.`, "Every decision is recorded.");
  const holds = rows.filter((r) => r.status.kind === "verified_holds").length;
  if (holds === n) return finish(`${n} ${n === 1 ? "verification holds" : "verifications hold"}.`, "Every verification holds.");
  return finish(`Nothing needs your decision on ${snapshotId}.`, "Nothing needs your decision.");
}

/** Open-decision count from rows alone (a run's recorded outcome). */
export function openDecisionsFromRows(rows: RowLike[], acknowledged: (controlId: string) => boolean = () => false): number {
  return rows.filter((r) => needsDecisionOnRow(r, acknowledged(r.control_id))).length;
}

// ------------------------------------------------------------------------------------------------
// Display sentences for the panel and the Box page (Codex 15, 16, 18): the UI renders, never composes
// ------------------------------------------------------------------------------------------------

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const filtered = (t: string, fallback: string) => (bannedWords(t).length ? fallback : t);

/**
 * Panel header line: baseline (no run on this snapshot) "8 verifications hold"; pending "Re-checking 8 controls…";
 * after a run "Re-checked 8 controls" or "Re-checked 6 controls · 2 not evaluated".
 */
export function headerLine(rows: RowLike[], evaluationState: "pending" | "complete" | "error", baseline: boolean): string {
  const n = rows.length;
  if (evaluationState === "pending") return filtered(`Re-checking ${plural(n, "control")}…`, "Re-checking…");
  const notEval = rows.filter((r) => r.status.kind === "not_evaluated").length;
  if (baseline && !notEval) {
    const holds = rows.filter((r) => r.status.kind === "verified_holds").length;
    if (holds === n) return filtered(`${n} ${n === 1 ? "verification holds" : "verifications hold"}`, "Every verification holds");
  }
  const evaluated = n - notEval;
  return filtered(`Re-checked ${plural(evaluated, "control")}${notEval ? ` · ${notEval} not evaluated` : ""}`, "Re-checked");
}

/**
 * The folder page's status card, from rows alone. Amber while any control needs a decision; green only when every
 * control is Verified on the current snapshot; otherwise blue (decisions recorded) or teal (prior verifications hold).
 */
export function statusCard(rows: RowLike[], snapshotId: string, evaluationState: "pending" | "complete" | "error", acknowledged: (controlId: string) => boolean = () => false): StatusCard {
  const n = rows.length;
  const card = (tone: StatusCard["tone"], headline: string, detail: string): StatusCard => ({ tone, headline, detail: filtered(capWords(detail, SUMMARY_MAX_WORDS), `snapshot ${snapshotId}`) });
  if (evaluationState === "pending") return card("grey", "Re-checking", `${plural(n, "control")} on ${snapshotId}…`);
  const open = rows.filter((r) => needsDecisionOnRow(r, acknowledged(r.control_id))).length;
  if (open) return card("amber", "Needs review", `${open} of ${plural(n, "control")} ${open === 1 ? "needs" : "need"} a decision · ${snapshotId}`);
  if (evaluationState === "error") return card("grey", "Check stopped", `Nothing was decided on ${snapshotId}`);
  const count = (k: DisplayKind) => rows.filter((r) => r.status.kind === k).length;
  const verified = count("verified");
  if (n && verified === n) return card("green", "All verified", `${n} of ${n} verified by a reviewer · ${snapshotId}`);
  const holds = holdRows(rows, acknowledged).length;
  const returned = count("returned_to_author");
  const recorded = rows.filter((r) => recordedOnRow(r, acknowledged(r.control_id))).length;
  const other = recorded - verified - returned;
  const parts = [holds ? `${holds} hold` : "", verified ? `${verified} verified` : "", returned ? `${returned} with author` : "", other > 0 ? `${other} recorded` : ""].filter(Boolean);
  return card(recorded ? "blue" : "teal", "No open decisions", `${[...parts, snapshotId].join(" · ")}`);
}

/** Rows in the collapsed holds list: a prior verification that holds, with no decision recorded on this snapshot. */
export function holdRows<T extends RowLike>(rows: T[], acknowledged: (controlId: string) => boolean = () => false): T[] {
  return rows.filter((r) => r.status.kind === "verified_holds" && !recordedOnRow(r, acknowledged(r.control_id)));
}

/** "5 verifications hold"; undefined when none. */
export function holdsLine(rows: RowLike[], acknowledged: (controlId: string) => boolean = () => false): string | undefined {
  const k = holdRows(rows, acknowledged).length;
  return k ? `${k} ${k === 1 ? "verification holds" : "verifications hold"}` : undefined;
}

/** Files whose version differs from the prior snapshot's manifest (or that are new); removed files are named too. */
export function changedFiles(snap: Snapshot, prior: Snapshot | undefined, label: (f: Snapshot["files"][number]) => string | undefined): { names: string[]; line: string } {
  if (!prior) return { names: [], line: `snapshot ${snap.snapshot_id}` };
  const changed = snap.files.filter((f) => prior.files.find((p) => p.fileId === f.fileId)?.versionId !== f.versionId);
  const removed = prior.files.filter((p) => !snap.files.some((f) => f.fileId === p.fileId));
  const parts = [...changed.map((f) => `${f.fileName}${label(f) ? ` ${label(f)}` : ""}`), ...removed.map((f) => `${f.fileName} removed`)];
  return { names: [...changed.map((f) => f.fileName), ...removed.map((f) => f.fileName)], line: filtered(`${parts.length ? `${parts.join(", ")} · ` : ""}snapshot ${snap.snapshot_id}`, `snapshot ${snap.snapshot_id}`) };
}

/** Box row hover text: "Keel: 1 control needs your decision" / "Keel: every decision recorded"; undefined otherwise. */
export function hoverLine(open: number, recorded: number): string | undefined {
  if (open) return `Keel: ${open} ${open === 1 ? "control needs" : "controls need"} your decision`;
  if (recorded) return "Keel: every decision recorded";
  return undefined;
}

export interface FolderItemInfo {
  fileId: string;
  size?: number;
}

/**
 * The current snapshot's files for the Box table: version label, upload time and uploader from the
 * store's version record (fixture or Box), size from the Box folder item list when known, else the
 * byte length of the pinned text; per-file control ids and decision counts from the rows.
 */
export function packageFiles(store: Store, snap: Snapshot, rows: RowWithState[], items: FolderItemInfo[] = []): PackageFile[] {
  return snap.files.map((f) => {
    const v = store.versionInfo(f.fileId, f.versionId);
    const text = store.text(f.versionId);
    const size = items.find((i) => i.fileId === f.fileId)?.size ?? (text !== undefined ? Buffer.byteLength(text, "utf8") : undefined);
    // A row's evidencing file: its current binding, else (not evaluated) the file its evaluation event names.
    const fileOf = (r: RowWithState) => r.state.binding?.fileId ?? r.state.evaluation_event?.fileId ?? null;
    const mine = rows.filter((r) => fileOf(r) === f.fileId || (!fileOf(r) && r.evidencing?.fileName === f.fileName));
    return {
      file_id: f.fileId,
      file_name: f.fileName,
      version_id: f.versionId,
      version_label: f.versionLabel ?? v?.label,
      ...(v?.createdAt ? { updated_at: v.createdAt } : {}),
      ...(size !== undefined ? { size_bytes: size } : {}),
      ...(v?.uploader ? { uploader: v.uploader } : {}),
      control_ids: mine.map((r) => r.control_id),
      open_decisions: mine.filter((r) => needsDecision(store, r)).length,
      recorded_decisions: mine.filter((r) => hasRecordedDecision(store, r)).length,
    };
  }).map((f) => {
    const h = hoverLine(f.open_decisions, f.recorded_decisions);
    return h ? { ...f, hover_line: h } : f;
  });
}

/**
 * The same file list from public rows alone (a run's recorded outcome read later): rows are matched
 * to files by their evidencing file name; decision counts come from the rows' recorded flags.
 */
export function packageFilesFromRows(store: Store, snap: Snapshot, rows: ControlRow[]): PackageFile[] {
  return snap.files.map((f) => {
    const v = store.versionInfo(f.fileId, f.versionId);
    const text = store.text(f.versionId);
    const mine = rows.filter((r) => r.evidencing?.fileName === f.fileName);
    return {
      file_id: f.fileId,
      file_name: f.fileName,
      version_id: f.versionId,
      version_label: f.versionLabel ?? v?.label,
      ...(v?.createdAt ? { updated_at: v.createdAt } : {}),
      ...(text !== undefined ? { size_bytes: Buffer.byteLength(text, "utf8") } : {}),
      ...(v?.uploader ? { uploader: v.uploader } : {}),
      control_ids: mine.map((r) => r.control_id),
      open_decisions: mine.filter((r) => needsDecisionOnRow(r, false)).length,
      recorded_decisions: mine.filter((r) => recordedOnRow(r, false)).length,
    };
  }).map((f) => {
    const h = hoverLine(f.open_decisions, f.recorded_decisions);
    return h ? { ...f, hover_line: h } : f;
  });
}

// ------------------------------------------------------------------------------------------------
// Receipt
// ------------------------------------------------------------------------------------------------

const hhmm = (iso?: string | null) => (iso && /T(\d\d:\d\d)/.exec(iso)?.[1] ? `${/T(\d\d:\d\d)/.exec(iso)![1]}Z` : "");
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const prose = (iso?: string | null) => {
  const m = iso ? /^(\d{4})-(\d\d)-(\d\d)/.exec(iso) : null;
  return m ? `${MONTHS[Number(m[2]) - 1]} ${Number(m[3])}` : "";
};
/** "box-task-77120931" reads "77120931"; a live Box id is already numeric. */
export const taskNumber = (id?: string | null) => (id ?? "").replace(/^box-task-/, "");
const sec = (s?: string) => (s ? s.split(" ")[0] : "");

function responseFor(store: Store, controlId: string, taskId: string | undefined, beforeIdx: number): LedgerEvent | null {
  for (let i = beforeIdx; i >= 0; i--) {
    const e = store.events[i];
    if (e.control_id === controlId && e.event_type === "box_task_response_ingested" && (!taskId || (e.response as { task_id?: string } | undefined)?.task_id === taskId)) return e;
  }
  return null;
}

function evaluationFor(store: Store, controlId: string, snapshotId: string): LedgerEvent | null {
  for (let i = store.events.length - 1; i >= 0; i--) {
    const e = store.events[i];
    if (e.control_id === controlId && e.snapshot_id === snapshotId && (e.event_type === "control_evaluated" || e.event_type === "evaluation_error")) return e;
  }
  return null;
}

/**
 * The three-line receipt under a recorded decision, or null while none exists on the current snapshot.
 * Verified: "Verified by Dana Okafor" / "on runbook.md v2 §3 · snapshot S4" / "Box task 77120932 approved · 16:41Z".
 * Returned: "Returned to author by Dana Okafor" / "Box task 77120934 for J. Park (Eng) · due Oct 23" / "on architecture.md v3 · snapshot S4".
 * Acknowledged: "Acknowledged by Dana Okafor" / "on architecture.md v3 §4.2 · snapshot S4" / "Box task 77120933 completed · 16:41Z".
 * Tone green only for a Verified on the current snapshot; blue for returned and acknowledged; grey otherwise.
 */
export function receiptFor(store: Store, row: RowWithState): FindingReceipt | null {
  const st = row.state;
  const snap = st.snapshot_id;
  const ev = row.evidencing;
  const where = (withSection: boolean) => {
    const file = ev ? `${ev.fileName}${ev.versionLabel ? ` ${ev.versionLabel}` : ""}${withSection && ev.section ? ` ${sec(ev.section)}` : ""}` : "";
    return `${file ? `on ${file} · ` : ""}snapshot ${snap}`;
  };
  const evalEv = evaluationFor(store, row.control_id, snap);
  let human: LedgerEvent | null = null;
  let kind: "verified" | "returned_to_author" | "acknowledged" | "other" | null = null;
  const disp = st.current_disposition_event;
  if (disp && disp.snapshot_id === snap && DISPOSITION_KINDS.includes(row.status.kind)) {
    human = disp;
    kind = row.status.kind === "verified" ? "verified" : row.status.kind === "returned_to_author" ? "returned_to_author" : "other";
  } else if (acknowledgedHolds(row) && st.acknowledgment_event) {
    human = st.acknowledgment_event;
    kind = "acknowledged";
  } else if (row.status.kind === "acknowledge") {
    human = acknowledgmentOn(store, row.control_id, snap);
    if (human) kind = "acknowledged";
  }
  if (!human || !kind) return null;
  const idx = store.events.indexOf(human);
  const via = human.via as { task_id?: string; resolution_state?: string } | undefined;
  const resp = responseFor(store, row.control_id, via?.task_id, idx >= 0 ? idx : store.events.length - 1);
  const r = resp?.response as { task_id?: string; resolution_state?: string; completed_at?: string } | undefined;
  const name = human.actor.name;
  const taskLine = (state: string) => {
    const id = taskNumber(r?.task_id ?? via?.task_id);
    const t = hhmm(r?.completed_at ?? human!.ts);
    return `${id ? `Box task ${id} ${state}` : `Recorded ${state}`}${t ? ` · ${t}` : ""}`;
  };
  const event_ids = [human.event_id, resp?.event_id, evalEv?.event_id].filter((x): x is string => !!x);
  let out: FindingReceipt;
  if (kind === "verified") {
    out = { line1: `Verified by ${name}`, line2: where(true), line3: taskLine("approved"), event_ids, tone: "green" };
  } else if (kind === "returned_to_author") {
    const author = [...store.events]
      .reverse()
      .find((e) => e.control_id === row.control_id && e.event_type === "box_task_created" && ["author", "author_remediation"].includes((e.task as { kind?: string } | undefined)?.kind ?? "") && e.snapshot_id === snap);
    const at = author?.task as { task_id?: string; assignee?: string } | undefined;
    const due = prose((human.due_at as string | undefined) ?? st.current_disposition?.due_at);
    const line2 = at?.task_id
      ? `Box task ${taskNumber(at.task_id)}${at.assignee ? ` for ${at.assignee}` : ""}${due ? ` · due ${due}` : ""}`
      : `Author task pending${due ? ` · due ${due}` : ""}`;
    if (author) event_ids.splice(1, 0, author.event_id);
    out = { line1: `Returned to author by ${name}`, line2, line3: where(false), event_ids, tone: "blue" };
  } else if (kind === "acknowledged") {
    out = { line1: `Acknowledged by ${name}`, line2: where(true), line3: taskLine("completed"), event_ids, tone: "blue" };
  } else {
    out = { line1: `${row.status.label} by ${name}`, line2: where(false), line3: taskLine((r?.resolution_state ?? via?.resolution_state ?? "recorded").replace(/_/g, " ")), event_ids, tone: "grey" };
  }
  // The receipt is machine-composed around human names and file names; keep it clear of reserved wording.
  for (const k of ["line1", "line2", "line3"] as const) if (bannedWords(out[k]).length) out[k] = "Recorded.";
  return out;
}
