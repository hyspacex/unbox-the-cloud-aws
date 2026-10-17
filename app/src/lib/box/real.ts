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
 *
 * Error policy: methods whose return type is a result union (downloadVersionText,
 * writeFolderMetadata, aiAsk, aiTextGen) never throw for expected failures. Methods whose contract
 * returns a plain value (listFolderItems, createTask, ...) throw BoxAdapterError with a stable
 * `code` so the engine can record it (box_task_create_failed and friends).
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
}

export function realBoxConfigFromEnv(env: NodeJS.ProcessEnv = process.env): RealBoxConfig {
  const v = (k: string) => (env[k] && env[k]!.trim() !== "" ? env[k]!.trim() : undefined);
  return {
    developerToken: v("BOX_DEVELOPER_TOKEN"),
    clientId: v("BOX_CLIENT_ID"),
    clientSecret: v("BOX_CLIENT_SECRET"),
    enterpriseId: v("BOX_ENTERPRISE_ID"),
    subjectUserId: v("BOX_SUBJECT_USER_ID"),
    metadataScope: v("BOX_METADATA_SCOPE") ?? "enterprise",
    versionNotePrefix: VERSION_NOTE_PREFIX,
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
  message?: string;
  responseInfo?: { statusCode?: number; code?: string; body?: { message?: string; code?: string } | unknown };
}

/** Map anything thrown by the SDK to a stable {code, message}. Duck-typed: the SDK ships CJS and ESM builds. */
export function mapBoxError(e: unknown): { code: string; message: string; status?: number } {
  if (e instanceof BoxAdapterError) return { code: e.code, message: e.message, status: e.status };
  const err = e as BoxApiErrorLike;
  const status = err?.responseInfo?.statusCode;
  if (typeof status === "number") {
    const body = (err.responseInfo?.body ?? {}) as { message?: string; code?: string };
    const boxCode = err.responseInfo?.code ?? body.code;
    const code = boxCode ? `BOX_${String(boxCode).toUpperCase()}` : `BOX_HTTP_${status}`;
    return { code, message: `Box API ${status}${boxCode ? ` ${boxCode}` : ""}: ${body.message ?? err.message ?? "request failed"}`, status };
  }
  const msg = e instanceof Error ? e.message : String(e);
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

const TEXT_EXT = /\.(md|markdown|txt|text|csv|json|ya?ml|xml|html?)$/i;

/** True when the bytes decode as UTF-8 text without NUL bytes or replacement characters. */
function looksLikeText(buf: Buffer): boolean {
  if (buf.includes(0)) return false;
  const s = buf.toString("utf8");
  return !s.includes("�");
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

export class RealBoxAdapter implements BoxAdapter {
  readonly kind = "real" as const;
  private readonly cfg: RealBoxConfig;
  private _client: BoxClient | null = null;
  private _auth: BoxDeveloperTokenAuth | BoxCcgAuth | null = null;

  constructor(cfg: Partial<RealBoxConfig> = {}) {
    this.cfg = { ...realBoxConfigFromEnv(), ...cfg };
  }

  /** Human-readable description of which auth path is configured (for the integration gate). */
  describeAuth(): string {
    if (this.cfg.developerToken) return "developer token (expires 60 min after it was generated)";
    if (this.cfg.clientId && this.cfg.clientSecret && this.cfg.enterpriseId)
      return `client credentials grant, enterprise ${this.cfg.enterpriseId}${this.cfg.subjectUserId ? `, As-User ${this.cfg.subjectUserId}` : ", service account"}`;
    return "not configured";
  }

  /** The SDK client, built lazily. Throws BOX_NOT_CONFIGURED with the exact env vars needed. */
  client(): BoxClient {
    if (this._client) return this._client;
    const c = this.cfg;
    if (c.developerToken) {
      this._auth = new BoxDeveloperTokenAuth({ token: c.developerToken });
    } else if (c.clientId && c.clientSecret && c.enterpriseId) {
      this._auth = new BoxCcgAuth({
        config: new CcgConfig({ clientId: c.clientId, clientSecret: c.clientSecret, enterpriseId: c.enterpriseId }),
      });
    } else {
      throw new BoxAdapterError(
        "BOX_NOT_CONFIGURED",
        `Live Box is not configured: set ${missingBoxEnv().join(", ") || "BOX_DEVELOPER_TOKEN"} in app/.env.local (see docs/INTEGRATION.md), or run with MOCK_MODE=true.`,
      );
    }
    let client = new BoxClient({ auth: this._auth });
    if (c.subjectUserId) client = client.withAsUserHeader(c.subjectUserId);
    this._client = client;
    return client;
  }

  private async authHeader(): Promise<string> {
    this.client();
    return this._auth!.retrieveAuthorizationHeader();
  }

  // ---- files and versions -------------------------------------------------

  async listFolderItems(folderId: string): Promise<BoxFolderItem[]> {
    const out: BoxFolderItem[] = [];
    try {
      let marker: string | undefined;
      do {
        const page = await this.client().folders.getFolderItems(folderId, {
          queryParams: { fields: ["id", "type", "name", "file_version", "sha1", "size"], usemarker: true, marker, limit: 1000 },
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

  /**
   * Oldest first, labelled v1..vN, current version last. Box's versions endpoint excludes the
   * current version, so it is appended from the file's file_version. Free Box accounts do not
   * retain versions: then only the current version is returned and `priorVersionsRetained` says why.
   */
  async listFileVersions(fileId: string): Promise<BoxFileVersion[]> {
    const client = this.client();
    let file;
    try {
      file = await client.files.getFileById(fileId, {
        queryParams: { fields: ["id", "name", "file_version", "sha1", "modified_at", "modified_by", "content_modified_at", "created_at", "created_by"] },
      });
    } catch (e) {
      const m = mapBoxError(e);
      throw new BoxAdapterError(m.code, `listFileVersions(${fileId}): ${m.message}`, m.status);
    }
    const prior = await this.priorVersions(fileId);
    const older: BoxFileVersion[] = (prior.ok ? prior.versions : [])
      .filter((v) => !v.trashed)
      .sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0))
      .map(({ trashed: _t, ...v }) => v);
    const current: BoxFileVersion = {
      versionId: file.fileVersion?.id ?? "",
      createdAt: iso(file.contentModifiedAt) ?? iso(file.modifiedAt) ?? iso(file.createdAt) ?? "",
      uploader: file.modifiedBy ? ident(file.modifiedBy) : undefined,
      sha1: file.sha1 ?? file.fileVersion?.sha1,
    };
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
    { ok: true; versions: (BoxFileVersion & { trashed: boolean })[] } | { ok: false; reason: string }
  > {
    try {
      const res = await this.client().fileVersions.getFileVersions(fileId, {
        queryParams: { fields: ["id", "sha1", "name", "size", "created_at", "modified_at", "modified_by", "trashed_at", "version_number", "uploader_display_name"], limit: 1000 },
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
      return { ok: false, reason: `${m.message}${m.status === 403 ? " (version history needs a paid Box plan or the app's read scope)" : ""}` };
    }
  }

  /** Version comments: the first "Version note: ..." file comment created at or after a version and before the next one. */
  private async attachVersionNotes(fileId: string, versions: BoxFileVersion[]): Promise<void> {
    let comments: { message: string; createdAt: string }[] = [];
    try {
      const res = await this.client().comments.getFileComments(fileId, { queryParams: { fields: ["message", "created_at", "created_by"], limit: 1000 } });
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
    let buf: Buffer;
    let name = "";
    try {
      const client = this.client();
      const file = await client.files.getFileById(fileId, { queryParams: { fields: ["name", "file_version"] } });
      name = file.name ?? "";
      const stream = await client.downloads.downloadFile(fileId, { queryParams: { version: versionId } });
      if (!stream) return { ok: false, error: { code: "BOX_DOWNLOAD_EMPTY", message: `Box returned no content for file ${fileId} version ${versionId}` } };
      buf = await readByteStream(stream);
      if (TEXT_EXT.test(name) || looksLikeText(buf)) {
        const text = buf.toString("utf8");
        return { ok: true, text, sha256: sha256(buf) };
      }
      // Binary (PDF, DOCX, ...): Box's extracted_text representation exists for the current version only.
      if (file.fileVersion?.id && file.fileVersion.id !== versionId)
        return {
          ok: false,
          error: { code: "TEXT_REPRESENTATION_CURRENT_ONLY", message: `${name} v${versionId} is not plain text and Box serves extracted text only for the current version (${file.fileVersion.id}).` },
        };
      return await this.extractedText(fileId, name);
    } catch (e) {
      const m = mapBoxError(e);
      return { ok: false, error: { code: m.code, message: `download ${name || fileId} version ${versionId}: ${m.message}` } };
    }
  }

  /** extracted_text representation with x-rep-hints; 202 or pending -> TEXT_REPRESENTATION_NOT_READY (fixture code). */
  private async extractedText(fileId: string, name: string): Promise<BoxReadResult> {
    const client = this.client();
    const file = await client.files.getFileById(fileId, {
      queryParams: { fields: ["representations"] },
      headers: new GetFileByIdHeaders({ xRepHints: "[extracted_text]" }),
    });
    const rep = file.representations?.entries?.find((r) => r.representation === "extracted_text");
    if (!rep) return { ok: false, error: { code: "TEXT_REPRESENTATION_UNSUPPORTED", message: `${name}: Box offers no extracted_text representation for this file type.` } };
    const state = rep.status?.state;
    const notReady = { ok: false as const, error: { code: "TEXT_REPRESENTATION_NOT_READY", message: `Box text representation still processing after upload (${state ?? "HTTP 202"}). File temporarily unreadable.` } };
    if (state === "pending" || state === "none") return notReady;
    const tpl = rep.content?.urlTemplate;
    if (!tpl) return notReady;
    const res = await fetch(tpl.replace("{+asset_path}", ""), { headers: { Authorization: await this.authHeader() } });
    if (res.status === 202) return notReady;
    if (!res.ok) return { ok: false, error: { code: `BOX_HTTP_${res.status}`, message: `${name}: extracted_text download failed (${res.status}).` } };
    const text = await res.text();
    return { ok: true, text, sha256: sha256(text) };
  }

  // ---- folder metadata ------------------------------------------------------

  async readFolderMetadata(folderId: string, templateKey: string): Promise<Record<string, string | null> | null> {
    try {
      const md = await this.client().folderMetadata.getFolderMetadataById(folderId, this.cfg.metadataScope, templateKey);
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
        await client.folderMetadata.createFolderMetadataById(folderId, this.cfg.metadataScope, templateKey, body);
        return { ok: true };
      }
      const ops: { op: string; path: string; value?: string }[] = [];
      for (const [k, v] of Object.entries(fields)) {
        const has = Object.prototype.hasOwnProperty.call(existing, k) && existing[k] !== null;
        if (v === null) {
          if (has) ops.push({ op: "remove", path: `/${k}` });
        } else ops.push({ op: has ? "replace" : "add", path: `/${k}`, value: v });
      }
      if (ops.length) await client.folderMetadata.updateFolderMetadataById(folderId, this.cfg.metadataScope, templateKey, ops);
      return { ok: true };
    } catch (e) {
      const m = mapBoxError(e);
      return { ok: false, error: { code: m.code, message: `writeFolderMetadata(${folderId}, ${templateKey}): ${m.message}` } };
    }
  }

  /**
   * Idempotent: creates the keelReview template (keel_snapshot_id, one enum keel_status_<ID> per
   * control with the twelve codes, keel_last_human_review, keel_record_url), or adds any missing
   * fields to an existing one. Needs the "Manage enterprise properties" scope and an admin-authorized app.
   */
  async ensureMetadataTemplate(
    profile: { controls: { id: string; title?: string }[] },
    templateKey: string = process.env.BOX_METADATA_TEMPLATE_KEY || "keelReview",
  ): Promise<{ ok: true; created: boolean; added_fields: string[] } | { ok: false; error: { code: string; message: string } }> {
    const wanted = [
      { type: "string" as const, key: "keel_snapshot_id", displayName: "Keel snapshot id" },
      ...profile.controls.map((c) => ({
        type: "enum" as const,
        key: statusFieldKey(c.id),
        displayName: `Keel status ${c.id}`,
        description: c.title,
        options: PROJECTION_CODES.map((key) => ({ key })),
      })),
      { type: "string" as const, key: "keel_last_human_review", displayName: "Keel last human review" },
      { type: "string" as const, key: "keel_record_url", displayName: "Keel record URL" },
    ];
    const scope = this.cfg.metadataScope;
    try {
      const client = this.client();
      let tpl;
      try {
        tpl = await client.metadataTemplates.getMetadataTemplate(scope, templateKey);
      } catch (e) {
        if (mapBoxError(e).status !== 404) throw e;
      }
      if (!tpl) {
        await client.metadataTemplates.createMetadataTemplate({ scope, templateKey, displayName: "Keel review", fields: wanted });
        return { ok: true, created: true, added_fields: wanted.map((f) => f.key) };
      }
      const have = new Set((tpl.fields ?? []).map((f) => f.key));
      const missing = wanted.filter((f) => !have.has(f.key));
      if (missing.length)
        await client.metadataTemplates.updateMetadataTemplate(scope, templateKey, missing.map((f) => ({ op: "addField", data: f })));
      return { ok: true, created: false, added_fields: missing.map((f) => f.key) };
    } catch (e) {
      const m = mapBoxError(e);
      return { ok: false, error: { code: m.code, message: `ensureMetadataTemplate(${scope}.${templateKey}): ${m.message}` } };
    }
  }

  // ---- tasks ----------------------------------------------------------------

  async createTask(fileId: string, message: string, action: "review" | "complete", dueAt?: string): Promise<{ task_id: string }> {
    try {
      const task = await this.client().tasks.createTask({
        item: { id: fileId, type: "file" },
        action,
        message,
        dueAt: dueAt ? dateTimeFromString(dueAt) : undefined,
        completionRule: "all_assignees",
      });
      if (!task.id) throw new BoxAdapterError("BOX_TASK_NO_ID", "Box created a task but returned no id");
      return { task_id: task.id };
    } catch (e) {
      const m = mapBoxError(e);
      throw new BoxAdapterError(m.code, `createTask(file ${fileId}, ${action}): ${m.message}`, m.status);
    }
  }

  async assignTask(taskId: string, assignee: { id: string } | { login: string }): Promise<{ assignment_id: string; assigned_to: BoxIdentity }> {
    try {
      const a = await this.client().taskAssignments.createTaskAssignment({
        task: { id: taskId, type: "task" },
        assignTo: "id" in assignee ? { id: assignee.id } : { login: assignee.login },
      });
      return { assignment_id: a.id ?? "", assigned_to: ident(a.assignedTo) };
    } catch (e) {
      const m = mapBoxError(e);
      throw new BoxAdapterError(m.code, `assignTask(${taskId}, ${"id" in assignee ? assignee.id : assignee.login}): ${m.message}`, m.status);
    }
  }

  async listTaskAssignments(taskId: string): Promise<BoxTaskAssignmentView[]> {
    try {
      const res = await this.client().taskAssignments.getTaskAssignments(taskId);
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

  /** Box AI ask with citations. Any failure (no AI units, AI disabled, 403/404/429) -> unavailable with the reason. */
  async aiAsk(fileIds: string[], prompt: string, _opts: { citations: true }): Promise<BoxAiAskResponse> {
    if (fileIds.length === 0) return { unavailable: true, reason: "no files to ask" };
    try {
      const res = await this.client().ai.createAiAsk({
        mode: fileIds.length > 1 ? "multiple_item_qa" : "single_item_qa",
        prompt,
        items: fileIds.slice(0, 25).map((id) => ({ id, type: "file" as const })),
        includeCitations: true,
      });
      if (!res) return { unavailable: true, reason: "Box AI returned no content (HTTP 204)" };
      // Box AI citations carry no version. Box AI reads the current version, so stamp each citation
      // with its file's current version id; callers reject citations whose version is not the pinned
      // one (spec 3 step 6). If the lookup fails, versionId stays undefined rather than guessed.
      const cited = [...new Set((res.citations ?? []).map((c) => c.id ?? "").filter(Boolean))];
      const current = new Map<string, string>();
      await Promise.all(
        cited.map(async (id) => {
          try {
            const f = await this.client().files.getFileById(id, { queryParams: { fields: ["file_version"] } });
            if (f.fileVersion?.id) current.set(id, f.fileVersion.id);
          } catch {
            /* leave undefined */
          }
        }),
      );
      return {
        answer: res.answer ?? "",
        citations: (res.citations ?? []).map((c) => ({ fileId: c.id ?? "", versionId: current.get(c.id ?? ""), content: c.content ?? "" })),
      };
    } catch (e) {
      return { unavailable: true, reason: aiReason(e) };
    }
  }

  /** Box AI text generation. Box accepts a single item for text gen; extra ids are ignored. */
  async aiTextGen(fileIds: string[], prompt: string): Promise<BoxAiTextGenResponse> {
    if (fileIds.length === 0) return { unavailable: true, reason: "text gen needs one file as context" };
    try {
      const res = await this.client().ai.createAiTextGen({ prompt, items: [new AiTextGenItemsField({ id: fileIds[0], type: "file" })] });
      return { text: res.answer ?? "" };
    } catch (e) {
      return { unavailable: true, reason: aiReason(e) };
    }
  }

  async currentUser(): Promise<BoxIdentity> {
    try {
      return ident(await this.client().users.getUserMe());
    } catch (e) {
      const m = mapBoxError(e);
      throw new BoxAdapterError(m.code, `currentUser: ${m.message}`, m.status);
    }
  }

  // ---- uploads (scripts only; not part of BoxAdapter) -----------------------

  async uploadFile(folderId: string, name: string, text: string): Promise<{ fileId: string; versionId: string }> {
    try {
      const res = await this.client().uploads.uploadFile({ attributes: { name, parent: { id: folderId } }, file: stringToByteStream(text) });
      const f = res.entries?.[0];
      return { fileId: f?.id ?? "", versionId: f?.fileVersion?.id ?? "" };
    } catch (e) {
      const m = mapBoxError(e);
      throw new BoxAdapterError(m.code, `uploadFile(${name}): ${m.message}`, m.status);
    }
  }

  async uploadFileVersion(fileId: string, name: string, text: string, versionNote?: string): Promise<{ fileId: string; versionId: string }> {
    try {
      const client = this.client();
      const res = await client.uploads.uploadFileVersion(fileId, { attributes: { name }, file: stringToByteStream(text) });
      const f = res.entries?.[0];
      if (versionNote) await client.comments.createComment({ message: this.cfg.versionNotePrefix + versionNote, item: { id: fileId, type: "file" } });
      return { fileId, versionId: f?.fileVersion?.id ?? "" };
    } catch (e) {
      const m = mapBoxError(e);
      throw new BoxAdapterError(m.code, `uploadFileVersion(${name}): ${m.message}`, m.status);
    }
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
  return m.message;
}

// ---------------------------------------------------------------------------
// Box id map written by scripts/seed-box-folder.ts (app/data/box-map.json)
// ---------------------------------------------------------------------------

/**
 * Maps the fixture's synthetic Box ids to the tenant's real ids, so the engine can reuse
 * demo-data/lantern (snapshots, ledger seed, expected findings) against a live folder.
 */
export interface BoxMap {
  folderId: string;
  created_at: string;
  files: Record<
    string, // fixture fileName, e.g. "architecture.md"
    {
      fixtureFileId: string;
      fileId: string;
      /** fixture versionId -> Box versionId, e.g. "1801102232" -> "1987654321" */
      versions: Record<string, string>;
      /** label -> Box versionId, e.g. "v2" -> "1987654321" */
      labels: Record<string, string>;
    }
  >;
}
