/**
 * The review transaction for one snapshot (spec 3 steps 1 to 11; CONTRACTS.md lib/engine/pipeline.ts):
 *   observe file versions -> snapshot manifest -> fetch by version with coverage -> input gate per
 *   changed file -> prior-quote diff hints -> one evaluator call -> validation -> assessment and
 *   classification -> staleness by tier materiality -> ledger events -> projection with pointer
 *   check -> one Box review task per finding that needs review or acknowledgment.
 *
 * The same code runs in mock and live mode; only the adapters differ. Every step is recorded as a
 * TraceStep with real timestamps and durations, tagged by source (app, box, decider, agent, boxai).
 */
import { bubbleFor } from "./bubble";
import { decisionFlags, decisionSummary, needsDecision, packageFiles } from "./summary";
import type { BoxAdapter } from "../box/adapter";
import type { DiffHint, Evaluator, EvaluatorInput, EvaluatorResult, InputGate, SearchSnapshotTool } from "../agent/evaluator.types";
import type { KeelConfig } from "../config";
import type { BoxAiAskRecord, GateDecision, RunRecord, Store, StoredFinding, StoredTask } from "../store";
import { withPackageLock } from "./lock";
import { filterBullets, filterText, type WordingHit } from "./wording";
import type {
  Actor,
  ClauseSupport,
  Control,
  ControlProfile,
  EvaluationState,
  EvidenceRef,
  InputGateResult,
  LedgerEvent,
  PriorEvidenceRef,
  Snapshot,
  SnapshotFile,
  TraceStep,
} from "../types";
import { contentHash } from "../fixture";
import { bindingsEqual, classifyChange, deriveAssessment, selectBinding, type NotEvaluatedReason } from "./assess";
import { assertionsChanged, asksForControl, buildBasis, notEvaluatedBasis } from "./basis";
import { priorQuoteDiffHints } from "./diff";
import { canonicalJSON, deepLink, priorVerificationFromEvent, sha256Hex, utcNow } from "./ledger";
import { findQuote, hasTerm, norm, NORMALIZATION, quoteValid, sectionText, sentences } from "./normalize";
import { searchPrompt } from "../agent/search-tool";
import { APP_ACTOR, eventOpts, publishProjection } from "./publish";
import { stalenessEventType, verificationHolds, type StalenessResult } from "./staleness";
import { buildRows, deriveControlState, latestVerification, priorEvaluation, publicRow, snapshotEvaluationState, verificationBinding } from "./state";
import { countLine } from "./display";
import { createReviewTasks, suggestedAction } from "./tasks";
import { validateFindingSet, type PinnedFile } from "./validate";

export interface PipelineContext {
  box: BoxAdapter;
  evaluator: Evaluator;
  gate: InputGate;
  store: Store;
  profile: ControlProfile;
  config: KeelConfig;
  runId: string;
  scenario?: string;
  /** Called for every trace step as it happens (the service appends it to the run and saves). */
  onStep?: (step: TraceStep) => void;
  /** Mock only: label for the run's timing. */
  compressedTiming?: boolean;
  /** Called once the snapshot id is known (new capture, or the snapshot being retried). */
  onSnapshot?: (snapshotId: string, retry: boolean) => void;
  /** Override config.transactionTimeoutMs (tests). */
  transactionTimeoutMs?: number;
  /** Set by runReview: aborted when the transaction deadline passes. */
  signal?: AbortSignal;
}

export interface PipelineResult {
  run_id: string;
  snapshot_id: string | null;
  outcome: "complete" | "error" | "no_change" | "late_result";
  evaluation_state: EvaluationState;
  findings: StoredFinding[];
  tasks: StoredTask[];
  events: LedgerEvent[];
  gate: RunRecord["gate"];
  search_tool: RunRecord["search_tool"];
  box_ai_asks: BoxAiAskRecord[];
  error?: { code: string; message: string };
  /** For the trace's Done line: controls with a machine assessment vs not evaluated. */
  summary?: { evaluated: number; not_evaluated: number };
}

const DECIDER_ACTOR = (kind: InputGate["kind"]): Actor => ({
  type: "gate",
  name: "Strands Decider 2B",
  model_id: "strands-decider-2b",
  runtime: kind === "mock" ? "local (mock stand-in)" : "local",
});

/** Does a control list this file among its evidence locations? ("Architecture document" -> architecture.md) */
export function controlDependsOn(control: Pick<Control, "evidence">, fileName: string): boolean {
  const stem = fileName.replace(/\.[^.]+$/, "").toLowerCase();
  return control.evidence.some((e) => e.toLowerCase().includes(stem));
}

const fmtProb = (p: number) => p.toFixed(2);

export class RunTimeoutError extends Error {
  readonly code = "RUN_TIMEOUT";
}

/**
 * One review transaction per package at a time (Codex finding 6), bounded (Codex NEW-2): lock
 * acquisition waits at most config.lockTimeoutMs, and the transaction has a deadline
 * (config.transactionTimeoutMs). On expiry the abort signal cancels the Box and model calls that
 * honour it; the run stops at its next checkpoint, after the in-flight operation settled, and records
 * RUN_TIMEOUT. The lock is held until then, so no late side effect lands after release.
 */
export function runReview(ctx: PipelineContext): Promise<PipelineResult> {
  return withPackageLock(
    ctx.config.box.folderId,
    async () => {
      const ac = new AbortController();
      const ms = ctx.transactionTimeoutMs ?? ctx.config.transactionTimeoutMs;
      const timer = setTimeout(() => ac.abort(new RunTimeoutError(`review transaction exceeded ${ms} ms`)), ms);
      try {
        return await runReviewLocked({ ...ctx, signal: ac.signal });
      } finally {
        clearTimeout(timer);
      }
    },
    { timeoutMs: ctx.config.lockTimeoutMs },
  );
}

/**
 * Does a snapshot with an unchanged version set need another attempt (Codex finding 8)? Yes when its
 * latest attempt is pending or failed, read coverage was incomplete, or projection or task creation failed.
 */
export function needsRetry(store: Store, snapshotId: string): boolean {
  return retryKind(store, snapshotId) !== "none";
}

/**
 * What a retry of an unchanged version set must redo (Codex findings 8, 13):
 *  "evaluation": the last attempt is pending or failed, or read coverage was incomplete;
 *  "publication": the evaluation completed but projection or review tasks did not finish
 *   (including a crash after evaluation_completed): the completed assessment is reused, the
 *   evaluator is not called again;
 *  "none": the transaction completed.
 */
export function retryKind(store: Store, snapshotId: string): "none" | "publication" | "evaluation" {
  if (evaluationIncomplete(store, snapshotId)) return "evaluation";
  const txn = store.data.transactions?.[snapshotId];
  if (txn && txn.stage !== "complete") return "publication";
  const ev = store.events;
  const proj = ev.filter((e) => e.snapshot_id === snapshotId && (e.event_type === "box_metadata_written" || e.event_type === "box_metadata_write_failed")).at(-1);
  if (proj?.event_type === "box_metadata_write_failed") return "publication";
  if (txn) return "none"; // a recorded transaction is the source of truth for its task stage
  const lastAttempt = ev.map((e, i) => (e.snapshot_id === snapshotId && e.event_type === "evaluation_attempt" ? i : -1)).reduce((a, b) => Math.max(a, b), -1);
  if (ev.slice(Math.max(lastAttempt, 0)).some((e) => e.snapshot_id === snapshotId && e.event_type === "box_task_create_failed" && !(e.intended as { kind?: string } | undefined)?.kind)) return "publication";
  return "none";
}

function evaluationIncomplete(store: Store, snapshotId: string): boolean {
  const ev = store.events;
  const lastAttempt = ev.map((e, i) => (e.snapshot_id === snapshotId && e.event_type === "evaluation_attempt" ? i : -1)).reduce((a, b) => Math.max(a, b), -1);
  const since = ev.slice(Math.max(lastAttempt, 0)).filter((e) => e.snapshot_id === snapshotId);
  const completed = since.filter((e) => e.event_type === "evaluation_completed").at(-1);
  if (lastAttempt < 0 || !completed || completed.evaluation_state === "error") return lastAttempt >= 0 || ev.some((e) => e.snapshot_id === snapshotId && e.event_type === "snapshot_captured");
  const fetched = ev.filter((e) => e.snapshot_id === snapshotId && e.event_type === "texts_fetched").at(-1);
  return !!(fetched?.coverage && fetched.coverage.readable < fetched.coverage.total);
}

