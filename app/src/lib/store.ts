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
import { appendEvent as ledgerAppend, GENESIS, type EventInput, type LedgerState } from "./engine/ledger";
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
  drafts: Record<string, { text: string; drafted_by: "box_ai_text_gen" | "template"; at: string; reason: string }>;
  mock_box: MockBoxState | null;
}

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
  };
}

/** In-memory store for tests (no disk). */
export function createMemoryStore(mode: RunMode = "mock"): Store {
  return new Store(seedData(mode), null);
}

const G = globalThis as unknown as { __keelStore?: Store };

/** The process-wide store. Loads app/data/store.json if valid, else seeds. */
export function getStore(opts: { path: string; mode: RunMode }): Store {
  if (G.__keelStore) return G.__keelStore;
  let data: StoreData | null = null;
  try {
    if (fs.existsSync(opts.path)) {
      const parsed = JSON.parse(fs.readFileSync(opts.path, "utf8")) as StoreData;
      if (parsed.version === 1 && parsed.mode === opts.mode && Array.isArray(parsed.ledger?.events)) data = parsed;
    }
  } catch {
    data = null;
  }
  const store = new Store(data ?? (opts.mode === "mock" ? seedData("mock") : emptyData()), opts.path);
  // Runs interrupted by a restart can never finish; mark them so the UI stops waiting.
  for (const r of Object.values(store.data.runs)) {
    if (!r.done) {
      r.done = true;
      r.status = "error";
      r.error = "interrupted by a server restart";
    }
  }
  if (!data) store.save();
  G.__keelStore = store;
  return store;
}

/** Reset to the seed (mock) or empty (live) and persist. */
export function resetToSeed(store: Store, mode: RunMode): void {
  store.data = mode === "mock" ? seedData("mock") : emptyData();
  store.save();
}

export type { FindingCard };
