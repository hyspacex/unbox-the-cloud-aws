/**
 * JSON file store at app/data/store.json (gitignored). Holds the ledger (events + chain head),
 * snapshots and the authoritative current-snapshot pointer, known file versions and texts, tasks
 * with their immutable server-side mapping, dedup keys, runs (traces), counters, author drafts, and
 * in mock mode the mock Box state.
 *
 * Writes are atomic (temp file + rename) and happen after every ledger append, so a crash mid-run
 * leaves a consistent file: the ledger is a valid chain up to the last appended event.
 * The instance is cached on globalThis so the Next dev server survives module reloads.
 */
import fs from "node:fs";
import path from "node:path";
import type { BoxTask, BoxTaskResponse, FindingCard, LedgerEvent, RunMode, Snapshot, SnapshotFile, TaskMapping, Trace } from "./types";
import { appendEvent as ledgerAppend, GENESIS, verifyChain, type EventInput, type LedgerState } from "./engine/ledger";
import { fixture, FIXTURE_DOCUMENTS } from "./fixture";
import { seedMockBoxState, type MockBoxState } from "./box/mock";
import type { Finding } from "./types";

export interface VersionInfo {
  fileId: string;
  fileName: string;
  versionId: string;
  label: string;
  createdAt?: string;
  uploader?: string;
  uploader_id?: string;
  comment?: string;
  metadata?: Record<string, string>;
  contentHash?: string;
}

export interface StoredTask extends BoxTask {
  status: "open" | "completed";
  created_at: string;
  resolution_state?: BoxTaskResponse["resolution_state"];
  response?: BoxTaskResponse | null;
  completed_at?: string;
  due_rule?: string;
  drafted_by?: string;
}

export interface RunRecord extends Trace {
  done: boolean;
  status: "running" | "done" | "error";
  error?: string;
  compressed_timing: boolean;
  timing_label: string;
  scenario?: string;
  gate: { ran: boolean; label: string };
  search_tool: { label: string; fallback: boolean };
  box_ai_asks: BoxAiAskRecord[];
  finished_at?: string;
}

export interface BoxAiAskRecord {
  query: string;
  control_id?: string;
  files_asked: string[];
  cited_statements: number;
  rejected_citations: { fileId: string; versionId?: string; content: string; reason: string }[];
  citations: { fileName: string; versionId: string; section: string; paragraph?: number; page?: number; quote: string }[];
  fallback: boolean;
  label: string;
  elapsed_ms: number;
}

export interface StoredFinding extends Finding {
  run_id?: string;
  model_basis?: string[];
  model_suggested_action?: string;
  conflicting_quote?: import("./types").EvidenceRef | null;
  rejected_output?: unknown;
}

export interface StoreData {
  version: 1;
  mode: RunMode;
  seeded_at: string;
  ledger: LedgerState;
  snapshots: Snapshot[];
  current_snapshot_id: string | null;
  versions: Record<string, VersionInfo[]>;
  texts: Record<string, string>;
  tasks: StoredTask[];
  task_mappings: Record<string, TaskMapping>;
  dedup_keys: string[];
  runs: Record<string, RunRecord>;
  run_order: string[];
  counters: { finding: number; run: number };
  findings: Record<string, StoredFinding>;
  drafts: Record<string, { text: string; drafted_by: "box_ai_text_gen" | "template"; at: string; reason: string; snapshot_id?: string }>;
  mock_box: MockBoxState | null;
  /** Input-gate decisions by `${fileId}@${versionId}`; a quarantined version stays withheld on every later evaluation. */
  gate_decisions: Record<string, GateDecision>;
  /** Human-response processing stages by dedup key, so a retry resumes instead of deduplicating away. */
  processing: Record<string, ProcessingRecord>;
  /** Author-task drafts the reviewer approved, by finding id (spec 3 step 11: shown before sending). */
  approved_drafts: Record<string, ApprovedDraft>;
}

