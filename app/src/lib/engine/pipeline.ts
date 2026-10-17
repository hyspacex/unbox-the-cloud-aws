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
import type { BoxAdapter } from "../box/adapter";
import type { DiffHint, Evaluator, EvaluatorInput, EvaluatorResult, InputGate, SearchSnapshotTool } from "../agent/evaluator.types";
import type { KeelConfig } from "../config";
import type { BoxAiAskRecord, RunRecord, Store, StoredFinding, StoredTask } from "../store";
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
import { findQuote, hasTerm, NORMALIZATION, quoteValid, sectionText } from "./normalize";
import { APP_ACTOR, eventOpts, publishProjection } from "./publish";
import { stalenessEventType, verificationHolds, type StalenessResult } from "./staleness";
import { buildRows, deriveControlState, latestVerification, priorEvaluation, verificationBinding } from "./state";
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

export async function runReview(ctx: PipelineContext): Promise<PipelineResult> {
  const { box, evaluator, gate, store, profile, config } = ctx;
  const opts = eventOpts(config);
  const t0 = Date.now();
  const steps: TraceStep[] = [];
  const newEvents: LedgerEvent[] = [];
  const asks: BoxAiAskRecord[] = [];
  let gateInfo: RunRecord["gate"] = { ran: false, label: "omitted: Decider not running" };
  let searchInfo: RunRecord["search_tool"] = { label: "Box AI ask", fallback: false };

  const emit = (s: Omit<TraceStep, "seq">): TraceStep => {
    const step: TraceStep = { seq: steps.length + 1, ts: new Date(t0 + s.startMs).toISOString(), ...s };
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

  // ------------------------------------------------------------------ 1. Intake: observe versions
  const prior = store.currentSnapshot;
  let start = Date.now();
  const items = await box.listFolderItems(config.box.folderId);
  const changed = items.filter((it) => prior?.files.find((f) => f.fileId === it.fileId)?.versionId !== it.currentVersionId);
  if (!changed.length) {
    emit({ source: "box", kind: "no_change", label: "No new file version in the package folder; nothing to evaluate", ...since(start) });
    return result("no_change", prior?.snapshot_id ?? null, "complete");
  }
  const labels = new Map<string, string>();
  for (const it of items) {
    const versions = await box.listFileVersions(it.fileId);
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
  const snapshotNumber = store.data.snapshots.length + 1;
  const snapshotId = `S${snapshotNumber}`;
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
  emit({
    source: "box",
    kind: "file_version_observed",
    label: `New version observed: ${changed.map((c) => `${c.fileName} ${labels.get(c.currentVersionId) ?? ""}`.trim()).join(", ")}`,
    ...since(start),
    detail: changed.map((c) => ({ fileId: c.fileId, fileName: c.fileName, versionId: c.currentVersionId, ...store.versionInfo(c.fileId, c.currentVersionId) })),
  });

  // ------------------------------------------------------------------ 2-3. Snapshot, fetch by version, coverage
  start = Date.now();
  const pinned: (PinnedFile & { error?: { code: string; message: string }; contentHash: string })[] = [];
  for (const it of items) {
    const r = await box.downloadVersionText(it.fileId, it.currentVersionId);
    const label = labels.get(it.currentVersionId);
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
  const files: SnapshotFile[] = pinned.map((p) => ({ fileId: p.fileId, fileName: p.fileName, versionId: p.versionId, contentHash: p.contentHash }));
  const capturedAt = utcNow();
  const body = { snapshot_id: snapshotId, captured_at: capturedAt, control_profile_version: profile.profile_version, files };
  const snapshot: Snapshot = {
    ...body,
    files: files.map((f) => ({ ...f, versionLabel: labels.get(f.versionId) })),
    era: `${changed.map((c) => `${c.fileName} ${labels.get(c.currentVersionId) ?? ""}`.trim()).join(", ")} upload`,
    manifest_hash: "sha256:" + sha256Hex(canonicalJSON(body)),
  };
  store.data.snapshots.push(snapshot);
  store.data.current_snapshot_id = snapshotId; // authoritative pointer moves at capture; rows read "Re-check pending"
  append({
    event_type: "snapshot_captured",
    actor: APP_ACTOR,
    snapshot_id: snapshotId,
    manifest_hash: snapshot.manifest_hash,
    control_profile_version: profile.profile_version,
    prior_snapshot_id: prior?.snapshot_id ?? null,
    files: files.map((f) => ({ fileName: f.fileName, versionId: f.versionId, contentHash: f.contentHash })),
  });
  emit({ source: "app", kind: "snapshot_captured", label: `Snapshot ${snapshotId} captured: ${files.length} files`, startMs: start - t0, durationMs: 0, detail: { snapshot_id: snapshotId, manifest_hash: snapshot.manifest_hash, files } });

  const readable = pinned.filter((p) => p.text !== null);
  const evaluationId = `EVAL-${snapshotId}`;
  const coverage = { readable: readable.length, total: pinned.length };
  append({
    event_type: "texts_fetched",
    actor: APP_ACTOR,
    snapshot_id: snapshotId,
    evaluation_id: evaluationId,
    attempt: 1,
    coverage,
    files: pinned.map((p) => ({ fileName: p.fileName, versionId: p.versionId, readable: p.text !== null, ...(p.error ? { reason: p.error } : {}) })),
  });
  emit({
    source: "box",
    kind: "texts_fetched",
    label: `Texts fetched by version: coverage ${readable.length} of ${pinned.length} readable`,
    ...fetchMs,
    detail: {
      coverage: `${readable.length} of ${pinned.length}`,
      files: pinned.map((p) => ({ fileName: p.fileName, versionId: p.versionId, readable: p.text !== null, ...(p.error ? { reason: p.error.message } : {}) })),
    },
  });

  // ------------------------------------------------------------------ 5. Input gate per changed, readable file
  const quarantined = new Map<string, InputGateResult>();
  const gateResults: InputGateResult[] = [];
  for (const it of changed) {
    const p = pinned.find((x) => x.fileId === it.fileId)!;
    if (p.text === null) continue;
    start = Date.now();
    const g = await gate.gate({ fileId: p.fileId, fileName: p.fileName, versionId: p.versionId, contentHash: p.contentHash }, p.text);
    if (!g) continue; // Decider not running: the step is omitted, never faked
    gateResults.push(g);
    const isQ = g.injection.answer === "yes" && g.injection.probability >= config.gateInjectionThreshold;
    if (isQ) quarantined.set(p.fileId, g);
    append({
      event_type: "input_gate",
      actor: DECIDER_ACTOR(gate.kind),
      snapshot_id: snapshotId,
      fileId: p.fileId,
      fileName: p.fileName,
      versionId: p.versionId,
      contentHash: p.contentHash,
      detail: { injection: g.injection, material_change: g.material_change, options: g.options, latency_ms: g.latency_ms },
      quarantined: isQ,
      threshold: config.gateInjectionThreshold,
      note: isQ ? "quarantined above the injection threshold; text withheld from the evaluator; gate never writes a status" : "gate result recorded; never writes a status",
    });
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
  if (gateResults.length) {
    const g = gateResults[0];
    gateInfo = {
      ran: true,
      label: `Decider 2B: injection ${g.injection.answer} (${fmtProb(g.injection.probability)}), material change ${g.material_change.answer.replace("_", " ")} (${fmtProb(g.material_change.probability)}), ${g.latency_ms} ms${gate.kind === "mock" ? ", mock stand-in" : ", local"}${quarantined.size ? `; quarantined ${[...quarantined.values()].map((q) => q.fileName).join(", ")}` : ""}`,
    };
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
    attempt: 1,
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
    search: async (query, excludeFileName) => {
      const s0 = Date.now();
      const targets = given.filter((p) => p.fileName !== excludeFileName);
      const rec: BoxAiAskRecord = { query, files_asked: targets.map((t) => t.fileName), cited_statements: 0, rejected_citations: [], citations: [], fallback: false, label: "", elapsed_ms: 0 };
      const ans = await box.aiAsk(targets.map((t) => t.fileId), query, { citations: true });
      let raw: { fileId: string; versionId?: string; content: string }[];
      if ("unavailable" in ans && ans.unavailable) {
        rec.fallback = true;
        const terms = query.split(/\s+OR\s+/);
        raw = targets.flatMap((t) => {
          const hit = (t.text ?? "").split(/(?<=[.!?])\s+/).find((sn) => terms.some((term) => hasTerm(sn, term)));
          return hit ? [{ fileId: t.fileId, versionId: t.versionId, content: hit }] : [];
        });
      } else raw = (ans as { citations: { fileId: string; versionId?: string; content: string }[] }).citations;
      for (const c of raw) {
        const t = targets.find((x) => x.fileId === c.fileId);
        let reason: string | null = null;
        if (!t) reason = "cited file is not among the snapshot files asked";
        else if (c.versionId && c.versionId !== t.versionId) reason = `cited version ${c.versionId} is not the pinned version ${t.versionId}`;
        else if (!quoteValid(c.content, t.text ?? "")) reason = "cited passage not found in the pinned version text after normalization";
        if (reason || !t) {
          rec.rejected_citations.push({ ...c, reason: reason ?? "invalid" });
          continue;
        }
        const loc = findQuote(c.content, t.text ?? "");
        rec.citations.push({ fileName: t.fileName, versionId: t.versionId, section: loc?.section ?? "", paragraph: loc?.paragraph, page: loc?.page, quote: c.content });
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
    evalResult = await evaluator.evaluate(input, { search }, (s) => {
      emit({ ...s, startMs: agentStart - t0 + s.startMs, detail: s.detail ?? undefined, parent_seq: agentStep.seq } as TraceStep);
    });
  } catch (err) {
    evalError = { code: "EVALUATOR_FAILED", message: err instanceof Error ? err.message : String(err) };
  }
  agentStep.durationMs = Date.now() - agentStart;
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
      attempt: 1,
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
      attempts: 1,
      coverage,
      controls_evaluated: 0,
      error: validation.error,
      prompt_hash: promptHash,
      ...modelMeta,
    });
    emit({ source: "app", kind: "quotes_validated", label: `Model output rejected: ${validation.error.code}. Evaluation state error; no partial application.`, ...since(start), detail: validation.error });
    await project(ctx, snapshotId, emit, t0, newEvents);
    return result("error", snapshotId, "error", { error: validation.error });
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
  };
  const outcomes: Outcome[] = [];
  for (const control of profile.controls) {
    const v = validation.findings.get(control.id)!;
    const reason = coverageReason.get(control.id) ?? v.invalid;
    const pe = priorEvaluation(store.events, control.id, snapshotId);
    const priorBindingEval = pe.binding ? { fileId: pe.binding.fileId!, fileName: pe.binding.fileName ?? "", versionId: pe.binding.versionId ?? "", quote: pe.binding.quote ?? "" } : null;
    const assessment = deriveAssessment(v.clause_support, { conflicting: !!v.conflicting, notEvaluatedReason: reason ?? null });
    const { binding, evidence } = reason ? { binding: null, evidence: [] } : selectBinding(v.clause_support);
    const classification = classifyChange({ binding: priorBindingEval, assessment: (pe.last?.machine_assessment as never) ?? null }, assessment, binding);
    const pvEvent = verifications.get(control.id) ?? null;
    const pb = priorBindings.get(control.id) ?? null;
    let staleness: StalenessResult | null = null;
    if (!reason) {
      const priorText = pb ? store.text(pb.versionId) : undefined;
      const newText = binding ? pinned.find((p) => p.versionId === binding.versionId)?.text ?? undefined : undefined;
      const sectionTextChanged = pb && binding && priorText && newText ? sectionText(priorText, pb.quote) !== sectionText(newText, binding.quote) : null;
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
    }
    outcomes.push({
      control,
      findingId: store.nextFindingId(),
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
      model_basis: v.model_basis,
      model_suggested_action: v.model_suggested_action,
    });
  }

  // ------------------------------------------------------------------ 9. Ledger: control events, then staleness events
  const machineCtx = (o: Outcome) => ({ current_disposition: "unreviewed" as const, prior_verification: o.priorVerificationBlock });
  const snapFile = (fileId?: string) => snapshot.files.find((f) => f.fileId === fileId);
  for (const o of outcomes) {
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
        attempt: 1,
        coverage,
        error: { code: o.reason.code, message: o.reason.message },
        basis: o.basis,
        finding_id: o.findingId,
        projection: { box_metadata: "pending" },
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
      attempt: 1,
      coverage,
      prompt_hash: promptHash,
      ...modelMeta,
      finding_id: o.findingId,
      model_basis: o.model_basis,
      projection: { box_metadata: "pending" },
    });
  }
  for (const o of outcomes) {
    if (!o.staleness || !o.binding) continue;
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
  append({
    event_type: "evaluation_completed",
    actor: machineActor,
    snapshot_id: snapshotId,
    evaluation_id: evaluationId,
    evaluation_state: "complete",
    attempts: 1,
    coverage,
    controls_evaluated: outcomes.length,
    outcomes: outcomes.map((o) => ({ control_id: o.control.id, machine_assessment: o.assessment, change_classification: o.classification })),
    prompt_hash: promptHash,
    ...modelMeta,
    quotes_validated: quotesLine,
    box_ai_asks: asks.map((a) => ({ query: a.query, files_asked: a.files_asked.length, cited_statements: a.cited_statements, rejected_citations: a.rejected_citations.length, fallback: a.fallback })),
    input_gate: gateInfo,
  });

  // Persist findings (finding ids KEEL-2026-04NN continue the counter).
  const rows = buildRows(store, profile, snapshotId);
  for (const o of outcomes) {
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
      suggested_action: suggestedAction(row, o.control, store),
      run_id: ctx.runId,
      model_basis: o.model_basis,
      model_suggested_action: o.model_suggested_action,
      conflicting_quote: o.conflicting,
    };
    store.data.findings[f.finding_id] = f;
    findingsOut.push(f);
  }
  store.save();
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
  await project(ctx, snapshotId, emit, t0, newEvents);
  start = Date.now();
  const tasks = await createReviewTasks({ store, box, profile, config, snapshotId, runId: ctx.runId, quarantined: [...quarantined.values()], append });
  if (tasks.created.length || tasks.failed.length || tasks.carried.length) {
    emit({
      source: "box",
      kind: "box_task_created",
      label: tasks.created.length
        ? `Box review tasks created: ${tasks.created.map((t) => ((t as { purpose?: string }).purpose ? `${pinned.find((p) => p.fileId === t.fileId)?.fileName ?? t.fileId} quarantine` : t.control_id)).join(", ")} (assigned to ${config.reviewer.name})${tasks.failed.length ? `; ${tasks.failed.length} failed` : ""}`
        : tasks.failed.length
          ? `Box review task creation failed for ${tasks.failed.join(", ")}`
          : `Open review tasks carried over (binding unchanged): ${tasks.carried.map((t) => t.control_id).join(", ")}`,
      ...since(start),
      detail: { tasks: tasks.created, failed: tasks.failed, carried: tasks.carried.map((t) => ({ task_id: t.task_id, control_id: t.control_id, snapshot_id: t.snapshot_id })) },
    });
  }
  return result("complete", snapshotId, "complete", { findings: findingsOut, tasks: tasks.created });
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