async function runReviewLocked(ctx: PipelineContext): Promise<PipelineResult> {
  let currentSnapshot: string | null = null;
  try {
    return await runReviewSteps(ctx, (id) => (currentSnapshot = id));
  } catch (err) {
    if (!(err instanceof RunTimeoutError) && !ctx.signal?.aborted) throw err;
    // Deadline passed: give the snapshot a terminal outcome (unless its evaluation already completed).
    const error = { code: "RUN_TIMEOUT", message: err instanceof Error ? err.message : "review transaction deadline passed" };
    const opts = eventOpts(ctx.config);
    const snap = currentSnapshot as string | null;
    const done = snap ? retryKind(ctx.store, snap) !== "evaluation" : true;
    ctx.store.append({ phase: "live", run_id: ctx.runId, event_type: "evaluation_error", actor: APP_ACTOR, snapshot_id: snap, error, note: "the review transaction was aborted at its deadline; submit again to retry" }, opts);
    if (snap && !done) ctx.store.append({ phase: "live", run_id: ctx.runId, event_type: "evaluation_completed", actor: APP_ACTOR, snapshot_id: snap, evaluation_id: `EVAL-${snap}`, evaluation_state: "error", error }, opts);
    return { run_id: ctx.runId, snapshot_id: snap, outcome: "error", evaluation_state: "error", findings: [], tasks: [], events: [], gate: { ran: false, label: "" }, search_tool: { label: "", fallback: false }, box_ai_asks: [], error };
  }
}

