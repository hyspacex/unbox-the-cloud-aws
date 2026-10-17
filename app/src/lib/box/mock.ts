/**
 * In-memory Box seeded from the Lantern fixture (CONTRACTS.md, lib/box/mock.ts): folder 318840021,
 * five files with their versions and texts, the folder metadata instance, tasks and assignments with
 * a state machine, Box AI ask (deterministic string search with real citations) and text generation.
 *
 * State is plain JSON so the store can persist it (the dev server survives module reloads and
 * restarts with the mock Box consistent with the ledger). Test hooks are methods on the adapter.
 */
import { createHash } from "node:crypto";
import type { BoxIdentity, BoxResolutionState } from "../types";
import type {
  BoxAdapter,
  BoxAiAskResponse,
  BoxAiTextGenResponse,
  BoxFileVersion,
  BoxFolderItem,
  BoxReadResult,
  BoxTaskAssignmentView,
  BoxWriteResult,
} from "./adapter";
import { FIXTURE_DOCUMENTS, fixture } from "../fixture";
import { FIXTURE_IDENTITIES } from "../config";
import { hasTerm, norm, sentences } from "../engine/normalize";
import { draftFromBrief, type AuthorDraftBrief } from "../engine/draft";

export interface MockVersion {
  versionId: string;
  createdAt: string;
  uploader: BoxIdentity;
  comment?: string;
  /** Extra provenance carried with the upload (Confluence editor, Jira key); surfaced on the card. */
  metadata?: Record<string, string>;
  text: string;
}

export interface MockTask {
  task_id: string;
  fileId: string;
  message: string;
  action: "review" | "complete";
  due_at?: string;
  created_at: string;
  assignments: BoxTaskAssignmentView[];
}

export interface MockBoxState {
  folderId: string;
  folderName: string;
  files: { fileId: string; fileName: string; versions: MockVersion[] }[];
  metadata: Record<string, Record<string, string | null>>;
  tasks: MockTask[];
  counters: { task: number; version: number };
  directory: BoxIdentity[];
  hooks: {
    failNextMetadataWrite: number;
    failNextTaskCreate: number;
    failReads: string[];
    boxAiAvailable: boolean;
    textGenAvailable: boolean;
    /** Next Box AI ask returns these citations verbatim (acceptance 20). */
    nextAskCitations: { fileId: string; versionId?: string; content: string }[] | null;
  };
}

export const SERVICE_ACCOUNT: BoxIdentity = { id: "30118899", login: "keel-service@meridiantrust.example", name: "Keel service account" };

const ident = (i: { box_user_id: string; login: string; name: string }): BoxIdentity => ({ id: i.box_user_id, login: i.login, name: i.name });

export const MOCK_DIRECTORY: BoxIdentity[] = [
  ident(FIXTURE_IDENTITIES.alvarez),
  ident(FIXTURE_IDENTITIES.priya),
  ident(FIXTURE_IDENTITIES.marcus),
  ident(FIXTURE_IDENTITIES.dana),
  ident(FIXTURE_IDENTITIES.jpark),
  { id: "30118812", login: "kevin.lindqvist@meridiantrust.example", name: "Kevin Lindqvist" },
  { id: "30118813", login: "owen.pryce@meridiantrust.example", name: "Owen Pryce" },
  { id: "30118890", login: "svc-confluence-export@meridiantrust.example", name: "svc-confluence-export" },
  SERVICE_ACCOUNT,
];

const byName = (name: string): BoxIdentity => MOCK_DIRECTORY.find((d) => d.name === name) ?? { id: "0", login: "unknown", name };

