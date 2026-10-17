/**
 * RealBoxAdapter: the live Box implementation of BoxAdapter on box-typescript-sdk-gen 1.19.
 * Used only when MOCK_MODE=false. Constructing it never touches the network and never throws;
 * missing credentials surface as BOX_NOT_CONFIGURED on first use (spec section 13: fail
 * informatively, never fake a result).
 *
 * Auth: BOX_DEVELOPER_TOKEN (BoxDeveloperTokenAuth, 60-minute token) when set, else client
 * credentials grant (BoxCcgAuth with BOX_CLIENT_ID, BOX_CLIENT_SECRET, BOX_ENTERPRISE_ID, acting as
 * the app's service account). BOX_SUBJECT_USER_ID, when set, adds the As-User header
 * (client.withAsUserHeader), which needs the "Make API calls using the as-user header" app scope.
 * Every request, including the extracted-text download, goes through the SDK client and its network
 * session, so auth and As-User always apply.
 *
 * Deadlines: every request carries a cancellationToken that fires after BOX_REQUEST_TIMEOUT_MS
 * (default 20000) or when the caller's signal aborts (withSignal). Expiry maps to BOX_TIMEOUT.
 *
 * Error policy: methods whose return type is a result union (downloadVersionText,
 * writeFolderMetadata, aiAsk, aiTextGen) never throw for expected failures. Methods whose contract
 * returns a plain value (listFolderItems, listFileVersions, createTask, ...) throw BoxAdapterError
 * with a stable `code` so the engine can record it.
 *
 * Box task semantics (managers/taskAssignments.generated.ts, UpdateTaskAssignmentByIdRequestBody
 * resolutionState, and managers/tasks.generated.ts CreateTaskRequestBody action):
 *   - action "review": an approval task. Assignment resolution_state is incomplete | approved | rejected.
 *   - action "complete": a general task. Assignment resolution_state is incomplete | completed.
 * The engine maps rejected -> returned_to_author, approved + attestation phrase -> verified,
 * completed -> acknowledgment (spec section 3 step 11). This adapter only reports what Box says.
 */
import { createHash } from "node:crypto";
import { BoxClient, BoxCcgAuth, BoxDeveloperTokenAuth, CcgConfig } from "box-typescript-sdk-gen";
import { GetFileByIdHeaders } from "box-typescript-sdk-gen/managers";
import { AiTextGenItemsField } from "box-typescript-sdk-gen/schemas";
import {
  dateTimeFromString,
  dateTimeToString,
  generateByteStreamFromBuffer,
  readByteStream,
  stringToByteStream,
} from "box-typescript-sdk-gen/internal";
import type { BoxIdentity, BoxResolutionState, ProjectionCode } from "../types";
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

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface RealBoxConfig {
  developerToken?: string;
  clientId?: string;
  clientSecret?: string;
  enterpriseId?: string;
  subjectUserId?: string;
  metadataScope: string; // "enterprise"
  /** Prefix that marks a Box file comment as the version comment of the version uploaded just before it. */
  versionNotePrefix: string;
  /** Per-request deadline in ms (BOX_REQUEST_TIMEOUT_MS). */
  requestTimeoutMs: number;
  /**
   * BOX_VERSION_HISTORY=current-only: accept a current-only history when Box refuses the versions
   * endpoint (free plans). Default false: any version-history failure is an error, never a v1-only history.
   */
  allowCurrentOnlyHistory: boolean;
}

export function realBoxConfigFromEnv(env: NodeJS.ProcessEnv = process.env): RealBoxConfig {
  const v = (k: string) => (env[k] && env[k]!.trim() !== "" ? env[k]!.trim() : undefined);
  const timeout = Number(v("BOX_REQUEST_TIMEOUT_MS"));
  return {
    developerToken: v("BOX_DEVELOPER_TOKEN"),
    clientId: v("BOX_CLIENT_ID"),
    clientSecret: v("BOX_CLIENT_SECRET"),
    enterpriseId: v("BOX_ENTERPRISE_ID"),
    subjectUserId: v("BOX_SUBJECT_USER_ID"),
    metadataScope: v("BOX_METADATA_SCOPE") ?? "enterprise",
    versionNotePrefix: VERSION_NOTE_PREFIX,
    requestTimeoutMs: Number.isFinite(timeout) && timeout > 0 ? timeout : 20_000,
    allowCurrentOnlyHistory: v("BOX_VERSION_HISTORY") === "current-only",
  };
}

/** Which env vars are missing for live Box, or [] when one auth path is complete. */
export function missingBoxEnv(env: NodeJS.ProcessEnv = process.env): string[] {
  const c = realBoxConfigFromEnv(env);
  if (c.developerToken) return [];
  const missing: string[] = [];
  if (!c.clientId) missing.push("BOX_CLIENT_ID");
  if (!c.clientSecret) missing.push("BOX_CLIENT_SECRET");
  if (!c.enterpriseId) missing.push("BOX_ENTERPRISE_ID");
  return missing.length ? ["BOX_DEVELOPER_TOKEN or " + missing.join(" + ")] : [];
}

/** Box has no version comment field; scripts post a file comment with this prefix right after the upload. */
export const VERSION_NOTE_PREFIX = "Version note: ";

/** The twelve fixed projection codes (spec section 3 step 10), in the order of types.ts. */
export const PROJECTION_CODES = [
  "PENDING",
  "NOT_EVALUATED",
  "VERIFIED",
  "VERIFIED_HOLDS",
  "ACKNOWLEDGE",
  "NEEDS_REVIEW_BINDING",
  "NEEDS_REVIEW_WEAKENED",
  "NEEDS_REVIEW_ABSENT",
  "NEEDS_REVIEW_CONFLICT",
  "RETURNED_TO_AUTHOR",
  "NOT_APPLICABLE",
  "EXCEPTION",
] as const satisfies readonly ProjectionCode[];