async function runReviewSteps(ctx: PipelineContext, noteSnapshot: (id: string) => void): Promise<PipelineResult> {
  const { evaluator, gate, store, profile, config } = ctx;
  // Box calls go through an adapter scoped to the transaction's abort signal when the adapter supports it.
  const box = (ctx.signal && (ctx.box as { withSignal?: (s: AbortSignal) => BoxAdapter }).withSignal?.(ctx.signal)) || ctx.box;
  /** Stop at a checkpoint once the deadline passed; the operation before it has settled. */
  const checkpoint = () => {
    if (ctx.signal?.aborted) throw ctx.signal.reason instanceof RunTimeoutError ? ctx.signal.reason : new RunTimeoutError("review transaction deadline passed");
  };
  const opts = eventOpts(config);
  const t0 = Date.now();
  const steps: TraceStep[] = [];
  const newEvents: LedgerEvent[] = [];
  const asks: BoxAiAskRecord[] = [];
  let gateInfo: RunRecord["gate"] = { ran: false, label: "omitted: Decider not running" };
  let searchInfo: RunRecord["search_tool"] = { label: "Box AI ask", fallback: false };

  const emit = (s: Omit<TraceStep, "seq">): TraceStep => {
    const step: TraceStep = { seq: steps.length + 1, ts: new Date(t0 + s.startMs).toISOString(), ...s };
    step.bubble = bubbleFor(step); // UI v4: the owl's line for this step, computed from kind + detail
    steps.push(step);
    ctx.onStep?.(step);
    return step;
  };
  const since = (start: number) => ({ startMs: start - t0, durationMs: Date.now() - start });
  const append = (input: Parameters<Store["append"]>[0]) => {
    const e = store.append({ phase: "live", run_id: ctx.runId, ...input }, opts);
    newEvents.push(e);
    return e;
  };
  const result = (outcome: PipelineResult["outcome"], snapshot_id: string | null, evaluation_state: EvaluationState, extra: Partial<PipelineResult> = {}): PipelineResult => ({
    run_id: ctx.runId,
    snapshot_id,
    outcome,
    evaluation_state,
    findings: [],
    tasks: [],
    events: newEvents,
    gate: gateInfo,
    search_tool: searchInfo,
    box_ai_asks: asks,
    ...extra,
  });

  // ------------------------------------------------------------------ 1. Intake: compare complete manifests
  const prior = store.currentSnapshot;
  let start = Date.now();
  // Intake failures (folder listing, version history) are recorded, never a crashed run; no snapshot is captured.
  const intakeFailed = (stage: string, err: unknown, fileName?: string) => {
    const error = { code: (err as { code?: string })?.code ?? "BOX_INTAKE_FAILED", message: `${stage}${fileName ? ` for ${fileName}` : ""} failed: ${err instanceof Error ? err.message : String(err)}` };
    append({ event_type: "evaluation_error", actor: APP_ACTOR, snapshot_id: null, error, note: "intake failed before a snapshot was captured; the current snapshot and its statuses are unchanged; submit again to retry" });
    emit({ source: "box", kind: "intake_failed", label: `Intake failed: ${error.message}`, ...since(start), detail: error });
    return result("error", prior?.snapshot_id ?? null, "error", { error });
  };
  let items: Awaited<ReturnType<BoxAdapter["listFolderItems"]>>;
  try {
    items = await box.listFolderItems(config.box.folderId);
  } catch (err) {
    return intakeFailed("listing the package folder", err);
  }
  const changed = items.filter((it) => prior?.files.find((f) => f.fileId === it.fileId)?.versionId !== it.currentVersionId);
  const removed = (prior?.files ?? []).filter((f) => !items.some((it) => it.fileId === f.fileId));
  // Same version set: re-run only when the snapshot's last evaluation or its side effects did not finish.
  const retry = !changed.length && !removed.length && !!prior && needsRetry(store, prior.snapshot_id);
  if (!changed.length && !removed.length && !retry) {
    emit({ source: "box", kind: "no_change", label: "No new, changed or removed file in the package folder; the last evaluation is complete", ...since(start) });
    return result("no_change", prior?.snapshot_id ?? null, "complete");
  }
  const labels = new Map<string, string>();
  for (const it of items) {
    let versions: Awaited<ReturnType<BoxAdapter["listFileVersions"]>>;
    try {
      versions = await box.listFileVersions(it.fileId);
    } catch (err) {
      return intakeFailed("reading the version history", err, it.fileName);
    }
    versions.forEach((v, i) => {
      const label = v.label ?? `v${i + 1}`;
      labels.set(v.versionId, label);
      const isNew = changed.some((c) => c.currentVersionId === v.versionId);
      if (isNew || !store.versionInfo(it.fileId, v.versionId)) {
        store.registerVersion({
          fileId: it.fileId,
          fileName: it.fileName,
          versionId: v.versionId,
          label,
          createdAt: v.createdAt,
          uploader: v.uploader?.name,
          uploader_id: v.uploader?.id,
          comment: v.comment,
          metadata: (v as { metadata?: Record<string, string> }).metadata,
        });
      }
    });
  }
  const snapshotId = retry ? prior!.snapshot_id : `S${store.data.snapshots.length + 1}`;
  ctx.onSnapshot?.(snapshotId, retry);
  noteSnapshot(snapshotId);
  checkpoint();
  const txns = (store.data.transactions ??= {});
  const setTxn = (stage: "captured" | "evaluated" | "published" | "complete", save = true) => {
    txns[snapshotId] = { stage, run_id: ctx.runId, updated_at: utcNow() };
    if (save) store.save();
  };
  /**
   * Judge A1: the run record keeps its own outcome (rows and count lines), so a replay can show the
   * result of the run whatever the store holds now (for example after a reset).
   */
  const recordOutcome = (final: boolean) => {
    const run = store.data.runs[ctx.runId];
    if (!run) return;
    const prevId = retry ? store.previousSnapshot(snapshotId)?.snapshot_id : prior?.snapshot_id;
    const prevRows = prevId ? buildRows(store, profile, prevId, { withPrior: false }) : [];
    const n = profile.controls.length;
    run.outcome = {
      ...(run.outcome ?? {}),
      snapshot_id: snapshotId,
      prior_snapshot_id: prevId,
      prior_count_line: prevId ? countLine(prevRows, prevId) : undefined,
      pending_count_line: `${n} controls on snapshot ${snapshotId}: ${n} Re-check pending`,
      ...(final ? (() => {
        const rows = buildRows(store, profile, snapshotId, { withPrior: false });
        const evalState = snapshotEvaluationState(store.events, snapshotId).state;
        return {
          count_line: countLine(rows, snapshotId),
          // UI v4: row flags, badge count and owl sentence of the recorded outcome, so a replay never counts rows.
          rows: rows.map((r) => ({ ...publicRow(r), ...decisionFlags(store, r) })),
          open_decisions: evalState === "pending" ? 0 : rows.filter((r) => needsDecision(store, r)).length,
          decision_summary: decisionSummary(store, rows, snapshotId, evalState),
          files: store.snapshot(snapshotId) ? packageFiles(store, store.snapshot(snapshotId)!, rows) : undefined,
          recorded_at: utcNow(),
          snapshot: store.snapshot(snapshotId),
        };
      })() : {}),
    };
  };
  recordOutcome(false);
  if (retry && retryKind(store, snapshotId) === "publication") {
    // The assessment for this snapshot is complete and may already be reviewed: reuse it, never re-run the
    // evaluator or change a binding under the same finding ids. Only publication and tasks are resumed.
    emit({ source: "app", kind: "publication_retry", label: `Evaluation of ${snapshotId} is complete; resuming its projection and review tasks only`, ...since(start) });
    const snapFiles = prior!.files;
    const q = snapFiles.flatMap((f) => {
      const d = store.data.gate_decisions[`${f.fileId}@${f.versionId}`];
      return d?.quarantined ? [{ fileId: f.fileId, fileName: f.fileName, versionId: f.versionId, injection: d.injection }] : [];
    });
    const pr = await project({ ...ctx, box }, snapshotId, emit, t0, newEvents);
    if (pr.ok) setTxn("published");
    const tasks = await createReviewTasks({ store, box, profile, config, snapshotId, runId: ctx.runId, quarantined: q, append });
    if (tasks.created.length) emit({ source: "box", kind: "box_task_created", label: `Box review tasks created on resume: ${tasks.created.map((t) => t.control_id).join(", ")}`, startMs: Date.now() - t0, durationMs: 0, detail: { tasks: tasks.created } });
    if (pr.ok && !tasks.failed.length) setTxn("complete");
    recordOutcome(true);
    const rows = buildRows(store, profile, snapshotId);
    return result("complete", snapshotId, "complete", {
      tasks: tasks.created,
      summary: { evaluated: rows.filter((r) => r.machine_assessment !== "not_evaluated").length, not_evaluated: rows.filter((r) => r.machine_assessment === "not_evaluated").length },
    });
  }
  if (!retry) {
    for (const it of changed) {
      const info = store.versionInfo(it.fileId, it.currentVersionId);
      const uploader = info?.uploader ?? "unknown uploader";
      append({
        event_type: "file_version_observed",
        actor: { type: uploader.startsWith("svc-") ? "service" : "human", name: uploader, role: "uploader", ...(info?.uploader_id ? { box_user_id: info.uploader_id } : {}) },
        snapshot_id: snapshotId,
        fileId: it.fileId,
        fileName: it.fileName,
        versionId: it.currentVersionId,
        uploaded_at: info?.createdAt ?? null,
        version_label: info?.label ?? null,
        ...(info?.comment ? { version_comment: info.comment } : {}),
        ...(info?.metadata ?? {}),
      });
    }
    for (const f of removed) {
      append({
        event_type: "file_version_observed",
        actor: APP_ACTOR,
        snapshot_id: snapshotId,
        fileId: f.fileId,
        fileName: f.fileName,
        versionId: null,
        removed: true,
        previous_version_id: f.versionId,
        note: `${f.fileName} is no longer in the package folder; controls that list it as an evidence location are evaluated without it`,
      });
    }
    emit({
      source: "box",
      kind: "file_version_observed",
      label: [
        changed.length ? `New version observed: ${changed.map((c) => `${c.fileName} ${labels.get(c.currentVersionId) ?? ""}`.trim()).join(", ")}` : "",
        removed.length ? `Removed from the folder: ${removed.map((f) => f.fileName).join(", ")}` : "",
      ].filter(Boolean).join("; "),
      ...since(start),
      detail: { changed: changed.map((c) => ({ fileId: c.fileId, fileName: c.fileName, versionId: c.currentVersionId, ...store.versionInfo(c.fileId, c.currentVersionId) })), removed },
    });
  } else {
    emit({ source: "app", kind: "evaluation_retry", label: `Same version set as ${snapshotId}; its last evaluation or side effects did not finish, so it is re-run as a new attempt`, ...since(start) });
  }

  // ------------------------------------------------------------------ 2-3. Snapshot, fetch by version, coverage
  start = Date.now();
  const pinned: (PinnedFile & { error?: { code: string; message: string }; contentHash: string })[] = [];
  const toFetch = retry ? prior!.files.map((f) => ({ fileId: f.fileId, fileName: f.fileName, currentVersionId: f.versionId })) : items;
  for (const it of toFetch) {
    const r = await box.downloadVersionText(it.fileId, it.currentVersionId);
    const label = labels.get(it.currentVersionId) ?? store.versionLabel(it.fileId, it.currentVersionId);
    if (r.ok) {
      store.data.texts[it.currentVersionId] = r.text;
      const h = contentHash(r.text);
      store.registerVersion({ fileId: it.fileId, fileName: it.fileName, versionId: it.currentVersionId, label: label ?? "", contentHash: h });
      pinned.push({ fileId: it.fileId, fileName: it.fileName, versionId: it.currentVersionId, versionLabel: label, text: r.text, given: true, contentHash: h });
    } else {
      pinned.push({ fileId: it.fileId, fileName: it.fileName, versionId: it.currentVersionId, versionLabel: label, text: null, given: false, error: r.error, contentHash: "unavailable" });
    }
  }
  const fetchMs = since(start);
  checkpoint();
  let snapshot: Snapshot;
  if (retry) snapshot = prior!;
  else {
    const files: SnapshotFile[] = pinned.map((p) => ({ fileId: p.fileId, fileName: p.fileName, versionId: p.versionId, contentHash: p.contentHash }));
    const body = { snapshot_id: snapshotId, captured_at: utcNow(), control_profile_version: profile.profile_version, files };
    snapshot = {
      ...body,
      files: files.map((f) => ({ ...f, versionLabel: labels.get(f.versionId) })),
      era: [changed.map((c) => `${c.fileName} ${labels.get(c.currentVersionId) ?? ""}`.trim()).join(", ") + (changed.length ? " upload" : ""), removed.length ? `${removed.map((f) => f.fileName).join(", ")} removed` : ""].filter(Boolean).join("; "),
      manifest_hash: "sha256:" + sha256Hex(canonicalJSON(body)),
    };
    store.data.snapshots.push(snapshot);
    store.data.current_snapshot_id = snapshotId; // authoritative pointer moves at capture; rows read "Re-check pending"
    setTxn("captured", false);
    append({
      event_type: "snapshot_captured",
      actor: APP_ACTOR,
      snapshot_id: snapshotId,
      manifest_hash: snapshot.manifest_hash,
      control_profile_version: profile.profile_version,
      prior_snapshot_id: prior?.snapshot_id ?? null,
      files: files.map((f) => ({ fileName: f.fileName, versionId: f.versionId, contentHash: f.contentHash })),
      ...(removed.length ? { removed_files: removed.map((f) => f.fileName) } : {}),
    });
    emit({ source: "app", kind: "snapshot_captured", label: `Snapshot ${snapshotId} captured: ${files.length} files`, startMs: start - t0, durationMs: 0, detail: { snapshot_id: snapshotId, manifest_hash: snapshot.manifest_hash, files } });
  }

  const readable = pinned.filter((p) => p.text !== null);
  const evaluationId = `EVAL-${snapshotId}`;
  const attempt = store.events.filter((e) => e.snapshot_id === snapshotId && e.event_type === "evaluation_attempt").length + 1;
  const coverage = { readable: readable.length, total: pinned.length };
  append({
    event_type: "texts_fetched",
    actor: APP_ACTOR,
    snapshot_id: snapshotId,
    evaluation_id: evaluationId,
    attempt,
    coverage,
    files: pinned.map((p) => ({ fileName: p.fileName, versionId: p.versionId, readable: p.text !== null, ...(p.error ? { reason: p.error } : {}) })),
    ...(removed.length ? { removed_files: removed.map((f) => f.fileName) } : {}),
  });
  emit({
    source: "box",
    kind: "texts_fetched",
    label: `Texts fetched by version: coverage ${readable.length} of ${pinned.length} readable${attempt > 1 ? ` (attempt ${attempt})` : ""}`,
    ...fetchMs,
    detail: {
      coverage: `${readable.length} of ${pinned.length}`,
      files: pinned.map((p) => ({ fileName: p.fileName, versionId: p.versionId, readable: p.text !== null, ...(p.error ? { reason: p.error.message } : {}) })),
    },
  });

  // ------------------------------------------------------------------ 5. Input gate per new version; decisions persist by version
  const quarantined = new Map<string, InputGateResult | GateDecision>();
  const gateResults: InputGateResult[] = [];
  const baseline = retry ? store.previousSnapshot(snapshotId) : prior;
  const decisions = Object.values(store.data.gate_decisions);
  for (const p of pinned) {
    if (p.text === null) continue;
    const key = `${p.fileId}@${p.versionId}`;
    const prev = store.data.gate_decisions[key];
    if (prev && prev.contentHash === p.contentHash) {
      // A recorded decision for this exact version stands: a quarantined version stays withheld (Codex finding 2).
      if (prev.quarantined) quarantined.set(p.fileId, prev);
      continue;
    }
    // Identical text already quarantined under another version id stays quarantined, gate or no gate.
    const sameText = decisions.find((d) => d.quarantined && d.contentHash === p.contentHash);
    if (sameText) {
      quarantined.set(p.fileId, { ...sameText, fileId: p.fileId, fileName: p.fileName, versionId: p.versionId });
      continue;
    }
    // Gate every version that is new in this snapshot, including one that only became readable on a retry.
    // Versions captured before the gate existed (the seed) are not re-gated.
    const newInSnapshot = baseline?.files.find((f) => f.fileId === p.fileId)?.versionId !== p.versionId;
    if (!newInSnapshot) continue;
    start = Date.now();
    const g = await gate.gate({ fileId: p.fileId, fileName: p.fileName, versionId: p.versionId, contentHash: p.contentHash }, p.text);
    if (!g) {
      // Decider not running: the step is omitted, never faked; keep the gate's own reason for the label.
      const why = (gate as { lastOmissionReason?: string }).lastOmissionReason;
      gateInfo = { ran: false, label: why ? (why.startsWith("omitted") ? why : `omitted: ${why}`) : "omitted: Decider not running" };
      continue;
    }
    gateResults.push(g);
    const isQ = g.injection.answer === "yes" && g.injection.probability >= config.gateInjectionThreshold;
    if (isQ) quarantined.set(p.fileId, g);
    const ev = append({
      event_type: "input_gate",
      actor: DECIDER_ACTOR(gate.kind),
      snapshot_id: snapshotId,
      fileId: p.fileId,
      fileName: p.fileName,
      versionId: p.versionId,
      contentHash: p.contentHash,
      detail: { injection: g.injection, material_change: g.material_change, options: g.options, latency_ms: g.latency_ms, ...((g as { coverage?: unknown }).coverage ? { coverage: (g as { coverage?: unknown }).coverage } : {}) },
      quarantined: isQ,
      threshold: config.gateInjectionThreshold,
      note: isQ ? "quarantined above the injection threshold; text withheld from the evaluator on this and every later evaluation of this version; gate never writes a status" : "gate result recorded; never writes a status",
    });
    store.data.gate_decisions[key] = { fileId: p.fileId, fileName: p.fileName, versionId: p.versionId, contentHash: p.contentHash, quarantined: isQ, injection: g.injection, snapshot_id: snapshotId, event_id: ev.event_id };
    store.save();
    emit({
      source: "decider",
      kind: "input_gate",
      label: isQ ? `Decider 2B input gate: ${p.fileName} quarantined` : "Decider 2B input gate",
      ...since(start),
      model_id: "strands-decider-2b",
      detail: `injection: ${g.injection.answer} (${fmtProb(g.injection.probability)}) · material change: ${g.material_change.answer.replace("_", " ")} (${fmtProb(g.material_change.probability)}) · ${g.latency_ms} ms, local${isQ ? " · quarantined" : ""}`,
      result: { ...g, quarantined: isQ },
    });
  }
  const carriedQ = [...quarantined.values()].filter((q) => !("options" in q));
  if (gateResults.length) {
    const g = gateResults[0];
    gateInfo = {
      ran: true,
      label: `Decider 2B: injection ${g.injection.answer} (${fmtProb(g.injection.probability)}), material change ${g.material_change.answer.replace("_", " ")} (${fmtProb(g.material_change.probability)}), ${g.latency_ms} ms${gate.kind === "mock" ? ", mock stand-in" : ", local"}${quarantined.size ? `; quarantined ${[...quarantined.values()].map((q) => q.fileName).join(", ")}` : ""}`,
    };
  } else if (carriedQ.length) {
    gateInfo = { ran: false, label: `no new version to gate; ${carriedQ.map((q) => q.fileName).join(", ")} still quarantined from an earlier gate decision` };
  }
  if (carriedQ.length) {
    emit({ source: "app", kind: "input_gate_carried", label: `Quarantine stands: ${carriedQ.map((q) => q.fileName).join(", ")} withheld from the evaluator (recorded gate decision for this version)`, startMs: Date.now() - t0, durationMs: 0, detail: carriedQ });
  }
  for (const p of pinned) if (quarantined.has(p.fileId)) p.given = false;

  // ------------------------------------------------------------------ 4. Prior-quote diff hints
  start = Date.now();
  const verifications = new Map(profile.controls.map((c) => [c.id, latestVerification(store.events, c.id)]));
  const priorBindings = new Map(profile.controls.map((c) => [c.id, verificationBinding(store, verifications.get(c.id) ?? null)]));
  const textById = new Map(pinned.map((p) => [p.fileId, p.given ? p.text : null]));
  const hints: DiffHint[] = priorQuoteDiffHints(
    profile.controls.flatMap((c) => {
      const b = priorBindings.get(c.id);
      return b ? [{ control_id: c.id, fileId: b.fileId, fileName: b.fileName, quote: b.quote, required_clauses: c.required_clauses }] : [];
    }),
    textById,
  );
  const hintOf = (cid: string) => hints.find((h) => h.control_id === cid);
  const nW = hints.filter((h) => h.status === "weakened").length;
  const nR = hints.filter((h) => h.status === "removed").length;
  emit({
    source: "app",
    kind: "prior_quotes_diffed",
    label: `Prior quotes diffed: ${nW} weakened, ${nR} removed, ${hints.length - nW - nR} present`,
    ...since(start),
    detail: { prior_snapshot_id: prior?.snapshot_id ?? null, normalization: NORMALIZATION, hints },
  });

  // Coverage: an unreadable or quarantined evidence location makes every dependent control not_evaluated.
  const coverageReason = new Map<string, NotEvaluatedReason & { fileId: string }>();
  for (const c of profile.controls) {
    const unreadable = pinned.find((p) => p.text === null && controlDependsOn(c, p.fileName));
    if (unreadable) {
      coverageReason.set(c.id, {
        code: unreadable.error?.code ?? "FILE_UNREADABLE",
        message: `${unreadable.fileName} ${unreadable.versionLabel ?? unreadable.versionId} could not be read (${unreadable.error?.message ?? "read failed"}); it is an evidence location for this control`,
        fileId: unreadable.fileId,
      });
      continue;
    }
    const q = pinned.find((p) => quarantined.has(p.fileId) && controlDependsOn(c, p.fileName));
    if (q) {
      const g = quarantined.get(q.fileId)!;
      coverageReason.set(c.id, {
        code: "input_gate",
        message: `${q.fileName} ${q.versionLabel ?? q.versionId} quarantined by the input gate (instructions addressed to an AI agent, p=${fmtProb(g.injection.probability)}); its text was not sent to the evaluator`,
        fileId: q.fileId,
      });
    }
  }

  // ------------------------------------------------------------------ 6. Assessment: one evaluator call
  const given = pinned.filter((p) => p.given && p.text !== null);
  const machineActor: Actor = { type: "agent", name: "keel-evaluator", role: "machine assessment", model_id: config.modelId, inference_profile: config.inferenceProfile };
  append({
    event_type: "evaluation_attempt",
    actor: machineActor,
    snapshot_id: snapshotId,
    evaluation_id: evaluationId,
    attempt,
    coverage,
    files_given: given.map((p) => p.fileName),
    files_withheld: pinned.filter((p) => !p.given).map((p) => ({ fileName: p.fileName, reason: p.text === null ? "unreadable" : "input_gate" })),
    model_id: config.modelId,
    inference_profile: config.inferenceProfile,
    prompt_version: config.promptVersion,
    evaluator: evaluator.kind,
  });
  const agentStart = Date.now();
  const agentStep = emit({
    source: "agent",
    kind: "agent_evaluation",
    label: `Agent evaluation: one Claude Sonnet 4.6 call, ${profile.controls.length} controls`,
    startMs: agentStart - t0,
    model_id: config.modelId,
    inference_profile: config.inferenceProfile,
    prompt_version: config.promptVersion,
    mrm_model_id: config.mrmModelId,
  });

  const search: SearchSnapshotTool = {
    search: async (query, excludeFileName, signal) => {
      const s0 = Date.now();
      const targets = given.filter((p) => p.fileName !== excludeFileName);
      const rec: BoxAiAskRecord = { query, files_asked: targets.map((t) => t.fileName), cited_statements: 0, rejected_citations: [], citations: [], fallback: false, label: "", elapsed_ms: 0 };
      const terms = query.split(/\s+OR\s+/i).map((t) => t.trim()).filter(Boolean);
      // A bounded question for Box AI (spec 3 step 6); the trailing query line keeps the recorded query exact.
      // A cancelled evaluation cancels its Box AI request too (scoped adapter); an abort returns "unavailable".
      const b = (signal && (box as { withSignal?: (s: AbortSignal) => BoxAdapter }).withSignal?.(signal)) || box;
      const ans = await b.aiAsk(targets.map((t) => t.fileId), `${searchPrompt(query)}\nquery: ${query}`, { citations: true });
      let raw: { fileId: string; versionId?: string; content: string }[];
      const answer = "unavailable" in ans && ans.unavailable ? "" : ((ans as { answer?: string }).answer ?? "");
      if ("unavailable" in ans && ans.unavailable) {
        rec.fallback = true;
        raw = targets.flatMap((t) =>
          sentences(t.text ?? "")
            .filter((sn) => terms.some((term) => hasTerm(sn, term)))
            .slice(0, 3)
            .map((content) => ({ fileId: t.fileId, versionId: t.versionId, content })),
        );
      } else raw = (ans as { citations: { fileId: string; versionId?: string; content: string }[] }).citations;
      const seen = new Set<string>();
      for (const c of raw) {
        const t = targets.find((x) => x.fileId === c.fileId);
        let reason: string | null = null;
        if (!t) reason = "cited file is not among the snapshot files asked";
        else if (c.versionId && c.versionId !== t.versionId) reason = `cited version ${c.versionId} is not the pinned version ${t.versionId}`;
        const valid = !reason && t ? validatedStatements(c.content, t.text ?? "", terms, answer) : [];
        if (!reason && !valid.length) reason = "cited passage not found in the pinned version text after normalization";
        if (reason || !t) {
          rec.rejected_citations.push({ ...c, reason: reason ?? "invalid" });
          continue;
        }
        for (const q of valid) {
          const k = t.versionId + "\u0000" + norm(q);
          if (seen.has(k)) continue;
          seen.add(k);
          const loc = findQuote(q, t.text ?? "");
          rec.citations.push({ fileName: t.fileName, versionId: t.versionId, section: loc?.section ?? "", paragraph: loc?.paragraph, page: loc?.page, quote: q });
        }
      }
      rec.cited_statements = rec.citations.length;
      const inFiles = [...new Set(rec.citations.map((c) => c.fileName))].join(", ");
      rec.label = rec.fallback
        ? `String search over ${targets.length} files (Box AI unavailable), ${rec.cited_statements} matching statement${rec.cited_statements === 1 ? "" : "s"}${inFiles ? ` in ${inFiles}` : ""}`
        : `Box AI ask over ${targets.length} files, ${rec.cited_statements} cited statement${rec.cited_statements === 1 ? "" : "s"}${inFiles ? ` in ${inFiles}` : ""}${rec.rejected_citations.length ? `; ${rec.rejected_citations.length} citation${rec.rejected_citations.length === 1 ? "" : "s"} not in pinned text, counted as no evidence` : ""}`;
      rec.elapsed_ms = Date.now() - s0;
      asks.push(rec);
      if (rec.fallback) searchInfo = { label: "string search (Box AI unavailable)", fallback: true };
      return {
        label: rec.label,
        fallback: rec.fallback,
        citations: rec.citations.map((c) => ({ ...c, validated_against_pinned_text: true })),
      };
    },
  };

  const input: EvaluatorInput = {
    snapshot,
    profile: { profile_id: profile.profile_id, profile_version: profile.profile_version, attestation_phrase: profile.attestation_phrase },
    controls: profile.controls.map((c) => ({ id: c.id, title: c.title, requirement: c.requirement, required_clauses: c.required_clauses, applicability: c.applicability, evidence: c.evidence })),
    files: given.map((p) => ({ file: { fileId: p.fileId, fileName: p.fileName, versionId: p.versionId, contentHash: p.contentHash, versionLabel: p.versionLabel }, text: p.text! })),
    prior_evidence: Object.fromEntries(
      profile.controls.flatMap((c) => {
        const ev = verifications.get(c.id);
        const b = priorBindings.get(c.id);
        if (!ev || !b) return [];
        const others = (ev.clause_support ?? []).flatMap((cs) => (cs.quote && !(cs.quote.versionId === b.versionId && cs.quote.quote === b.quote) ? [cs.quote] : []));
        const uniq = others.filter((q, i) => others.findIndex((x) => x.quote === q.quote && x.versionId === q.versionId) === i);
        const meta = { verified_by: ev.actor.name, verified_role: ev.actor.role, verified_at: ev.ts, verified_snapshot_id: ev.snapshot_id ?? undefined };
        return [[c.id, [b, ...uniq].map((q) => ({ ...q, ...meta }) as PriorEvidenceRef)]];
      }),
    ),
    diff_hints: hints,
    scenario: ctx.scenario,
  };

  let evalResult: EvaluatorResult | null = null;
  let evalError: { code: string; message: string } | null = null;
  try {
    // The abort signal is passed as an optional fourth argument; evaluators that accept it cancel the model call.
    evalResult = await evaluator.evaluate(
      input,
      { search: { search: (q, ex, sig) => search.search(q, ex, sig ?? ctx.signal) } },
      (s) => {
        emit({ ...s, startMs: agentStart - t0 + s.startMs, detail: s.detail ?? undefined, parent_seq: agentStep.seq } as TraceStep);
      },
      { signal: ctx.signal },
    );
  } catch (err) {
    evalError = { code: (err as { code?: string })?.code ?? "EVALUATOR_FAILED", message: err instanceof Error ? err.message : String(err) };
  }
  agentStep.durationMs = Date.now() - agentStart;
  if (ctx.signal?.aborted) {
    ctx.onStep?.(agentStep);
    checkpoint();
  }
  agentStep.prompt_hash = evalResult?.prompt_hash;
  agentStep.detail = { output_tokens: evalResult?.output_tokens, structured_output: "FindingSet (zod)", evaluator: evaluator.kind, ...(evalError ? { error: evalError } : {}) };
  ctx.onStep?.(agentStep);

  const promptHash = evalResult?.prompt_hash ?? null;
  const modelMeta = { model_id: evalResult?.model_id ?? config.modelId, inference_profile: evalResult?.inference_profile ?? config.inferenceProfile, prompt_version: evalResult?.prompt_version ?? config.promptVersion };

  // ------------------------------------------------------------------ 7. Validation
  start = Date.now();
  const validation = evalResult ? validateFindingSet(evalResult.output, { profile, snapshot, files: pinned, folderId: config.box.folderId }) : { ok: false as const, error: evalError! };

  // Late result: a newer snapshot became current while this one was evaluating (acceptance 9).
  if (store.data.current_snapshot_id !== snapshotId) {
    append({
      event_type: "late_result_recorded",
      actor: APP_ACTOR,
      snapshot_id: snapshotId,
      evaluation_id: evaluationId,
      current_snapshot_id: store.data.current_snapshot_id,
      note: "result for an older snapshot recorded as history; displayed status unchanged",
      ...(validation.ok ? { outcomes_proposed: [...validation.findings.keys()] } : { error: validation.error }),
    });
    emit({ source: "app", kind: "late_result_recorded", label: `Late result for ${snapshotId} recorded as history; current snapshot is ${store.data.current_snapshot_id}`, ...since(start) });
    return result("late_result", snapshotId, "complete");
  }

  if (!validation.ok) {
    // Acceptance 10 and 16: no partial application; every control displays Not evaluated.
    append({
      event_type: "evaluation_error",
      actor: APP_ACTOR,
      snapshot_id: snapshotId,
      evaluation_id: evaluationId,
      attempt,
      coverage,
      error: validation.error,
      prompt_hash: promptHash,
      ...modelMeta,
      basis: [`${validation.error.message}.`, "No finding from this attempt is applied; every control is Not evaluated on this snapshot."],
    });
    append({
      event_type: "evaluation_completed",
      actor: machineActor,
      snapshot_id: snapshotId,
      evaluation_id: evaluationId,
      evaluation_state: "error",
      attempts: attempt,
      coverage,
      controls_evaluated: 0,
      error: validation.error,
      prompt_hash: promptHash,
      ...modelMeta,
    });
    emit({ source: "app", kind: "quotes_validated", label: `Model output rejected: ${validation.error.code}. Evaluation state error; no partial application.`, ...since(start), detail: validation.error });
    await project({ ...ctx, box }, snapshotId, emit, t0, newEvents);
    recordOutcome(true);
    setTxn("complete");
    return result("error", snapshotId, "error", { error: validation.error, summary: { evaluated: 0, not_evaluated: profile.controls.length } });
  }
  emit({
    source: "app",
    kind: "quotes_validated",
    label: `${validation.quotes_matched} of ${validation.quotes_checked} quotes matched; ${validation.downgraded.length ? `${validation.downgraded.length} finding${validation.downgraded.length === 1 ? "" : "s"} set to not_evaluated` : "a failed match would set the finding to not_evaluated"}. Coverage ${readable.length === pinned.length && !quarantined.size ? "complete" : "incomplete"}.`,
    ...since(start),
    detail: { normalization: NORMALIZATION, downgraded: validation.downgraded, coverage_reasons: [...coverageReason].map(([cid, r]) => ({ control_id: cid, ...r })) },
  });

  // ------------------------------------------------------------------ assessment, classification, staleness
  start = Date.now();
  type Outcome = {
    control: Control;
    findingId: string;
    reason?: NotEvaluatedReason & { fileId?: string };
    clause_support: ClauseSupport[];
    assessment: ReturnType<typeof deriveAssessment>;
    classification: ReturnType<typeof classifyChange>;
    binding: EvidenceRef | null;
    evidence: EvidenceRef[];
    staleness: StalenessResult | null;
    basis: string[];
    conflicting: EvidenceRef | null;
    priorAssessment: string | null;
    priorVerificationBlock: ReturnType<typeof deriveControlState>["prior_verification"];
    priorBinding: EvidenceRef | null;
    model_basis: string[];
    model_suggested_action?: string;
    wording: WordingHit[];
  };
  const outcomes: Outcome[] = [];
  // Re-evaluation attempt (read coverage completed later): controls that already have a completed
  // assessment on this snapshot keep it and its finding id; only the rest take the new result (Codex finding 8).
  const kept = new Set(attempt > 1 ? profile.controls.filter((c) => deriveControlState(store, c, snapshotId).evaluation_event?.event_type === "control_evaluated").map((c) => c.id) : []);
  for (const control of profile.controls) {
    const v = validation.findings.get(control.id)!;
    const reason = coverageReason.get(control.id) ?? v.invalid;
    const pe = priorEvaluation(store.events, control.id, snapshotId);
    const priorBindingEval = pe.binding ? { fileId: pe.binding.fileId!, fileName: pe.binding.fileName ?? "", versionId: pe.binding.versionId ?? "", quote: pe.binding.quote ?? "" } : null;
    const assessment = deriveAssessment(v.clause_support, { conflicting: !!v.conflicting, notEvaluatedReason: reason ?? null });
    const { binding, evidence } = reason ? { binding: null, evidence: [] } : selectBinding(v.clause_support);
    const pvEvent = verifications.get(control.id) ?? null;
    const pb = priorBindings.get(control.id) ?? null;
    // Classify against the verified binding when one exists (Codex finding 1): an unreviewed change
    // stays a change on every later snapshot until a person verifies the new binding.
    const reference = pb ? { binding: { fileId: pb.fileId, fileName: pb.fileName, versionId: pb.versionId, quote: pb.quote }, assessment: "evidence_found" as const } : { binding: priorBindingEval, assessment: (pe.last?.machine_assessment as never) ?? null };
    const classification = classifyChange(reference, assessment, binding);
    let staleness: StalenessResult | null = null;
    if (!reason) {
      const priorText = pb ? store.text(pb.versionId) : undefined;
      const newText = binding ? pinned.find((p) => p.versionId === binding.versionId)?.text ?? undefined : undefined;
      // Both sections must be extractable to compare; otherwise null, which the High-tier rule treats as changed.
      const priorSec = pb && priorText ? sectionText(priorText, pb.quote) : null;
      const newSec = binding && newText ? sectionText(newText, binding.quote) : null;
      const sectionTextChanged = priorSec !== null && newSec !== null ? priorSec !== newSec : null;
      staleness = verificationHolds({
        prior: pb ? { ...pb, versionLabel: pb.versionLabel ?? store.versionLabel(pb.fileId, pb.versionId) } : null,
        binding: binding ? { ...binding, versionLabel: binding.versionLabel } : null,
        classification,
        tier: control.tier,
        materiality: profile.materiality[control.tier],
        sectionTextChanged,
      });
    }
    // Basis from recorded operations only.
    let basis: string[];
    if (reason) basis = notEvaluatedBasis(reason);
    else {
      const hint = hintOf(control.id);
      const newOfPrior = pb ? pinned.find((p) => p.fileId === pb.fileId) : undefined;
      const changedAssertions =
        pb && newOfPrior?.text && (classification === "weakened" || classification === "removed") && store.text(pb.versionId)
          ? assertionsChanged(store.text(pb.versionId)!, pb.quote, newOfPrior.text, input.prior_evidence[control.id]?.map((q) => q.quote) ?? [pb.quote])
          : null;
      const quoteExistedIn =
        classification === "moved" && binding
          ? (store.data.versions[binding.fileId] ?? []).filter((vi) => {
              const t = store.text(vi.versionId);
              return t ? quoteValid(binding.quote, t) : false;
            }).map((vi) => vi.label)
          : undefined;
      const existedBefore = quoteExistedIn && quoteExistedIn.some((l) => l !== binding?.versionLabel) ? quoteExistedIn : undefined;
      basis = buildBasis({
        clauseSupport: v.clause_support,
        assessment,
        classification,
        hint,
        prior: pb,
        newLabelOfPriorFile: newOfPrior?.versionLabel,
        asks: asksForControl(asks, control.id, hint),
        changedAssertions,
        binding,
        quoteExistedIn: existedBefore,
        conflicting: v.conflicting,
        staleness,
      });
      const gone = removed.filter((f) => controlDependsOn(control, f.fileName));
      if (gone.length) basis.push(`Evidence location ${gone.map((f) => f.fileName).join(", ")} is no longer in the package folder (removed since ${prior?.snapshot_id ?? "the prior snapshot"}).`);
    }
    // Wording filter before persistence (Codex finding 18); verbatim quotes are exempt.
    const hits: WordingHit[] = [];
    const exempt = [...v.clause_support.flatMap((c) => (c.quote ? [c.quote.quote] : [])), ...(v.conflicting ? [v.conflicting.quote] : []), ...(pb ? [pb.quote] : [])];
    basis = filterBullets("basis", basis, exempt, hits);
    const modelBasis = filterBullets("model_basis", v.model_basis, exempt, hits);
    const modelSuggestion = filterText("model_suggested_action", v.model_suggested_action, exempt, "Model suggestion withheld: it used wording reserved for a human disposition.", hits);
    outcomes.push({
      control,
      // A retry attempt on the same snapshot keeps the finding id (side effects already reference it).
      findingId: Object.values(store.data.findings).find((f) => f.snapshot_id === snapshotId && f.control_id === control.id)?.finding_id ?? store.nextFindingId(),
      reason,
      clause_support: v.clause_support,
      assessment,
      classification,
      binding,
      evidence,
      staleness,
      basis,
      conflicting: v.conflicting,
      priorAssessment: (pe.last?.machine_assessment as string | null) ?? null,
      priorVerificationBlock: pvEvent ? priorVerificationFromEvent(pvEvent) : null,
      priorBinding: pb,
      model_basis: modelBasis,
      model_suggested_action: modelSuggestion,
      wording: hits,
    });
  }

  // ------------------------------------------------------------------ 9. Ledger: control events, then staleness events
  const machineCtx = (o: Outcome) => ({ current_disposition: "unreviewed" as const, prior_verification: o.priorVerificationBlock });
  const snapFile = (fileId?: string) => snapshot.files.find((f) => f.fileId === fileId);
  for (const o of outcomes) {
    if (kept.has(o.control.id)) continue;
    if (o.reason) {
      const f = snapFile(o.reason.fileId);
      append({
        event_type: "evaluation_error",
        actor: APP_ACTOR,
        snapshot_id: snapshotId,
        control_id: o.control.id,
        machine_assessment: "not_evaluated",
        prior_machine_assessment: o.priorAssessment as never,
        change_classification: "none",
        ...machineCtx(o),
        fileId: f?.fileId ?? null,
        fileName: f?.fileName ?? null,
        versionId: f?.versionId ?? null,
        contentHash: f?.contentHash ?? null,
        evaluation_id: evaluationId,
        attempt,
        coverage,
        error: { code: o.reason.code, message: o.reason.message },
        basis: o.basis,
        finding_id: o.findingId,
        projection: { box_metadata: "n/a" },
        ...(validation.findings.get(o.control.id)?.invalid ? { rejected_output: validation.findings.get(o.control.id)!.raw } : {}),
      });
      continue;
    }
    append({
      event_type: "control_evaluated",
      actor: machineActor,
      snapshot_id: snapshotId,
      control_id: o.control.id,
      machine_assessment: o.assessment,
      prior_machine_assessment: o.priorAssessment as never,
      change_classification: o.classification,
      ...machineCtx(o),
      verification_holds: o.staleness?.holds ?? null,
      // Exact "changed nothing" (judge B10): unchanged binding and the verification holds, so no
      // acknowledgment, binding change or needs-review outcome exists for this control on this snapshot.
      changed_nothing: o.classification === "unchanged" && o.staleness?.holds === true,
      fileId: o.binding?.fileId ?? null,
      fileName: o.binding?.fileName ?? null,
      versionId: o.binding?.versionId ?? null,
      contentHash: snapFile(o.binding?.fileId)?.contentHash ?? null,
      quote: o.binding?.quote ?? null,
      basis: o.basis,
      clause_support: o.clause_support,
      evidence: o.evidence,
      ...(o.conflicting ? { conflicting_quote: o.conflicting } : {}),
      evaluation_id: evaluationId,
      attempt,
      coverage,
      prompt_hash: promptHash,
      ...modelMeta,
      finding_id: o.findingId,
      model_basis: o.model_basis,
      ...(o.wording.length ? { wording_filter: o.wording } : {}),
      projection: { box_metadata: "n/a" },
    });
  }
  for (const o of outcomes) {
    if (kept.has(o.control.id) || !o.staleness || !o.binding) continue;
    const type = stalenessEventType(o.staleness, o.classification);
    if (!type) continue;
    const common = {
      actor: APP_ACTOR,
      snapshot_id: snapshotId,
      control_id: o.control.id,
      machine_assessment: o.assessment,
      change_classification: o.classification,
      ...machineCtx(o),
      fileId: o.binding.fileId,
      fileName: o.binding.fileName,
      versionId: o.binding.versionId,
      contentHash: snapFile(o.binding.fileId)?.contentHash ?? null,
      quote: o.binding.quote,
      verification_holds: !!o.staleness.holds,
    };
    if (type === "verification_holds") append({ event_type: type, ...common, note: o.staleness.note, materiality: o.staleness.materiality });
    else if (type === "verification_requires_acknowledgment") {
      append({
        event_type: type,
        ...common,
        note: o.staleness.note,
        materiality: o.staleness.materiality,
        acknowledgment: { required: true, severity: `${o.control.tier} acknowledgment`, reason: o.staleness.reason },
      });
    } else {
      const pb = o.priorBinding!;
      const existed = (store.data.versions[o.binding.fileId] ?? []).some((vi) => vi.versionId !== o.binding!.versionId && quoteValid(o.binding!.quote, store.text(vi.versionId) ?? ""));
      append({
        event_type: type,
        ...common,
        previous_binding: pb,
        acknowledgment: { required: true, severity: "Low" },
        note: `selected binding moved from ${pb.fileName} ${pb.versionLabel ?? pb.versionId} to ${o.binding.fileName} ${o.binding.versionLabel ?? o.binding.versionId}; ${existed ? "the quote already existed in that file, so the binding moved and the support did not" : "the quote is new in that file"}`,
      });
    }
  }

  const findingsOut: StoredFinding[] = [];
  const quotesLine = `${validation.quotes_matched} of ${validation.quotes_checked}`;
  const keptRows = kept.size ? buildRows(store, profile, snapshotId, { withPrior: false }) : [];
  const completedEvent = store.append({
    phase: "live",
    run_id: ctx.runId,
    event_type: "evaluation_completed",
    actor: machineActor,
    snapshot_id: snapshotId,
    evaluation_id: evaluationId,
    evaluation_state: "complete",
    attempts: attempt,
    coverage,
    controls_evaluated: outcomes.length,
    outcomes: outcomes.map((o) => {
      const k = kept.has(o.control.id) ? keptRows.find((r) => r.control_id === o.control.id) : undefined;
      return k ? { control_id: o.control.id, machine_assessment: k.machine_assessment, change_classification: k.change_classification } : { control_id: o.control.id, machine_assessment: o.assessment, change_classification: o.classification };
    }),
    ...(kept.size ? { kept_from_earlier_attempt: [...kept] } : {}),
    prompt_hash: promptHash,
    ...modelMeta,
    quotes_validated: quotesLine,
    box_ai_asks: asks.map((a) => ({ query: a.query, files_asked: a.files_asked.length, cited_statements: a.cited_statements, rejected_citations: a.rejected_citations.length, fallback: a.fallback })),
    input_gate: gateInfo,
  }, opts, { save: false });
  newEvents.push(completedEvent);

  // Persist findings (finding ids KEEL-2026-04NN continue the counter) in the same save as evaluation_completed.
  const rows = buildRows(store, profile, snapshotId);
  for (const o of outcomes) {
    if (kept.has(o.control.id)) continue;
    const row = rows.find((r) => r.control_id === o.control.id)!;
    const pb = o.priorBinding;
    const pv = verifications.get(o.control.id);
    const f: StoredFinding = {
      finding_id: o.findingId,
      control_id: o.control.id,
      control_title: o.control.title,
      tier: o.control.tier,
      materiality: profile.materiality[o.control.tier],
      snapshot_id: snapshotId,
      machine_assessment: o.assessment,
      change_classification: o.classification,
      basis: o.basis,
      evidence: o.evidence,
      clause_support: o.clause_support,
      prior_evidence: pb && pv ? [{ ...pb, verified_by: pv.actor.name, verified_role: pv.actor.role, verified_at: pv.ts, verified_snapshot_id: pv.snapshot_id ?? undefined }] : [],
      verification_holds: !!o.staleness?.holds,
      acknowledgment_required: !!o.staleness?.acknowledgment_required,
      acknowledgment_reason: o.staleness?.reason,
      severity: row.status.severity,
      not_evaluated_reason: o.reason ? { code: o.reason.code, message: o.reason.message } : undefined,
      model_id: modelMeta.model_id,
      inference_profile: modelMeta.inference_profile,
      prompt_version: modelMeta.prompt_version,
      prompt_hash: promptHash ?? "",
      mrm_model_id: config.mrmModelId,
      normalization: NORMALIZATION,
      box_deep_link: `https://app.box.com/folder/${config.box.folderId}?keel_finding=${o.findingId}`,
      suggested_action: filterText("suggested_action", suggestedAction(row, o.control, store), [], "Review the cited evidence.", o.wording),
      run_id: ctx.runId,
      model_basis: o.model_basis,
      model_suggested_action: o.model_suggested_action,
      conflicting_quote: o.conflicting,
    };
    store.data.findings[f.finding_id] = f;
    findingsOut.push(f);
  }
  setTxn("evaluated", false);
  recordOutcome(true); // recorded at findings_applied, in the same write
  store.save(); // one write: evaluation_completed, the findings, the transaction stage and the run outcome
  const counts = {
    weakened: outcomes.filter((o) => o.assessment === "evidence_weakened").length,
    moved: outcomes.filter((o) => o.classification === "moved").length,
    ack: outcomes.filter((o) => o.staleness?.acknowledgment_required).length,
    holds: outcomes.filter((o) => o.staleness?.holds).length,
    notEval: outcomes.filter((o) => o.assessment === "not_evaluated").length,
    contradicted: outcomes.filter((o) => o.assessment === "evidence_contradicted").length,
    absent: outcomes.filter((o) => o.assessment === "evidence_absent").length,
  };
  const parts = [
    counts.notEval && `${counts.notEval} not evaluated`,
    counts.contradicted && `${counts.contradicted} contradicted`,
    counts.absent && `${counts.absent} absent`,
    counts.weakened && `${counts.weakened} weakened`,
    counts.moved && `${counts.moved} binding moved`,
    counts.ack && `${counts.ack} ${outcomes.filter((o) => o.staleness?.acknowledgment_required).map((o) => o.control.tier).join(", ")} acknowledgment`,
    counts.holds && `${counts.holds} verifications hold`,
  ].filter(Boolean);
  emit({ source: "app", kind: "findings_applied", label: `Findings applied: ${parts.join(", ") || "no change"}`, ...since(start), detail: { assessment_rule: profile.assessment_rule, finding_ids: findingsOut.map((f) => f.finding_id) } });
  const evaluationEventIds = newEvents.filter((e) => ["texts_fetched", "input_gate", "evaluation_attempt", "control_evaluated", "evaluation_error", "verification_holds", "verification_requires_acknowledgment", "binding_changed", "evaluation_completed"].includes(e.event_type)).map((e) => e.event_id);
  emit({ source: "app", kind: "ledger_events_written", label: `Ledger events written: ${evaluationEventIds.length} events, hash chain extended`, startMs: Date.now() - t0, durationMs: 0, detail: { event_ids: evaluationEventIds, chain_head: store.data.ledger.head } });

  // ------------------------------------------------------------------ 10. Projection, 11. review tasks
  checkpoint();
  const published = await project({ ...ctx, box }, snapshotId, emit, t0, newEvents);
  checkpoint();
  if (published.ok) setTxn("published");
  start = Date.now();
  const tasks = await createReviewTasks({ store, box, profile, config, snapshotId, runId: ctx.runId, quarantined: [...quarantined.values()].map((q) => ({ fileId: q.fileId, fileName: q.fileName, versionId: q.versionId, injection: q.injection })), append });
  if (tasks.created.length || tasks.failed.length || tasks.carried.length) {
    emit({
      source: "box",
      kind: "box_task_created",
      label: tasks.created.length
        ? `Box review tasks created: ${tasks.created.map((t) => ((t as { purpose?: string; label?: string }).purpose ? ((t as { label?: string }).label ?? `${pinned.find((p) => p.fileId === t.fileId)?.fileName ?? t.fileId} quarantine`) : t.control_id)).join(", ")} (assigned to ${config.reviewer.name})${tasks.failed.length ? `; ${tasks.failed.length} failed` : ""}`
        : tasks.failed.length
          ? `Box review task creation failed for ${tasks.failed.join(", ")}`
          : `Open review tasks carried over (binding unchanged): ${tasks.carried.map((t) => t.control_id).join(", ")}`,
      ...since(start),
      detail: { tasks: tasks.created, failed: tasks.failed, carried: tasks.carried.map((t) => ({ task_id: t.task_id, control_id: t.control_id, snapshot_id: t.snapshot_id })) },
    });
  }
  if (published.ok && !tasks.failed.length) setTxn("complete");
  return result("complete", snapshotId, "complete", {
    findings: findingsOut,
    tasks: tasks.created,
    summary: { evaluated: outcomes.filter((o) => o.assessment !== "not_evaluated").length, not_evaluated: outcomes.filter((o) => o.assessment === "not_evaluated").length },
  });
}