/** Seed state: the fixture's versions as of S3 (architecture.md v2 current; v3 not yet uploaded). */
export function seedMockBoxState(): MockBoxState {
  const observed = new Map<string, { ts: string; by: string }>();
  for (const e of fixture.seedEvents()) {
    if (e.event_type === "file_version_observed" && e.versionId) observed.set(e.versionId, { ts: e.ts, by: e.actor.name });
  }
  const files: MockBoxState["files"] = [];
  for (const s of fixture.snapshots().snapshots[0].files) files.push({ fileId: s.fileId, fileName: s.fileName, versions: [] });
  for (const d of FIXTURE_DOCUMENTS.filter((x) => x.seed)) {
    const o = observed.get(d.versionId);
    files
      .find((f) => f.fileId === d.fileId)!
      .versions.push({ versionId: d.versionId, createdAt: o?.ts ?? "2026-10-03T00:00:00Z", uploader: byName(o?.by ?? "Kevin Lindqvist"), text: fixture.text(d.path) });
  }
  const lastProjection = [...fixture.seedEvents()].reverse().find((e) => e.event_type === "box_metadata_written");
  return {
    folderId: fixture.snapshots().folderId,
    folderName: fixture.ledger().folderName ?? "Project Lantern - ARB package",
    files,
    metadata: { keelReview: { ...((lastProjection?.fields_written as Record<string, string | null>) ?? {}) } },
    tasks: [],
    counters: { task: 77120931, version: 1801102300 },
    directory: MOCK_DIRECTORY,
    hooks: { failNextMetadataWrite: 0, failNextTaskCreate: 0, failReads: [], boxAiAvailable: true, textGenAvailable: true, nextAskCitations: null },
  };
}

const sleep = (ms: number) => (ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve());
const nowIso = () => new Date().toISOString().replace(/\.\d{3}Z$/, "Z");

export class MockBoxAdapter implements BoxAdapter {
  readonly kind = "mock" as const;
  constructor(
    private readonly getState: () => MockBoxState,
    private readonly onChange: () => void = () => {},
    private readonly latencyScale = 0,
  ) {}

  private get s() {
    return this.getState();
  }
  private delay(ms: number) {
    return sleep(ms * this.latencyScale);
  }
  private file(fileId: string) {
    const f = this.s.files.find((x) => x.fileId === fileId);
    if (!f) throw new Error(`mock Box: no file ${fileId}`);
    return f;
  }
  private identity(a: { id: string } | { login: string }): BoxIdentity {
    const d = this.s.directory.find((x) => ("id" in a ? x.id === a.id : x.login === a.login));
    if (!d) throw new Error(`mock Box: no user ${JSON.stringify(a)}`);
    return d;
  }

  async listFolderItems(folderId: string): Promise<BoxFolderItem[]> {
    await this.delay(30);
    if (folderId !== this.s.folderId) throw new Error(`mock Box: folder ${folderId} not found`);
    return this.s.files.map((f) => {
      const cur = f.versions[f.versions.length - 1];
      return { fileId: f.fileId, fileName: f.fileName, currentVersionId: cur.versionId, size: Buffer.byteLength(cur.text, "utf8") };
    });
  }

  async listFileVersions(fileId: string): Promise<BoxFileVersion[]> {
    await this.delay(20);
    return this.file(fileId).versions.map((v, i) => ({
      versionId: v.versionId,
      createdAt: v.createdAt,
      uploader: v.uploader,
      comment: v.comment,
      label: `v${i + 1}`,
      ...(v.metadata ? { metadata: v.metadata } : {}),
    }));
  }

  async downloadVersionText(fileId: string, versionId: string): Promise<BoxReadResult> {
    await this.delay(60);
    const f = this.file(fileId);
    if (this.s.hooks.failReads.some((k) => k === f.fileName || k === fileId || k === `${fileId}@${versionId}`)) {
      return { ok: false, error: { code: "TEXT_REPRESENTATION_NOT_READY", message: "Box text representation still processing after upload (HTTP 202). File temporarily unreadable." } };
    }
    const v = f.versions.find((x) => x.versionId === versionId);
    if (!v) return { ok: false, error: { code: "VERSION_NOT_FOUND", message: `version ${versionId} of ${f.fileName} not found` } };
    return { ok: true, text: v.text, sha256: createHash("sha256").update(v.text, "utf8").digest("hex") };
  }

  async readFolderMetadata(folderId: string, templateKey: string) {
    await this.delay(20);
    if (folderId !== this.s.folderId) return null;
    return this.s.metadata[templateKey] ? { ...this.s.metadata[templateKey] } : null;
  }

  async writeFolderMetadata(folderId: string, templateKey: string, fields: Record<string, string | null>): Promise<BoxWriteResult> {
    await this.delay(150);
    if (this.s.hooks.failNextMetadataWrite > 0) {
      this.s.hooks.failNextMetadataWrite -= 1;
      this.onChange();
      return { ok: false, error: { code: "METADATA_WRITE_FAILED", message: "mock Box: 503 Service Unavailable on metadata update" } };
    }
    if (folderId !== this.s.folderId) return { ok: false, error: { code: "NOT_FOUND", message: `folder ${folderId}` } };
    this.s.metadata[templateKey] = { ...fields };
    this.onChange();
    return { ok: true };
  }