export interface GateDecision {
  fileId: string;
  fileName: string;
  versionId: string;
  contentHash: string;
  quarantined: boolean;
  injection: { answer: "yes" | "no"; probability: number };
  snapshot_id: string;
  event_id: string;
}

export type ProcessingStage = "response_ingested" | "author_task_created" | "awaiting_draft" | "disposition_recorded" | "rejected" | "acknowledged" | "recorded";

export interface ProcessingRecord {
  dedup_key: string;
  task_id: string;
  assignment_id: string;
  control_id: string;
  finding_id: string;
  stage: ProcessingStage;
  mapped_action: string | null;
  target_snapshot_id?: string;
  author_task_id?: string;
  due_at?: string;
  ingest_event_id?: string;
  updated_at: string;
}

export interface ApprovedDraft {
  finding_id: string;
  snapshot_id: string;
  reason: string;
  text: string;
  drafted_by: "box_ai_text_gen" | "template";
  approved_at: string;
  edited_before_sending: boolean;
}

export const TERMINAL_STAGES: ProcessingStage[] = ["disposition_recorded", "rejected", "acknowledged", "recorded"];

export class Store {
  data: StoreData;
  constructor(
    data: StoreData,
    private readonly filePath: string | null,
  ) {
    this.data = data;
  }