/** Metadata field key for a control: SEC-ARCH-07 -> keel_status_SEC_ARCH_07 (matches the fixture). */
export function statusFieldKey(controlId: string): string {
  return "keel_status_" + controlId.replace(/[^A-Za-z0-9]/g, "_");
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class BoxAdapterError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "BoxAdapterError";
  }
}

interface BoxApiErrorLike {
  name?: string;
  message?: string;
  responseInfo?: { statusCode?: number; code?: string; body?: { message?: string; code?: string } | unknown };
}

/** The SDK stores responseInfo.code JSON-serialized ('"unauthorized"'); decode it. */
function plainCode(c: unknown): string | undefined {
  if (typeof c !== "string" || !c) return undefined;
  let s = c.trim();
  if (s.startsWith('"')) {
    try {
      const parsed = JSON.parse(s);
      if (typeof parsed === "string") s = parsed;
    } catch {
      s = s.replace(/^"+|"+$/g, "");
    }
  }
  s = s.replace(/[^A-Za-z0-9_]+/g, "_").replace(/^_+|_+$/g, "");
  return s || undefined;
}

const isAbort = (e: unknown) => {
  const name = (e as { name?: string })?.name ?? "";
  const msg = e instanceof Error ? e.message : String(e);
  return /AbortError|TimeoutError/.test(name) || /\babort(ed)?\b|timed? ?out|operation was aborted/i.test(msg);
};

/** Map anything thrown by the SDK to a stable {code, message}. Duck-typed: the SDK ships CJS and ESM builds. */
export function mapBoxError(e: unknown): { code: string; message: string; status?: number } {
  if (e instanceof BoxAdapterError) return { code: e.code, message: e.message, status: e.status };
  const err = e as BoxApiErrorLike;
  const status = err?.responseInfo?.statusCode;
  if (typeof status === "number") {
    const body = (err.responseInfo?.body ?? {}) as { message?: string; code?: string };
    const boxCode = plainCode(body.code) ?? plainCode(err.responseInfo?.code);
    const code = boxCode ? `BOX_${boxCode.toUpperCase()}` : `BOX_HTTP_${status}`;
    return { code, message: `Box API ${status}${boxCode ? ` ${boxCode}` : ""}: ${body.message ?? err.message ?? "request failed"}`, status };
  }
  const msg = e instanceof Error ? e.message : String(e);
  if (isAbort(e)) return { code: "BOX_TIMEOUT", message: `Box request aborted or past its deadline (BOX_REQUEST_TIMEOUT_MS): ${msg}` };
  if (/ENOTFOUND|ECONNREFUSED|ETIMEDOUT|fetch failed|network/i.test(msg)) return { code: "BOX_NETWORK", message: `Box unreachable: ${msg}` };
  if (/token has expired|invalid_token|invalid_client|invalid_grant|unauthorized_client|401/i.test(msg))
    return {
      code: "BOX_AUTH",
      message: `Box authentication failed: ${msg} (developer tokens last 60 minutes: regenerate in the Developer Console; for CCG check client id/secret, enterprise id and that an admin authorized the app)`,
    };
  return { code: "BOX_SDK_ERROR", message: msg };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type DT = Parameters<typeof dateTimeToString>[0];
const iso = (d: DT | null | undefined): string | null => (d ? dateTimeToString(d) : null);
const ident = (u: { id?: string; login?: string; name?: string } | undefined | null): BoxIdentity => ({
  id: u?.id ?? "",
  login: u?.login ?? "",
  name: u?.name ?? "",
});
const sha256 = (b: Buffer | string) => "sha256:" + createHash("sha256").update(b).digest("hex");

/** Document containers that must go through extraction even when their bytes happen to be ASCII. */
export type BinaryKind = "pdf" | "ooxml" | "ole" | null;
const BINARY_EXT: Record<string, Exclude<BinaryKind, null>> = {
  pdf: "pdf",
  docx: "ooxml",
  xlsx: "ooxml",
  pptx: "ooxml",
  docm: "ooxml",
  xlsm: "ooxml",
  pptm: "ooxml",
  doc: "ole",
  xls: "ole",
  ppt: "ole",
};
const OLE_MAGIC = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);

/** Extension first, then magic bytes (%PDF-, PK\x03\x04 zip container, OLE2). */
export function detectBinary(name: string, buf: Buffer): BinaryKind {
  const ext = /\.([A-Za-z0-9]+)$/.exec(name)?.[1]?.toLowerCase();
  if (ext && BINARY_EXT[ext]) return BINARY_EXT[ext];
  if (buf.subarray(0, 5).toString("latin1") === "%PDF-") return "pdf";
  if (buf.length >= 4 && buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04) return "ooxml";
  if (buf.subarray(0, 8).equals(OLE_MAGIC)) return "ole";
  return null;
}

const TEXT_EXT = /\.(md|markdown|txt|text|csv|json|ya?ml|xml|html?)$/i;

/** True when the bytes decode as UTF-8 text without NUL bytes or replacement characters. */
function looksLikeText(buf: Buffer): boolean {
  if (buf.includes(0)) return false;
  return !buf.toString("utf8").includes("�");
}