  async createTask(fileId: string, message: string, action: "review" | "complete", dueAt?: string): Promise<{ task_id: string }> {
    await this.delay(90);
    if (this.s.hooks.failNextTaskCreate > 0) {
      this.s.hooks.failNextTaskCreate -= 1;
      this.onChange();
      throw new Error("mock Box: task creation failed (HTTP 503)");
    }
    this.file(fileId);
    const n = this.s.counters.task++;
    const task: MockTask = { task_id: `box-task-${n}`, fileId, message, action, due_at: dueAt, created_at: nowIso(), assignments: [] };
    this.s.tasks.push(task);
    this.onChange();
    return { task_id: task.task_id };
  }

  async assignTask(taskId: string, assignee: { id: string } | { login: string }) {
    await this.delay(40);
    const t = this.s.tasks.find((x) => x.task_id === taskId);
    if (!t) throw new Error(`mock Box: task ${taskId} not found`);
    const who = this.identity(assignee);
    const assignment_id = taskId.replace("box-task-", "box-asgn-").replace(/-77/, "-88");
    t.assignments.push({ assignment_id, assigned_to: who, resolution_state: "incomplete", message: "", completed_at: null });
    this.onChange();
    return { assignment_id, assigned_to: who };
  }

  async listTaskAssignments(taskId: string): Promise<BoxTaskAssignmentView[]> {
    await this.delay(30);
    const t = this.s.tasks.find((x) => x.task_id === taskId);
    return t ? t.assignments.map((a) => ({ ...a, assigned_to: { ...a.assigned_to } })) : [];
  }

  async aiAsk(fileIds: string[], prompt: string, _opts: { citations: true }): Promise<BoxAiAskResponse> {
    await this.delay(120);
    if (!this.s.hooks.boxAiAvailable) return { unavailable: true, reason: "Box AI unavailable on this tenant (mock hook)" };
    if (this.s.hooks.nextAskCitations) {
      const citations = this.s.hooks.nextAskCitations;
      this.s.hooks.nextAskCitations = null;
      this.onChange();
      return { answer: `${citations.length} passages cited.`, citations };
    }
    const terms = parseQueryTerms(prompt);
    const citations: { fileId: string; versionId: string; content: string }[] = [];
    for (const id of fileIds) {
      const f = this.s.files.find((x) => x.fileId === id);
      if (!f) continue;
      const cur = f.versions[f.versions.length - 1]; // Box AI reads current versions
      const best = bestSentence(cur.text, terms);
      if (best) citations.push({ fileId: f.fileId, versionId: cur.versionId, content: best });
    }
    const answer = citations.length
      ? `Found ${citations.length} statement${citations.length === 1 ? "" : "s"}: ` + citations.map((c) => `"${c.content}"`).join(" ")
      : "None of the files contain a statement matching the question.";
    return { answer, citations };
  }

  async aiTextGen(_fileIds: string[], prompt: string): Promise<BoxAiTextGenResponse> {
    await this.delay(180);
    if (!this.s.hooks.textGenAvailable) return { unavailable: true, reason: "Box AI text generation unavailable (mock hook)" };
    const m = /<keel-draft>([\s\S]*?)<\/keel-draft>/.exec(prompt);
    if (!m) return { text: prompt.slice(0, 500) };
    return { text: draftFromBrief(JSON.parse(m[1]) as AuthorDraftBrief) };
  }

  async currentUser(): Promise<BoxIdentity> {
    return SERVICE_ACCOUNT;
  }

  // ------------------------------------------------------------------ test and scenario hooks