  /** Atomic write: temp file + rename. In-memory stores (tests) skip the disk. */
  save(): void {
    if (!this.filePath) return;
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const tmp = `${this.filePath}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.data));
    fs.renameSync(tmp, this.filePath);
  }

  /** Append one ledger event and persist immediately (write-ahead for side effects that follow). */
  append(input: EventInput, opts: { mrmModelId: string; folderId?: string }): LedgerEvent {
    const e = ledgerAppend(this.data.ledger, input, opts);
    this.save();
    return e;
  }

  get events(): LedgerEvent[] {
    return this.data.ledger.events;
  }
  snapshot(id: string | null | undefined): Snapshot | undefined {
    return id ? this.data.snapshots.find((s) => s.snapshot_id === id) : undefined;
  }
  get currentSnapshot(): Snapshot | undefined {
    return this.snapshot(this.data.current_snapshot_id);
  }
  /** The snapshot immediately before `id` in capture order. */
  previousSnapshot(id: string): Snapshot | undefined {
    const i = this.data.snapshots.findIndex((s) => s.snapshot_id === id);
    return i > 0 ? this.data.snapshots[i - 1] : undefined;
  }
  versionLabel(fileId: string, versionId: string): string | undefined {
    return this.data.versions[fileId]?.find((v) => v.versionId === versionId)?.label;
  }
  versionInfo(fileId: string, versionId: string): VersionInfo | undefined {
    return this.data.versions[fileId]?.find((v) => v.versionId === versionId);
  }
  registerVersion(v: VersionInfo): void {
    const list = (this.data.versions[v.fileId] ??= []);
    const i = list.findIndex((x) => x.versionId === v.versionId);
    if (i >= 0) list[i] = { ...list[i], ...v };
    else list.push(v);
  }
  text(versionId: string): string | undefined {
    return this.data.texts[versionId];
  }
  nextFindingId(): string {
    this.data.counters.finding += 1;
    return `KEEL-2026-${String(this.data.counters.finding).padStart(4, "0")}`;
  }
  nextRunId(now = new Date()): string {
    this.data.counters.run += 1;
    const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "").replace("T", "-");
    return `run-${stamp}-${String(this.data.counters.run).padStart(3, "0")}`;
  }
}

// ---------------------------------------------------------------------------------------------
// Seed
// ---------------------------------------------------------------------------------------------

/** Seed versions from the fixture: labels from the README mapping, uploader and time from file_version_observed. */
function seedVersions(): Record<string, VersionInfo[]> {
  const observed = new Map<string, LedgerEvent>();
  for (const e of fixture.ledger().events) if (e.event_type === "file_version_observed" && e.versionId) observed.set(e.versionId, e);
  const hashes = new Map<string, string>();
  for (const s of fixture.snapshots().snapshots) for (const f of s.files) hashes.set(f.versionId, f.contentHash);
  const out: Record<string, VersionInfo[]> = {};
  for (const d of FIXTURE_DOCUMENTS.filter((x) => x.seed)) {
    const o = observed.get(d.versionId);
    (out[d.fileId] ??= []).push({
      fileId: d.fileId,
      fileName: d.fileName,
      versionId: d.versionId,
      label: d.versionLabel,
      createdAt: o?.ts,
      uploader: o?.actor.name,
      comment: (o?.version_comment as string | undefined) ?? undefined,
      contentHash: hashes.get(d.versionId),
    });
  }
  return out;
}

const withLabels = (files: SnapshotFile[]): SnapshotFile[] =>
  files.map((f) => ({ ...f, versionLabel: FIXTURE_DOCUMENTS.find((d) => d.versionId === f.versionId)?.versionLabel }));

/**
 * Mock-mode baseline (CONTRACTS.md mock state machine step 1): the seed phase of ledger.json
 * (EVT-0001..EVT-0067: S1 to S3, the ARB decision, eight verifications), snapshots S1 to S3,
 * current snapshot S3, the mock Box at the same point.
 */
export function seedData(mode: RunMode = "mock"): StoreData {
  const seed = fixture.seedEvents().map((e) => structuredClone(e));
  const snapshots = fixture
    .snapshots()
    .snapshots.filter((s) => seed.some((e) => e.event_type === "snapshot_captured" && e.snapshot_id === s.snapshot_id))
    .map((s) => ({ ...structuredClone(s), files: withLabels(s.files) }));
  const texts: Record<string, string> = {};
  for (const d of FIXTURE_DOCUMENTS.filter((x) => x.seed)) texts[d.versionId] = fixture.text(d.path);
  return {
    version: 1,
    mode,
    seeded_at: new Date().toISOString(),
    ledger: { genesis: GENESIS, head: seed[seed.length - 1].chain_hash, events: seed },
    snapshots,
    current_snapshot_id: snapshots[snapshots.length - 1].snapshot_id,
    versions: seedVersions(),
    texts,
    tasks: [],
    task_mappings: {},
    dedup_keys: [],
    runs: {},
    run_order: [],
    counters: { finding: 400, run: 0 },
    findings: {},
    drafts: {},
    mock_box: mode === "mock" ? seedMockBoxState() : null,
    gate_decisions: {},
    processing: {},
    approved_drafts: {},
  };
}

/** Live-mode empty store: no snapshots yet; the first submit captures the baseline. */
export function emptyData(): StoreData {
  return {
    version: 1,
    mode: "live",
    seeded_at: new Date().toISOString(),
    ledger: { genesis: GENESIS, head: GENESIS, events: [] },
    snapshots: [],
    current_snapshot_id: null,
    versions: {},
    texts: {},
    tasks: [],
    task_mappings: {},
    dedup_keys: [],
    runs: {},
    run_order: [],
    counters: { finding: 400, run: 0 },
    findings: {},
    drafts: {},
    mock_box: null,
    gate_decisions: {},
    processing: {},
    approved_drafts: {},
  };
}

/** In-memory store for tests (no disk). */
export function createMemoryStore(mode: RunMode = "mock"): Store {
  return new Store(seedData(mode), null);
}

const G = globalThis as unknown as { __keelStore?: Store };

/** The store file exists but cannot be trusted. Keel fails closed and leaves the file untouched. */
export class StoreLoadError extends Error {
  constructor(
    readonly path: string,
    readonly reason: string,
  ) {
    super(`Keel store ${path} is unreadable or inconsistent (${reason}); it was left untouched. Move it aside, or POST /api/reset in mock mode.`);
  }
}

/** Parse and validate a persisted store: structure, mode and the full hash chain (Codex finding 12). */
export function loadStoreFile(filePath: string, mode: RunMode): StoreData {
  let parsed: StoreData;
  try {
    parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as StoreData;
  } catch (err) {
    throw new StoreLoadError(filePath, `not valid JSON: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.ledger?.events) || !Array.isArray(parsed.snapshots)) throw new StoreLoadError(filePath, "unexpected structure");
  if (parsed.mode !== mode) throw new StoreLoadError(filePath, `written in ${parsed.mode} mode, running in ${mode} mode`);
  const v = verifyChain(parsed.ledger.events, parsed.ledger.genesis);
  if (!v.ok || v.head !== parsed.ledger.head) throw new StoreLoadError(filePath, `hash chain does not verify${v.first_bad_event_id ? ` at ${v.first_bad_event_id}` : " to the recorded head"}`);
  parsed.gate_decisions ??= {};
  parsed.processing ??= {};
  parsed.approved_drafts ??= {};
  return parsed;
}