/** Reject when the signal fires, even if the underlying promise ignores it (body reads). */
function withAbort<T>(p: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(signal.reason ?? new DOMException("aborted", "AbortError"));
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(signal.reason ?? new DOMException("aborted", "AbortError"));
    signal.addEventListener("abort", onAbort, { once: true });
    p.then(
      (v) => (signal.removeEventListener("abort", onAbort), resolve(v)),
      (e) => (signal.removeEventListener("abort", onAbort), reject(e)),
    );
  });
}

/** Field and option check for an existing keelReview template (also used by the integration gate). */
export interface TemplateFieldSpec {
  type: "string" | "enum";
  key: string;
  displayName: string;
  description?: string;
  options?: { key: string }[];
}

export function templateSpec(profile: { controls: { id: string; title?: string }[] }): TemplateFieldSpec[] {
  return [
    { type: "string", key: "keel_snapshot_id", displayName: "Keel snapshot id" },
    ...profile.controls.map((c) => ({
      type: "enum" as const,
      key: statusFieldKey(c.id),
      displayName: `Keel status ${c.id}`,
      description: c.title,
      options: PROJECTION_CODES.map((key) => ({ key })),
    })),
    { type: "string", key: "keel_last_human_review", displayName: "Keel last human review" },
    { type: "string", key: "keel_record_url", displayName: "Keel record URL" },
  ];
}