  /** Upload a new version of an existing file (becomes the current version). */
  uploadVersion(
    fileName: string,
    text: string,
    opts: { uploader?: string | BoxIdentity; comment?: string; versionId?: string; createdAt?: string; metadata?: Record<string, string> } = {},
  ): MockVersion {
    const f = this.s.files.find((x) => x.fileName === fileName);
    if (!f) throw new Error(`mock Box: no file named ${fileName}`);
    const uploader = typeof opts.uploader === "object" ? opts.uploader : byName(opts.uploader ?? "Kevin Lindqvist");
    let versionId = opts.versionId ?? String(this.s.counters.version++);
    if (this.s.files.some((x) => x.versions.some((v) => v.versionId === versionId))) versionId = String(this.s.counters.version++);
    const v: MockVersion = { versionId, createdAt: opts.createdAt ?? nowIso(), uploader, comment: opts.comment, metadata: opts.metadata, text };
    f.versions.push(v);
    this.onChange();
    return v;
  }

  /** Resolve an assignment as a person would in Box. `as` becomes assigned_to as returned by Box. */
  resolveAssignment(assignmentId: string, r: { resolution_state: BoxResolutionState; message: string; as?: BoxIdentity; completed_at?: string }): BoxTaskAssignmentView {
    for (const t of this.s.tasks) {
      const a = t.assignments.find((x) => x.assignment_id === assignmentId);
      if (!a) continue;
      a.resolution_state = r.resolution_state;
      a.message = r.message;
      a.completed_at = r.completed_at ?? nowIso();
      if (r.as) a.assigned_to = r.as;
      this.onChange();
      return { ...a };
    }
    throw new Error(`mock Box: assignment ${assignmentId} not found`);
  }

  /** Reconcile an ambiguous creation: an existing task on the file with exactly this message. */
  async findTaskByMessage(fileId: string, message: string): Promise<{ task_id: string } | null> {
    const t = this.s.tasks.find((x) => x.fileId === fileId && x.message === message);
    return t ? { task_id: t.task_id } : null;
  }

  /** Remove a file from the package folder (Codex finding 11 probe). */
  removeFile(fileName: string) {
    this.s.files = this.s.files.filter((f) => f.fileName !== fileName);
    this.onChange();
  }
  failNextMetadataWrite(n = 1) {
    this.s.hooks.failNextMetadataWrite += n;
    this.onChange();
  }
  failNextTaskCreate(n = 1) {
    this.s.hooks.failNextTaskCreate += n;
    this.onChange();
  }
  failRead(fileNameOrId: string) {
    this.s.hooks.failReads.push(fileNameOrId);
    this.onChange();
  }
  clearReadFailures() {
    this.s.hooks.failReads = [];
    this.onChange();
  }
  setBoxAiAvailable(v: boolean) {
    this.s.hooks.boxAiAvailable = v;
    this.onChange();
  }
  setTextGenAvailable(v: boolean) {
    this.s.hooks.textGenAvailable = v;
    this.onChange();
  }
  setNextAskCitations(c: MockBoxState["hooks"]["nextAskCitations"]) {
    this.s.hooks.nextAskCitations = c;
    this.onChange();
  }
  task(taskId: string): MockTask | undefined {
    return this.s.tasks.find((t) => t.task_id === taskId);
  }
  tasks(): MockTask[] {
    return this.s.tasks;
  }
  metadata(templateKey = "keelReview") {
    return this.s.metadata[templateKey] ?? null;
  }
  directoryLookup(nameOrIdOrLogin: string): BoxIdentity | undefined {
    return this.s.directory.find((d) => d.id === nameOrIdOrLogin || d.login === nameOrIdOrLogin || d.name === nameOrIdOrLogin);
  }
}

/** "RTO OR RPO OR roll back" -> ["RTO", "RPO", "roll back"]; free text falls back to its longer words. */
export function parseQueryTerms(prompt: string): string[] {
  const q = /query:\s*(.+)$/im.exec(prompt)?.[1] ?? prompt;
  if (/\sOR\s/.test(q)) return q.split(/\s+OR\s+/).map((t) => t.trim().replace(/^["']|["']$/g, "")).filter(Boolean);
  return q.split(/\s+/).filter((w) => w.length > 4);
}

/** The sentence with the most distinct matching terms (ties: first in the document). */
export function bestSentence(text: string, terms: string[]): string | null {
  let best: string | null = null;
  let score = 0;
  for (const s of sentences(text)) {
    const n = terms.filter((t) => hasTerm(s, t)).length;
    if (n > score) {
      score = n;
      best = s;
    }
  }
  return best && norm(best).length > 0 ? best : null;
}

export { draftFromBrief, type AuthorDraftBrief } from "../engine/draft";