/**
 * Statements of a Box AI citation that string-match the pinned text. Box cites passage chunks (several
 * sentences, markdown emphasis, list markers), so a chunk that does not match as a whole is checked
 * sentence by sentence; only sentences bearing a query term (or quoted in the answer) are kept.
 */
export function validatedStatements(passage: string, pinned: string, terms: string[], answer = ""): string[] {
  if (quoteValid(passage, pinned) && sentences(passage).length <= 1) return [passage.trim()];
  const nAnswer = norm(answer);
  return sentences(passage)
    .map((sn) => sn.replace(/^(\s*([-*+]|\d+\.)\s+)+/, "").replace(/^#+\s*/, "").trim())
    .filter((sn) => norm(sn).length >= 8 && (terms.some((t) => hasTerm(sn, t)) || (nAnswer && nAnswer.includes(norm(sn)))))
    .filter((sn) => quoteValid(sn, pinned));
}

async function project(
  ctx: PipelineContext,
  snapshotId: string,
  emit: (s: Omit<TraceStep, "seq">) => TraceStep,
  t0: number,
  collected: LedgerEvent[],
) {
  const start = Date.now();
  const before = ctx.store.events.length;
  const r = await publishProjection({ store: ctx.store, box: ctx.box, profile: ctx.profile, config: ctx.config, snapshotId, extra: { phase: "live", run_id: ctx.runId } });
  const ev = ctx.store.events.slice(before);
  collected.push(...ev);
  emit({
    source: "box",
    kind: r.ok ? "box_folder_metadata_written" : "box_folder_metadata_write_failed",
    label: r.ok
      ? "Box folder metadata written: keel_snapshot_id, one status field per control, keel_last_human_review, keel_record_url"
      : `Box folder metadata write failed; Box keeps its last values (last projected snapshot ${String(r.event.last_projected_snapshot ?? "none")})`,
    startMs: start - t0,
    durationMs: Date.now() - start,
    detail: { pointer_check: r.event.pointer_check, fields: r.fields, outcome: r.event.projection.box_metadata, event_ids: ev.map((e) => e.event_id) },
  });
  return r;
}

export { bindingsEqual, deepLink };