export function checkTemplateFields(
  have: readonly { key: string; type: string; options?: readonly { key: string }[] }[],
  wanted: TemplateFieldSpec[],
): { missingFields: TemplateFieldSpec[]; missingOptions: { fieldKey: string; keys: string[] }[]; incompatible: { key: string; have: string; want: string }[] } {
  const byKey = new Map(have.map((f) => [f.key, f]));
  const missingFields: TemplateFieldSpec[] = [];
  const missingOptions: { fieldKey: string; keys: string[] }[] = [];
  const incompatible: { key: string; have: string; want: string }[] = [];
  for (const w of wanted) {
    const h = byKey.get(w.key);
    if (!h) {
      missingFields.push(w);
      continue;
    }
    if (h.type !== w.type) {
      incompatible.push({ key: w.key, have: h.type, want: w.type });
      continue;
    }
    if (w.type === "enum") {
      const present = new Set((h.options ?? []).map((o) => o.key));
      const keys = (w.options ?? []).map((o) => o.key).filter((k) => !present.has(k));
      if (keys.length) missingOptions.push({ fieldKey: w.key, keys });
    }
  }
  return { missingFields, missingOptions, incompatible };
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

/** Minimal surface of BoxClient the adapter uses; tests inject a stub with the same shape. */
export type BoxClientLike = Pick<
  BoxClient,
  "folders" | "files" | "fileVersions" | "downloads" | "folderMetadata" | "metadataTemplates" | "tasks" | "taskAssignments" | "ai" | "users" | "uploads" | "comments" | "makeRequest"
>;

export class RealBoxAdapter implements BoxAdapter {
  readonly kind = "real" as const;
  private readonly cfg: RealBoxConfig;
  private _client: BoxClientLike | null = null;
  private readonly signal?: AbortSignal;
  /** Set when listFileVersions returned a current-only history (BOX_VERSION_HISTORY=current-only). */
  lastHistoryFallback: { fileId: string; reason: string } | null = null;

  constructor(cfg: Partial<RealBoxConfig> = {}, opts: { client?: BoxClientLike; signal?: AbortSignal } = {}) {
    this.cfg = { ...realBoxConfigFromEnv(), ...cfg };
    this._client = opts.client ?? null;
    this.signal = opts.signal;
  }

  /** A view of this adapter whose requests also abort when `signal` aborts (shares the client). */
  withSignal(signal: AbortSignal | undefined): RealBoxAdapter {
    if (!signal) return this;
    return new RealBoxAdapter(this.cfg, { client: this.client(), signal: this.signal ? AbortSignal.any([this.signal, signal]) : signal });
  }

  /** Cancellation token for one request: the per-request deadline combined with the caller's signal. */
  private ct(): AbortSignal {
    const deadline = AbortSignal.timeout(this.cfg.requestTimeoutMs);
    return this.signal ? AbortSignal.any([deadline, this.signal]) : deadline;
  }

  /** Human-readable description of which auth path is configured (for the integration gate). */
  describeAuth(): string {
    if (this.cfg.developerToken) return "developer token (expires 60 min after it was generated)";
    if (this.cfg.clientId && this.cfg.clientSecret && this.cfg.enterpriseId)
      return `client credentials grant, enterprise ${this.cfg.enterpriseId}${this.cfg.subjectUserId ? `, As-User ${this.cfg.subjectUserId}` : ", service account"}`;
    return "not configured";
  }

  /** The SDK client, built lazily. Throws BOX_NOT_CONFIGURED with the exact env vars needed. */
  client(): BoxClientLike {
    if (this._client) return this._client;
    const c = this.cfg;
    let auth: BoxDeveloperTokenAuth | BoxCcgAuth;
    if (c.developerToken) auth = new BoxDeveloperTokenAuth({ token: c.developerToken });
    else if (c.clientId && c.clientSecret && c.enterpriseId)
      auth = new BoxCcgAuth({ config: new CcgConfig({ clientId: c.clientId, clientSecret: c.clientSecret, enterpriseId: c.enterpriseId }) });
    else
      throw new BoxAdapterError(
        "BOX_NOT_CONFIGURED",
        `Live Box is not configured: set ${missingBoxEnv().join(", ") || "BOX_DEVELOPER_TOKEN"} in app/.env.local (see docs/INTEGRATION.md), or run with MOCK_MODE=true.`,
      );
    let client = new BoxClient({ auth });
    if (c.subjectUserId) client = client.withAsUserHeader(c.subjectUserId);
    this._client = client;
    return client;
  }

  // ---- files and versions -------------------------------------------------

  async listFolderItems(folderId: string): Promise<BoxFolderItem[]> {
    const out: BoxFolderItem[] = [];
    try {
      let marker: string | undefined;
      do {
        const page = await this.client().folders.getFolderItems(folderId, {
          queryParams: { fields: ["id", "type", "name", "file_version", "sha1", "size"], usemarker: true, marker, limit: 1000 },
          cancellationToken: this.ct(),
        });
        for (const e of page.entries ?? []) {
          const it = e as { type?: string; id: string; name?: string; fileVersion?: { id: string }; sha1?: string; size?: number };
          if (it.type !== "file") continue;
          out.push({ fileId: it.id, fileName: it.name ?? it.id, currentVersionId: it.fileVersion?.id ?? "", sha1: it.sha1, size: it.size });
        }
        marker = (page as { nextMarker?: string | null }).nextMarker ?? undefined;
      } while (marker);
    } catch (e) {
      const m = mapBoxError(e);
      throw new BoxAdapterError(m.code, `listFolderItems(${folderId}): ${m.message}`, m.status);
    }
    return out;
  }

  /** Current version id and parent folder of a file (one request). */
  async fileInfo(fileId: string): Promise<{ currentVersionId: string; parentId: string | null; name: string }> {
    try {
      const f = await this.client().files.getFileById(fileId, { queryParams: { fields: ["name", "file_version", "parent"] }, cancellationToken: this.ct() });
      return { currentVersionId: f.fileVersion?.id ?? "", parentId: f.parent?.id ?? null, name: f.name ?? "" };
    } catch (e) {
      const m = mapBoxError(e);
      throw new BoxAdapterError(m.code, `fileInfo(${fileId}): ${m.message}`, m.status);
    }
  }

  /** Current version ids for several files; null for a file whose lookup failed (never guessed). */
  async currentVersionIds(fileIds: string[]): Promise<Map<string, string | null>> {
    const pairs = await Promise.all(
      fileIds.map(async (id) => {
        try {
          return [id, (await this.fileInfo(id)).currentVersionId || null] as const;
        } catch {
          return [id, null] as const;
        }
      }),
    );
    return new Map(pairs);
  }

  /**
   * Oldest first, labelled v1..vN, current version last. Box's versions endpoint excludes the
   * current version, so it is appended from the file's file_version. A failure of the versions
   * endpoint throws (it is never presented as a v1-only history) unless BOX_VERSION_HISTORY=current-only,
   * in which case the single current version is labelled "current" and lastHistoryFallback says why.
   */
  async listFileVersions(fileId: string): Promise<BoxFileVersion[]> {
    const client = this.client();
    let file;
    try {
      file = await client.files.getFileById(fileId, {
        queryParams: { fields: ["id", "name", "file_version", "sha1", "modified_at", "modified_by", "content_modified_at", "created_at", "created_by"] },
        cancellationToken: this.ct(),
      });
    } catch (e) {
      const m = mapBoxError(e);
      throw new BoxAdapterError(m.code, `listFileVersions(${fileId}): ${m.message}`, m.status);
    }
    const current: BoxFileVersion = {
      versionId: file.fileVersion?.id ?? "",
      createdAt: iso(file.contentModifiedAt) ?? iso(file.modifiedAt) ?? iso(file.createdAt) ?? "",
      uploader: file.modifiedBy ? ident(file.modifiedBy) : undefined,
      sha1: file.sha1 ?? file.fileVersion?.sha1,
    };
    const prior = await this.priorVersions(fileId);
    if (!prior.ok) {
      if (!this.cfg.allowCurrentOnlyHistory)
        throw new BoxAdapterError(prior.code, `listFileVersions(${fileId}): version history unavailable: ${prior.reason}. Set BOX_VERSION_HISTORY=current-only to accept a current-only history (labelled "current").`, prior.status);
      this.lastHistoryFallback = { fileId, reason: prior.reason };
      current.label = "current";
      await this.attachVersionNotes(fileId, [current]);
      return [current];
    }
    const older: BoxFileVersion[] = prior.versions
      .filter((v) => !v.trashed)
      .sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0))
      .map(({ trashed: _t, ...v }) => v);
    const all = [...older.filter((v) => v.versionId !== current.versionId), current];
    all.forEach((v, i) => (v.label = `v${i + 1}`));
    await this.attachVersionNotes(fileId, all);
    return all;
  }

  /** For the integration gate: whether Box returned prior versions for this file, and if not, why. */
  async priorVersionsRetained(fileId: string): Promise<{ retained: boolean; count: number; reason?: string }> {
    const r = await this.priorVersions(fileId);
    if (!r.ok) return { retained: false, count: 0, reason: r.reason };
    return { retained: r.versions.length > 0, count: r.versions.length, reason: r.versions.length ? undefined : "Box returned no prior versions" };
  }

  private async priorVersions(fileId: string): Promise<
    { ok: true; versions: (BoxFileVersion & { trashed: boolean })[] } | { ok: false; code: string; reason: string; status?: number }
  > {
    try {
      const res = await this.client().fileVersions.getFileVersions(fileId, {
        queryParams: { fields: ["id", "sha1", "name", "size", "created_at", "modified_at", "modified_by", "trashed_at", "version_number", "uploader_display_name"], limit: 1000 },
        cancellationToken: this.ct(),
      });
      return {
        ok: true,
        versions: (res.entries ?? []).map((v) => ({
          versionId: v.id,
          createdAt: iso(v.createdAt) ?? "",
          uploader: v.modifiedBy ? ident(v.modifiedBy) : undefined,
          sha1: v.sha1,
          trashed: !!v.trashedAt,
        })),
      };
    } catch (e) {
      const m = mapBoxError(e);
      return { ok: false, code: m.code, status: m.status, reason: `${m.message}${m.status === 403 ? " (version history needs a paid Box plan or the app's read scope)" : ""}` };
    }
  }

  /** Version comments: the first "Version note: ..." file comment created at or after a version and before the next one. */
  private async attachVersionNotes(fileId: string, versions: BoxFileVersion[]): Promise<void> {
    let comments: { message: string; createdAt: string }[] = [];
    try {
      const res = await this.client().comments.getFileComments(fileId, { queryParams: { fields: ["message", "created_at", "created_by"], limit: 1000 }, cancellationToken: this.ct() });
      comments = (res.entries ?? [])
        .map((c) => ({ message: c.message ?? "", createdAt: iso(c.createdAt) ?? "" }))
        .filter((c) => c.message.startsWith(this.cfg.versionNotePrefix));
    } catch {
      return; // comments are decoration; a failure leaves comment undefined
    }
    versions.forEach((v, i) => {
      const next = versions[i + 1]?.createdAt;
      const c = comments.find((c) => c.createdAt >= v.createdAt && (!next || c.createdAt < next));
      if (c) v.comment = c.message.slice(this.cfg.versionNotePrefix.length).trim();
    });
  }

  async downloadVersionText(fileId: string, versionId: string): Promise<BoxReadResult> {
    let name = "";
    try {
      const client = this.client();
      const file = await client.files.getFileById(fileId, { queryParams: { fields: ["name", "file_version"] }, cancellationToken: this.ct() });
      name = file.name ?? "";
      const signal = this.ct();
      const stream = await client.downloads.downloadFile(fileId, { queryParams: { version: versionId }, cancellationToken: signal });
      if (!stream) return { ok: false, error: { code: "BOX_DOWNLOAD_EMPTY", message: `Box returned no content for file ${fileId} version ${versionId}` } };
      const buf = await withAbort(readByteStream(stream), signal);
      const binary = detectBinary(name, buf);
      if (!binary && (TEXT_EXT.test(name) || looksLikeText(buf))) return { ok: true, text: buf.toString("utf8"), sha256: sha256(buf) };
      // PDF / Office containers (or unknown binary): Box's extracted_text representation, bound to the pinned version.
      // Local extraction from the pinned bytes would need a PDF/zip parser dependency; not added for the hackathon.
      return await this.extractedText(fileId, versionId, name, binary);
    } catch (e) {
      const m = mapBoxError(e);
      return { ok: false, error: { code: m.code, message: `download ${name || fileId} version ${versionId}: ${m.message}` } };
    }
  }

  /**
   * extracted_text representation, bound to `versionId`: file_version and representations are read in
   * one request and must name the pinned version; the version is re-read after the text download and a
   * change fails the read. Content is fetched through the SDK client (auth, As-User, deadline apply).
   * 202 or pending -> TEXT_REPRESENTATION_NOT_READY (fixture code).
   */
  private async extractedText(fileId: string, versionId: string, name: string, kind: BinaryKind): Promise<BoxReadResult> {
    const client = this.client();
    const file = await client.files.getFileById(fileId, {
      queryParams: { fields: ["file_version", "representations"] },
      headers: new GetFileByIdHeaders({ xRepHints: "[extracted_text]" }),
      cancellationToken: this.ct(),
    });
    const current = file.fileVersion?.id;
    if (current !== versionId)
      return {
        ok: false,
        error: { code: "TEXT_REPRESENTATION_CURRENT_ONLY", message: `${name} is ${kind ?? "binary"}; Box serves extracted text for the current version only (${current ?? "unknown"}), not the pinned version ${versionId}.` },
      };
    const rep = file.representations?.entries?.find((r) => r.representation === "extracted_text");
    if (!rep) return { ok: false, error: { code: "TEXT_REPRESENTATION_UNSUPPORTED", message: `${name}: Box offers no extracted_text representation for this file type.` } };
    const state = rep.status?.state;
    const notReady = { ok: false as const, error: { code: "TEXT_REPRESENTATION_NOT_READY", message: `Box text representation still processing after upload (${state ?? "HTTP 202"}). File temporarily unreadable.` } };
    if (state === "pending" || state === "none") return notReady;
    const tpl = rep.content?.urlTemplate;
    if (!tpl) return notReady;
    const signal = this.ct();
    const res = await client.makeRequest({ url: tpl.replace("{+asset_path}", ""), method: "GET", responseFormat: "binary", cancellationToken: signal });
    if (res.status === 202) return notReady;
    if (res.status < 200 || res.status >= 300 || !res.content)
      return { ok: false, error: { code: `BOX_HTTP_${res.status}`, message: `${name}: extracted_text download failed (${res.status}).` } };
    const text = (await withAbort(readByteStream(res.content), signal)).toString("utf8");
    const after = await client.files.getFileById(fileId, { queryParams: { fields: ["file_version"] }, cancellationToken: this.ct() });
    if (after.fileVersion?.id !== versionId)
      return { ok: false, error: { code: "VERSION_CHANGED_DURING_EXTRACTION", message: `${name}: a new version (${after.fileVersion?.id}) arrived while extracting text for ${versionId}; extraction discarded.` } };
    return { ok: true, text, sha256: sha256(text) };
  }

  // ---- folder metadata ------------------------------------------------------

  async readFolderMetadata(folderId: string, templateKey: string): Promise<Record<string, string | null> | null> {
    try {
      const md = await this.client().folderMetadata.getFolderMetadataById(folderId, this.cfg.metadataScope, templateKey, { cancellationToken: this.ct() });
      const raw = ((md as { extraData?: Record<string, unknown> }).extraData ?? (md as { rawData?: Record<string, unknown> }).rawData ?? {}) as Record<string, unknown>;
      const out: Record<string, string | null> = {};
      for (const [k, v] of Object.entries(raw)) if (!k.startsWith("$")) out[k] = v == null ? null : String(v);
      return out;
    } catch (e) {
      const m = mapBoxError(e);
      if (m.status === 404) return null; // no instance yet
      throw new BoxAdapterError(m.code, `readFolderMetadata(${folderId}, ${templateKey}): ${m.message}`, m.status);
    }
  }

  /** Create the instance, or JSON-patch it (add/replace/remove) when it exists. Null values are removed. */
  async writeFolderMetadata(folderId: string, templateKey: string, fields: Record<string, string | null>): Promise<BoxWriteResult> {
    try {
      const client = this.client();
      const existing = await this.readFolderMetadata(folderId, templateKey);
      if (existing === null) {
        const body: Record<string, string> = {};
        for (const [k, v] of Object.entries(fields)) if (v !== null) body[k] = v;
        await client.folderMetadata.createFolderMetadataById(folderId, this.cfg.metadataScope, templateKey, body, { cancellationToken: this.ct() });
        return { ok: true };
      }
      const ops: { op: string; path: string; value?: string }[] = [];
      for (const [k, v] of Object.entries(fields)) {
        const has = Object.prototype.hasOwnProperty.call(existing, k) && existing[k] !== null;
        if (v === null) {
          if (has) ops.push({ op: "remove", path: `/${k}` });
        } else ops.push({ op: has ? "replace" : "add", path: `/${k}`, value: v });
      }
      if (ops.length) await client.folderMetadata.updateFolderMetadataById(folderId, this.cfg.metadataScope, templateKey, ops, { cancellationToken: this.ct() });
      return { ok: true };
    } catch (e) {
      const m = mapBoxError(e);
      return { ok: false, error: { code: m.code, message: `writeFolderMetadata(${folderId}, ${templateKey}): ${m.message}` } };
    }
  }

  /** Delete the folder's metadata instance (integration gate cleanup of an instance it created). */
  async deleteFolderMetadata(folderId: string, templateKey: string): Promise<BoxWriteResult> {
    try {
      await this.client().folderMetadata.deleteFolderMetadataById(folderId, this.cfg.metadataScope, templateKey, { cancellationToken: this.ct() });
      return { ok: true };
    } catch (e) {
      const m = mapBoxError(e);
      return { ok: false, error: { code: m.code, message: `deleteFolderMetadata(${folderId}, ${templateKey}): ${m.message}` } };
    }
  }

  /** Read the template's fields; null when it does not exist. */
  async readMetadataTemplate(templateKey: string): Promise<{ key: string; type: string; options?: { key: string }[] }[] | null> {
    try {
      const t = await this.client().metadataTemplates.getMetadataTemplate(this.cfg.metadataScope, templateKey, { cancellationToken: this.ct() });
      return (t.fields ?? []).map((f) => ({ key: f.key, type: String(f.type), options: (f.options ?? []).map((o) => ({ key: o.key })) }));
    } catch (e) {
      const m = mapBoxError(e);
      if (m.status === 404) return null;
      throw new BoxAdapterError(m.code, `readMetadataTemplate(${templateKey}): ${m.message}`, m.status);
    }
  }

  /**
   * Idempotent: creates the keelReview template (keel_snapshot_id, one enum keel_status_<ID> per
   * control with the twelve codes, keel_last_human_review, keel_record_url), or adds missing fields
   * (addField) and missing enum codes (addEnumOption) to an existing one. A field with the wrong type
   * cannot be fixed in place and fails with TEMPLATE_INCOMPATIBLE. Needs "Manage enterprise properties".
   */
  async ensureMetadataTemplate(
    profile: { controls: { id: string; title?: string }[] },
    templateKey: string = process.env.BOX_METADATA_TEMPLATE_KEY || "keelReview",
  ): Promise<
    | { ok: true; created: boolean; added_fields: string[]; added_options: { fieldKey: string; keys: string[] }[] }
    | { ok: false; error: { code: string; message: string } }
  > {
    const wanted = templateSpec(profile);
    const scope = this.cfg.metadataScope;
    try {
      const client = this.client();
      const have = await this.readMetadataTemplate(templateKey);
      if (!have) {
        await client.metadataTemplates.createMetadataTemplate({ scope, templateKey, displayName: "Keel review", fields: wanted }, { cancellationToken: this.ct() });
        return { ok: true, created: true, added_fields: wanted.map((f) => f.key), added_options: [] };
      }
      const check = checkTemplateFields(have, wanted);
      if (check.incompatible.length)
        return {
          ok: false,
          error: {
            code: "TEMPLATE_INCOMPATIBLE",
            message: `${scope}.${templateKey} has fields of the wrong type: ${check.incompatible.map((i) => `${i.key} is ${i.have}, needs ${i.want}`).join("; ")}. Delete or rename the template (or set BOX_METADATA_TEMPLATE_KEY) and rerun.`,
          },
        };
      const ops = [
        ...check.missingFields.map((f) => ({ op: "addField", data: { ...f } })),
        ...check.missingOptions.flatMap((m) => m.keys.map((key) => ({ op: "addEnumOption", fieldKey: m.fieldKey, data: { key } }))),
      ];
      if (ops.length) await client.metadataTemplates.updateMetadataTemplate(scope, templateKey, ops, { cancellationToken: this.ct() });
      return { ok: true, created: false, added_fields: check.missingFields.map((f) => f.key), added_options: check.missingOptions };
    } catch (e) {
      const m = mapBoxError(e);
      return { ok: false, error: { code: m.code, message: `ensureMetadataTemplate(${scope}.${templateKey}): ${m.message}` } };
    }
  }

  // ---- tasks ----------------------------------------------------------------

  async createTask(fileId: string, message: string, action: "review" | "complete", dueAt?: string): Promise<{ task_id: string }> {
    try {
      const task = await this.client().tasks.createTask(
        { item: { id: fileId, type: "file" }, action, message, dueAt: dueAt ? dateTimeFromString(dueAt) : undefined, completionRule: "all_assignees" },
        { cancellationToken: this.ct() },
      );
      if (!task.id) throw new BoxAdapterError("BOX_TASK_NO_ID", "Box created a task but returned no id");
      return { task_id: task.id };
    } catch (e) {
      const m = mapBoxError(e);
      throw new BoxAdapterError(m.code, `createTask(file ${fileId}, ${action}): ${m.message}`, m.status);
    }
  }

  /**
   * Reconcile an ambiguous createTask (engine Codex finding 7): the first task on `fileId` whose
   * message contains `marker`, with its assignment ids, or null. Exact message matches win over
   * substring matches, and the oldest wins within each, so retries converge on the first created
   * task. GET /files/{id}/tasks returns all of a file's tasks in one page. Assignment ids come from
   * the task's task_assignment_collection, or from GET /tasks/{id}/assignments when Box omits it.
   * A failed lookup throws: the caller must not create blindly.
   */
  async findTaskByMessage(fileId: string, marker: string): Promise<{ task_id: string; assignment_ids: string[] } | null> {
    if (!marker) return null;
    try {
      const client = this.client();
      const res = await client.tasks.getFileTasks(fileId, { cancellationToken: this.ct() });
      const byAge = (a: { createdAt?: DT }, b: { createdAt?: DT }) => (iso(a.createdAt) ?? "").localeCompare(iso(b.createdAt) ?? "");
      const tasks = (res.entries ?? []).filter((t) => t.id && typeof t.message === "string");
      const hit = tasks.filter((t) => t.message === marker).sort(byAge)[0] ?? tasks.filter((t) => t.message!.includes(marker)).sort(byAge)[0];
      if (!hit) return null;
      let assignment_ids = (hit.taskAssignmentCollection?.entries ?? []).map((a) => a.id ?? "").filter(Boolean);
      if (!assignment_ids.length) {
        const a = await client.taskAssignments.getTaskAssignments(hit.id!, { cancellationToken: this.ct() });
        assignment_ids = (a.entries ?? []).map((x) => x.id ?? "").filter(Boolean);
      }
      return { task_id: hit.id!, assignment_ids };
    } catch (e) {
      const m = mapBoxError(e);
      throw new BoxAdapterError(m.code, `findTaskByMessage(file ${fileId}): ${m.message}`, m.status);
    }
  }

  async deleteTask(taskId: string): Promise<void> {
    await this.client().tasks.deleteTaskById(taskId, { cancellationToken: this.ct() });
  }

  async assignTask(taskId: string, assignee: { id: string } | { login: string }): Promise<{ assignment_id: string; assigned_to: BoxIdentity }> {
    try {
      const a = await this.client().taskAssignments.createTaskAssignment(
        { task: { id: taskId, type: "task" }, assignTo: "id" in assignee ? { id: assignee.id } : { login: assignee.login } },
        { cancellationToken: this.ct() },
      );
      return { assignment_id: a.id ?? "", assigned_to: ident(a.assignedTo) };
    } catch (e) {
      const m = mapBoxError(e);
      throw new BoxAdapterError(m.code, `assignTask(${taskId}, ${"id" in assignee ? assignee.id : assignee.login}): ${m.message}`, m.status);
    }
  }

  async listTaskAssignments(taskId: string): Promise<BoxTaskAssignmentView[]> {
    try {
      const res = await this.client().taskAssignments.getTaskAssignments(taskId, { cancellationToken: this.ct() });
      return (res.entries ?? []).map((a) => ({
        assignment_id: a.id ?? "",
        assigned_to: ident(a.assignedTo),
        resolution_state: (a.resolutionState ?? "incomplete") as BoxResolutionState,
        message: a.message ?? "",
        completed_at: iso(a.completedAt),
      }));
    } catch (e) {
      const m = mapBoxError(e);
      throw new BoxAdapterError(m.code, `listTaskAssignments(${taskId}): ${m.message}`, m.status);
    }
  }

  // ---- Box AI ---------------------------------------------------------------

  /** Box AI ask with citations. Any failure (no AI units, AI disabled, 403/404/429, deadline) -> unavailable with the reason. */
  async aiAsk(fileIds: string[], prompt: string, _opts: { citations: true }): Promise<BoxAiAskResponse> {
    if (fileIds.length === 0) return { unavailable: true, reason: "no files to ask" };
    try {
      const res = await this.client().ai.createAiAsk(
        {
          mode: fileIds.length > 1 ? "multiple_item_qa" : "single_item_qa",
          prompt,
          items: fileIds.slice(0, 25).map((id) => ({ id, type: "file" as const })),
          includeCitations: true,
        },
        { cancellationToken: this.ct() },
      );
      if (!res) return { unavailable: true, reason: "Box AI returned no content (HTTP 204)" };
      // Box AI citations carry no version. Box AI reads the current version, so stamp each citation
      // with its file's current version id; callers reject citations whose version is not the pinned
      // one (spec 3 step 6). If the lookup fails, versionId stays undefined rather than guessed.
      const cited = [...new Set((res.citations ?? []).map((c) => c.id ?? "").filter(Boolean))];
      const current = await this.currentVersionIds(cited);
      return {
        answer: res.answer ?? "",
        citations: (res.citations ?? []).map((c) => ({ fileId: c.id ?? "", versionId: current.get(c.id ?? "") ?? undefined, content: c.content ?? "" })),
      };
    } catch (e) {
      return { unavailable: true, reason: aiReason(e) };
    }
  }

  /** Box AI text generation. Box accepts a single item for text gen; extra ids are ignored. */
  async aiTextGen(fileIds: string[], prompt: string): Promise<BoxAiTextGenResponse> {
    if (fileIds.length === 0) return { unavailable: true, reason: "text gen needs one file as context" };
    try {
      const res = await this.client().ai.createAiTextGen({ prompt, items: [new AiTextGenItemsField({ id: fileIds[0], type: "file" })] }, { cancellationToken: this.ct() });
      return { text: res.answer ?? "" };
    } catch (e) {
      return { unavailable: true, reason: aiReason(e) };
    }
  }

  async currentUser(): Promise<BoxIdentity> {
    try {
      return ident(await this.client().users.getUserMe(undefined, undefined, this.ct()));
    } catch (e) {
      const m = mapBoxError(e);
      throw new BoxAdapterError(m.code, `currentUser: ${m.message}`, m.status);
    }
  }

  // ---- uploads (scripts only; not part of BoxAdapter) -----------------------

  async uploadFile(folderId: string, name: string, text: string): Promise<{ fileId: string; versionId: string }> {
    try {
      const res = await this.client().uploads.uploadFile({ attributes: { name, parent: { id: folderId } }, file: stringToByteStream(text) }, { cancellationToken: this.ct() });
      const f = res.entries?.[0];
      return { fileId: f?.id ?? "", versionId: f?.fileVersion?.id ?? "" };
    } catch (e) {
      const m = mapBoxError(e);
      throw new BoxAdapterError(m.code, `uploadFile(${name}): ${m.message}`, m.status);
    }
  }

  /**
   * Upload new bytes as a version. `content` is passed to Box as raw bytes (a string is encoded UTF-8).
   * The version note is a separate Box call after the upload committed: its failure is reported as
   * `note_error`, never as a failed upload (Codex 14).
   */
  async uploadFileVersion(fileId: string, name: string, content: string | Buffer, versionNote?: string): Promise<{ fileId: string; versionId: string; note_error?: string }> {
    let res;
    const client = this.client();
    try {
      const file = typeof content === "string" ? stringToByteStream(content) : generateByteStreamFromBuffer(content);
      res = await client.uploads.uploadFileVersion(fileId, { attributes: { name }, file }, { cancellationToken: this.ct() });
    } catch (e) {
      const m = mapBoxError(e);
      throw new BoxAdapterError(m.code, `uploadFileVersion(${name}): ${m.message}`, m.status);
    }
    const versionId = res.entries?.[0]?.fileVersion?.id ?? "";
    if (versionNote) {
      try {
        await client.comments.createComment({ message: this.cfg.versionNotePrefix + versionNote, item: { id: fileId, type: "file" } }, { cancellationToken: this.ct() });
      } catch (e) {
        return { fileId, versionId, note_error: mapBoxError(e).message };
      }
    }
    return { fileId, versionId };
  }

  async findFileByName(folderId: string, name: string): Promise<BoxFolderItem | undefined> {
    return (await this.listFolderItems(folderId)).find((f) => f.fileName === name);
  }
}