/**
 * The process-wide store. A missing file is seeded (mock) or started empty (live); an existing
 * file that does not validate throws StoreLoadError and is never overwritten.
 */
export function getStore(opts: { path: string; mode: RunMode; mrmModelId?: string; folderId?: string }): Store {
  if (G.__keelStore) return G.__keelStore;
  const exists = fs.existsSync(opts.path);
  const data = exists ? loadStoreFile(opts.path, opts.mode) : opts.mode === "mock" ? seedData("mock") : emptyData();
  const store = new Store(data, opts.path);
  recoverInterruptedRuns(store, { mrmModelId: opts.mrmModelId ?? "MRM-AI-0271", folderId: opts.folderId });
  if (!exists) store.save();
  G.__keelStore = store;
  return store;
}

/** Tests and reset: drop the process-wide instance. */
export function forgetStore(): void {
  G.__keelStore = undefined;
}

/**
 * Runs interrupted by a restart can never finish (Codex finding 13): mark the run, and give its
 * snapshot a terminal evaluation outcome in the ledger so the next submit retries as attempt N+1.
 */
export function recoverInterruptedRuns(store: Store, opts: { mrmModelId: string; folderId?: string }): void {
  let changed = false;
  for (const r of Object.values(store.data.runs)) {
    if (r.done) continue;
    r.done = true;
    r.status = "error";
    r.error = "interrupted by a server restart";
    changed = true;
    const snap = r.snapshot_id;
    const evs = store.events;
    const lastAttempt = evs.map((e, i) => (e.snapshot_id === snap && e.event_type === "evaluation_attempt" ? i : -1)).reduce((a, b) => Math.max(a, b), -1);
    const lastDone = evs.map((e, i) => (e.snapshot_id === snap && e.event_type === "evaluation_completed" ? i : -1)).reduce((a, b) => Math.max(a, b), -1);
    const captured = evs.some((e) => e.snapshot_id === snap && e.event_type === "snapshot_captured");
    if (captured && lastDone < Math.max(lastAttempt, evs.findIndex((e) => e.snapshot_id === snap && e.event_type === "snapshot_captured"))) {
      const error = { code: "RUN_INTERRUPTED", message: `run ${r.run_id} was interrupted by a server restart before the evaluation finished` };
      const actor = { type: "app" as const, name: "keel", role: "snapshot, validation, staleness and projection" };
      ledgerAppend(store.data.ledger, { event_type: "evaluation_error", actor, snapshot_id: snap, phase: "live", run_id: r.run_id, evaluation_id: `EVAL-${snap}`, error }, opts);
      ledgerAppend(store.data.ledger, { event_type: "evaluation_completed", actor, snapshot_id: snap, phase: "live", run_id: r.run_id, evaluation_id: `EVAL-${snap}`, evaluation_state: "error", error }, opts);
    }
  }
  if (changed) store.save();
}

/** Reset to the seed (mock) or empty (live) and persist. */
export function resetToSeed(store: Store, mode: RunMode): void {
  store.data = mode === "mock" ? seedData("mock") : emptyData();
  store.save();
}

export type { FindingCard };