function aiReason(e: unknown): string {
  const m = mapBoxError(e);
  if (m.status === 403) return `Box AI not permitted or AI units exhausted (${m.message})`;
  if (m.status === 404) return `Box AI not enabled for this app or item not found (${m.message})`;
  if (m.status === 429) return `Box AI rate limited (${m.message})`;
  if (m.code === "BOX_TIMEOUT") return `Box AI did not answer before the deadline (${m.message})`;
  return m.message;
}

// ---------------------------------------------------------------------------
// Box id map written by scripts/seed-box-folder.ts (app/data/box-map.json)
// ---------------------------------------------------------------------------

/**
 * Maps the fixture's synthetic Box ids to the tenant's real ids, so the engine can reuse
 * demo-data/lantern (snapshots, ledger seed, expected findings) against a live folder.
 * Versions are mapped only when the downloaded bytes hash to the fixture file (never by position).
 */
export interface BoxMap {
  folderId: string;
  created_at: string;
  files: Record<
    string, // fixture fileName, e.g. "architecture.md"
    {
      fixtureFileId: string;
      fileId: string;
      /** fixture versionId -> Box versionId, e.g. "1801102232" -> "1987654321"; hash-verified only */
      versions: Record<string, string>;
      /** label -> Box versionId, e.g. "v2" -> "1987654321" (Box order) */
      labels: Record<string, string>;
      /** Box versions whose content matched no fixture version (left unmapped). */
      unmatched?: string[];
    }
  >;
}
