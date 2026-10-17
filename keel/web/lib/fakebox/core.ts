import crypto from "node:crypto";
import { db, nextId, now } from "./db";
import { env } from "../env";

// Fake Box domain logic. Behaviour mirrors the documented Box API (see docs/v1-local-design.md),
// and is deliberately no more permissive than Box: tasks attach to files only, assignees must be
// collaborators, metadata updates are JSON Patch, webhooks deliver metadata (never content),
// signed with HMAC-SHA256 over body + timestamp, retried up to 5 times, deduplicated on the body id.

export class BoxError extends Error {
  constructor(public status: number, public code: string, message: string, public context?: unknown) {
    super(message);
  }
  toJSON() {
    return {
      type: "error", status: this.status, code: this.code, message: this.message,
      context_info: this.context, request_id: crypto.randomBytes(6).toString("hex"),
    };
  }
}

export type UserRow = { id: string; name: string; login: string; kind: string; title: string | null };
type FolderRow = { id: string; name: string; parent_id: string | null; owned_by: string; created_at: string; modified_at: string; trashed_at: string | null };
type FileRow = { id: string; name: string; parent_id: string; current_version_id: string; created_by: string; created_at: string; modified_at: string; modified_by: string; trashed_at: string | null; sequence_id: number };
type VersionRow = { id: string; file_id: string; version_number: number; name: string; sha1: string; size: number; content: Buffer; created_at: string; modified_by: string; comment: string | null };

// ---------- users ----------
export function getUser(id: string): UserRow {
  const u = db().prepare("SELECT * FROM users WHERE id = ?").get(id) as UserRow | undefined;
  if (!u) throw new BoxError(404, "not_found", "User not found");
  return u;
}
export function listUsers(): UserRow[] {
  return db().prepare("SELECT * FROM users ORDER BY kind DESC, name").all() as UserRow[];
}
export function createUser(name: string, login: string, kind = "user", title: string | null = null): UserRow {
  const id = nextId("user");
  db().prepare("INSERT INTO users(id, name, login, kind, title, created_at) VALUES(?,?,?,?,?,?)").run(id, name, login, kind, title, now());
  return getUser(id);
}
export function serviceAccount(): UserRow {
  const u = db().prepare("SELECT * FROM users WHERE kind = 'service' LIMIT 1").get() as UserRow | undefined;
  if (!u) throw new BoxError(401, "unauthorized", "Service account not provisioned. Seed Fake Box first.");
  return u;
}
export const userMini = (id: string) => {
  const u = getUser(id);
  return { type: "user", id: u.id, name: u.name, login: u.login };
};

// ---------- access ----------
function folder(id: string): FolderRow {
  const f = db().prepare("SELECT * FROM folders WHERE id = ? AND trashed_at IS NULL").get(id) as FolderRow | undefined;
  if (!f) throw new BoxError(404, "not_found", "Not Found");
  return f;
}
function folderChain(id: string): FolderRow[] {
  const chain: FolderRow[] = [];
  let cur: string | null = id;
  while (cur && cur !== "0") {
    const f = db().prepare("SELECT * FROM folders WHERE id = ?").get(cur) as FolderRow | undefined;
    if (!f) break;
    chain.push(f);
    cur = f.parent_id;
  }
  return chain;
}
export function folderRole(userId: string, folderId: string): string | null {
  for (const f of folderChain(folderId)) {
    if (f.owned_by === userId) return "owner";
    const c = db().prepare("SELECT role FROM collaborations WHERE folder_id = ? AND user_id = ?").get(f.id, userId) as { role: string } | undefined;
    if (c) return c.role;
  }
  return null;
}
const WRITE_ROLES = new Set(["owner", "co-owner", "editor"]);
function requireFolder(userId: string, folderId: string, write = false): FolderRow {
  const f = folder(folderId);
  const role = folderRole(userId, folderId);
  // Box answers 404 for items the caller cannot see.
  if (!role) throw new BoxError(404, "not_found", "Not Found");
  if (write && !WRITE_ROLES.has(role)) throw new BoxError(403, "access_denied_insufficient_permissions", "Access denied - insufficient permission");
  return f;
}
function file(id: string): FileRow {
  const f = db().prepare("SELECT * FROM files WHERE id = ? AND trashed_at IS NULL").get(id) as FileRow | undefined;
  if (!f) throw new BoxError(404, "not_found", "Not Found");
  return f;
}
function requireFile(userId: string, fileId: string, write = false): FileRow {
  const f = file(fileId);
  requireFolder(userId, f.parent_id, write);
  return f;
}

// ---------- serializers ----------
function versionRow(id: string): VersionRow {
  return db().prepare("SELECT * FROM file_versions WHERE id = ?").get(id) as VersionRow;
}
export function serializeFile(f: FileRow) {
  const v = versionRow(f.current_version_id);
  const parent = db().prepare("SELECT id, name FROM folders WHERE id = ?").get(f.parent_id) as { id: string; name: string };
  return {
    type: "file", id: f.id, name: f.name, etag: String(f.sequence_id), sequence_id: String(f.sequence_id),
    sha1: v.sha1, size: v.size,
    file_version: { type: "file_version", id: v.id, sha1: v.sha1 },
    parent: { type: "folder", id: parent.id, name: parent.name },
    created_at: f.created_at, modified_at: f.modified_at,
    created_by: userMini(f.created_by), modified_by: userMini(f.modified_by),
    item_status: f.trashed_at ? "trashed" : "active", trashed_at: f.trashed_at,
  };
}
function serializeVersion(v: VersionRow) {
  return {
    type: "file_version", id: v.id, sha1: v.sha1, name: v.name, size: v.size, version_number: String(v.version_number),
    created_at: v.created_at, modified_at: v.created_at, modified_by: userMini(v.modified_by),
    uploader_display_name: getUser(v.modified_by).name, trashed_at: null, purged_at: null,
  };
}
export function serializeFolder(f: FolderRow) {
  return {
    type: "folder", id: f.id, name: f.name, created_at: f.created_at, modified_at: f.modified_at,
    owned_by: userMini(f.owned_by),
    parent: f.parent_id && f.parent_id !== "0" ? { type: "folder", id: f.parent_id } : { type: "folder", id: "0", name: "All Files" },
    item_status: f.trashed_at ? "trashed" : "active",
  };
}
function pickFields<T extends Record<string, unknown>>(full: T, mini: string[], fields?: string | null) {
  const keep = new Set(mini);
  if (fields) for (const f of fields.split(",")) keep.add(f.trim());
  return Object.fromEntries(Object.entries(full).filter(([k]) => keep.has(k)));
}

// ---------- folders ----------
export function createFolder(userId: string, name: string, parentId: string) {
  if (parentId !== "0") requireFolder(userId, parentId, true);
  const exists = db().prepare("SELECT id FROM folders WHERE parent_id = ? AND name = ? AND trashed_at IS NULL").get(parentId, name);
  if (exists) throw new BoxError(409, "item_name_in_use", "Item with the same name already exists");
  const id = nextId("folder");
  const t = now();
  db().prepare("INSERT INTO folders(id, name, parent_id, owned_by, created_at, modified_at) VALUES(?,?,?,?,?,?)").run(id, name, parentId, userId, t, t);
  return serializeFolder(folder(id));
}
export function getFolder(userId: string, id: string) {
  return serializeFolder(requireFolder(userId, id));
}
export function listFolderItems(userId: string, id: string, fields?: string | null, limit = 100, offset = 0) {
  if (id === "0") {
    // A user's root lists the top-level folders they own or collaborate on.
    const roots = listAccessibleFolders(userId).filter((f) => !f.parent_id || f.parent_id === "0" || !folderRole(userId, f.parent_id));
    const entries = roots.map((f) => pickFields(serializeFolder(f), ["type", "id", "name", "etag"], fields));
    return { total_count: entries.length, entries: entries.slice(offset, offset + limit), offset, limit, order: [{ by: "name", direction: "ASC" }] };
  }
  requireFolder(userId, id);
  const rows = db().prepare("SELECT * FROM files WHERE parent_id = ? AND trashed_at IS NULL ORDER BY name").all(id) as FileRow[];
  const entries = rows.slice(offset, offset + limit).map((f) =>
    pickFields(serializeFile(f), ["type", "id", "name", "etag", "sequence_id", "sha1", "file_version"], fields));
  return { total_count: rows.length, entries, offset, limit, order: [{ by: "name", direction: "ASC" }] };
}
export function listAccessibleFolders(userId: string) {
  const rows = db().prepare("SELECT * FROM folders WHERE trashed_at IS NULL ORDER BY name").all() as FolderRow[];
  return rows.filter((f) => folderRole(userId, f.id));
}
export function addCollaboration(userId: string, folderId: string, collaboratorId: string, role: string) {
  requireFolder(userId, folderId, true);
  getUser(collaboratorId);
  const id = nextId("collaboration");
  db().prepare("INSERT OR REPLACE INTO collaborations(id, folder_id, user_id, role, created_at) VALUES(?,?,?,?,?)").run(id, folderId, collaboratorId, role, now());
  return { type: "collaboration", id, item: { type: "folder", id: folderId }, accessible_by: userMini(collaboratorId), role, status: "accepted" };
}
export function listCollaborators(folderId: string) {
  const f = folder(folderId);
  const rows = db().prepare("SELECT user_id, role FROM collaborations WHERE folder_id = ?").all(folderId) as { user_id: string; role: string }[];
  return [{ user: getUser(f.owned_by), role: "owner" }, ...rows.map((r) => ({ user: getUser(r.user_id), role: r.role }))];
}

// ---------- files ----------
const sha1 = (b: Buffer) => crypto.createHash("sha1").update(b).digest("hex");

export function uploadFile(userId: string, parentId: string, name: string, content: Buffer) {
  requireFolder(userId, parentId, true);
  if (!name || name.length > 255 || /[\/\\]/.test(name)) throw new BoxError(400, "item_name_invalid", "Item name invalid");
  if (content.length > 50 * 1024 * 1024) throw new BoxError(413, "file_size_limit_exceeded", "Use chunked upload above 50 MB");
  const conflict = db().prepare("SELECT id FROM files WHERE parent_id = ? AND name = ? AND trashed_at IS NULL").get(parentId, name) as { id: string } | undefined;
  if (conflict) {
    throw new BoxError(409, "item_name_in_use", "Item with the same name already exists", {
      conflicts: { type: "file", id: conflict.id, name },
    });
  }
  const fileId = nextId("file");
  const versionId = nextId("version");
  const t = now();
  const d = db();
  d.transaction(() => {
    d.prepare("INSERT INTO file_versions(id, file_id, version_number, name, sha1, size, content, created_at, modified_by) VALUES(?,?,?,?,?,?,?,?,?)")
      .run(versionId, fileId, 1, name, sha1(content), content.length, content, t, userId);
    d.prepare("INSERT INTO files(id, name, parent_id, current_version_id, created_by, created_at, modified_at, modified_by) VALUES(?,?,?,?,?,?,?,?)")
      .run(fileId, name, parentId, versionId, userId, t, t, userId);
  })();
  const out = serializeFile(file(fileId));
  emit("FILE.UPLOADED", parentId, userId, out);
  return out;
}

export function uploadVersion(userId: string, fileId: string, content: Buffer, newName?: string) {
  const f = requireFile(userId, fileId, true);
  const prev = versionRow(f.current_version_id);
  const versionId = nextId("version");
  const t = now();
  const name = newName || f.name;
  const d = db();
  d.transaction(() => {
    d.prepare("INSERT INTO file_versions(id, file_id, version_number, name, sha1, size, content, created_at, modified_by) VALUES(?,?,?,?,?,?,?,?,?)")
      .run(versionId, fileId, prev.version_number + 1, name, sha1(content), content.length, content, t, userId);
    d.prepare("UPDATE files SET current_version_id = ?, name = ?, modified_at = ?, modified_by = ?, sequence_id = sequence_id + 1 WHERE id = ?")
      .run(versionId, name, t, userId, fileId);
  })();
  const out = serializeFile(file(fileId));
  // Box does not document a dedicated new-version trigger. The fake fires FILE.UPLOADED for new
  // versions unless disabled, and Keel's reconciler compares file_version ids either way.
  if (env("FAKEBOX_FIRE_ON_NEW_VERSION", "true") !== "false") emit("FILE.UPLOADED", f.parent_id, userId, out);
  return out;
}

export function getFile(userId: string, fileId: string, fields?: string | null) {
  const full = serializeFile(requireFile(userId, fileId));
  return fields ? pickFields(full, ["type", "id", "etag", "name", "sequence_id", "sha1", "file_version"], fields) : full;
}

export function trashFile(userId: string, fileId: string) {
  const f = requireFile(userId, fileId, true);
  const out = serializeFile(f);
  db().prepare("UPDATE files SET trashed_at = ? WHERE id = ?").run(now(), fileId);
  emit("FILE.TRASHED", f.parent_id, userId, { ...out, item_status: "trashed" });
}

export function listVersions(userId: string, fileId: string) {
  const f = requireFile(userId, fileId);
  // Box lists past versions only; the current version comes from GET /files/{id}.
  const rows = db().prepare("SELECT * FROM file_versions WHERE file_id = ? AND id != ? ORDER BY version_number DESC").all(fileId, f.current_version_id) as VersionRow[];
  return { total_count: rows.length, entries: rows.map(serializeVersion), limit: 1000, offset: 0 };
}

export function allVersionsForUi(fileId: string) {
  const rows = db().prepare("SELECT * FROM file_versions WHERE file_id = ? ORDER BY version_number DESC").all(fileId) as VersionRow[];
  return rows.map((v) => ({ ...serializeVersion(v), comment: v.comment }));
}

export function versionContent(userId: string, fileId: string, versionId?: string | null) {
  const f = requireFile(userId, fileId);
  const v = versionRow(versionId || f.current_version_id);
  if (!v || v.file_id !== fileId) throw new BoxError(404, "not_found", "Not Found");
  return { version: v, content: v.content, name: v.name };
}

// Short-lived download URLs, like Box's 302 to dl.boxcloud.com.
export function signDownload(fileId: string, versionId: string) {
  const exp = Date.now() + 60_000;
  const payload = `${fileId}.${versionId}.${exp}`;
  const sig = crypto.createHmac("sha256", env("FAKEBOX_DL_SECRET", "dl")).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}
export function verifyDownload(token: string) {
  const [fileId, versionId, exp, sig] = token.split(".");
  const expect = crypto.createHmac("sha256", env("FAKEBOX_DL_SECRET", "dl")).update(`${fileId}.${versionId}.${exp}`).digest("base64url");
  if (!sig || sig !== expect || Number(exp) < Date.now()) throw new BoxError(403, "access_denied", "Download URL expired or invalid");
  const v = versionRow(versionId);
  if (!v || v.file_id !== fileId) throw new BoxError(404, "not_found", "Not Found");
  return v;
}

// ---------- metadata ----------
type TemplateField = { type: string; key: string; displayName?: string; options?: { key: string }[] };
const FIELD_TYPES = new Set(["string", "float", "date", "enum", "multiSelect", "taxonomy"]);

export function createTemplate(userId: string, body: { scope: string; templateKey?: string; displayName: string; fields: TemplateField[] }) {
  if (getUser(userId).kind !== "service" && getUser(userId).kind !== "admin") throw new BoxError(403, "forbidden", "Admin permission required");
  if (body.scope !== "enterprise") throw new BoxError(400, "bad_request", "Apps can only create enterprise templates");
  const key = body.templateKey || body.displayName.replace(/[^a-zA-Z0-9_]/g, "");
  if (!/^[a-zA-Z_][-a-zA-Z0-9_]*$/.test(key) || key.length > 64) throw new BoxError(400, "bad_request", "Invalid templateKey");
  for (const f of body.fields) {
    if (!FIELD_TYPES.has(f.type)) throw new BoxError(400, "bad_request", `Invalid field type ${f.type}`);
    if (!f.key || f.key.length > 256) throw new BoxError(400, "bad_request", "Invalid field key");
  }
  const exists = db().prepare("SELECT 1 FROM metadata_templates WHERE scope = ? AND template_key = ?").get(body.scope, key);
  if (exists) throw new BoxError(409, "conflict", "Template already exists");
  db().prepare("INSERT INTO metadata_templates(scope, template_key, display_name, fields) VALUES(?,?,?,?)").run(body.scope, key, body.displayName, JSON.stringify(body.fields));
  return getTemplate(body.scope, key);
}
export function getTemplate(scope: string, key: string) {
  const t = db().prepare("SELECT * FROM metadata_templates WHERE scope = ? AND template_key = ?").get(scope, key) as { scope: string; template_key: string; display_name: string; fields: string } | undefined;
  if (!t) throw new BoxError(404, "instance_tuple_not_found", "Template not found");
  return { type: "metadata_template", id: `${t.scope}.${t.template_key}`, scope: t.scope, templateKey: t.template_key, displayName: t.display_name, fields: JSON.parse(t.fields) as TemplateField[] };
}
function validateValues(scope: string, key: string, data: Record<string, unknown>) {
  const tpl = getTemplate(scope, key);
  for (const [k, v] of Object.entries(data)) {
    const f = tpl.fields.find((x) => x.key === k);
    if (!f) throw new BoxError(400, "bad_request", `Unknown field ${k}`);
    if (v === null || v === undefined) continue;
    if (f.type === "float" && typeof v !== "number") throw new BoxError(400, "bad_request", `${k} must be a number`);
    if (f.type === "string" && typeof v !== "string") throw new BoxError(400, "bad_request", `${k} must be a string`);
    if (f.type === "enum" && !f.options?.some((o) => o.key === v)) throw new BoxError(400, "bad_request", `${k} must be one of the enum options`);
    if (f.type === "date" && (typeof v !== "string" || isNaN(Date.parse(v)))) throw new BoxError(400, "bad_request", `${k} must be a date`);
  }
}
function requireItem(userId: string, itemType: string, itemId: string, write: boolean) {
  if (itemType === "folders") requireFolder(userId, itemId, write);
  else if (itemType === "files") requireFile(userId, itemId, write);
  else throw new BoxError(400, "bad_request", "Unsupported item type");
}
function serializeInstance(itemType: string, itemId: string, scope: string, key: string, data: Record<string, unknown>, version: number) {
  return { ...data, $type: `${key}-${scope}`, $parent: `${itemType.slice(0, -1)}_${itemId}`, $id: `${itemType}:${itemId}:${key}`, $version: version, $typeVersion: 0, $template: key, $scope: scope, $canEdit: true };
}
export function getInstance(userId: string, itemType: string, itemId: string, scope: string, key: string) {
  requireItem(userId, itemType, itemId, false);
  const row = db().prepare("SELECT * FROM metadata_instances WHERE item_type = ? AND item_id = ? AND scope = ? AND template_key = ?").get(itemType, itemId, scope, key) as { data: string; version: number } | undefined;
  if (!row) throw new BoxError(404, "instance_not_found", "Instance not found");
  return serializeInstance(itemType, itemId, scope, key, JSON.parse(row.data), row.version);
}
export function peekInstance(itemType: string, itemId: string, scope: string, key: string) {
  const row = db().prepare("SELECT * FROM metadata_instances WHERE item_type = ? AND item_id = ? AND scope = ? AND template_key = ?").get(itemType, itemId, scope, key) as { data: string; version: number; updated_at: string } | undefined;
  return row ? { data: JSON.parse(row.data) as Record<string, unknown>, version: row.version, updated_at: row.updated_at } : null;
}
export function createInstance(userId: string, itemType: string, itemId: string, scope: string, key: string, data: Record<string, unknown>) {
  requireItem(userId, itemType, itemId, true);
  validateValues(scope, key, data);
  const count = db().prepare("SELECT COUNT(*) c FROM metadata_instances WHERE item_type = ? AND item_id = ?").get(itemType, itemId) as { c: number };
  if (count.c >= 100) throw new BoxError(400, "bad_request", "Too many metadata instances on this item");
  try {
    db().prepare("INSERT INTO metadata_instances(item_type, item_id, scope, template_key, data, version, updated_at) VALUES(?,?,?,?,?,0,?)").run(itemType, itemId, scope, key, JSON.stringify(data), now());
  } catch {
    throw new BoxError(409, "tuple_already_exists", "Metadata instance already exists");
  }
  return serializeInstance(itemType, itemId, scope, key, data, 0);
}
type PatchOp = { op: string; path: string; value?: unknown; from?: string };
export function updateInstance(userId: string, itemType: string, itemId: string, scope: string, key: string, ops: PatchOp[]) {
  requireItem(userId, itemType, itemId, true);
  const row = db().prepare("SELECT * FROM metadata_instances WHERE item_type = ? AND item_id = ? AND scope = ? AND template_key = ?").get(itemType, itemId, scope, key) as { data: string; version: number } | undefined;
  if (!row) throw new BoxError(404, "instance_not_found", "Instance not found");
  const data = JSON.parse(row.data) as Record<string, unknown>;
  // JSON Patch is atomic: any failing op (including `test`) rejects the whole update.
  for (const o of ops) {
    const k = o.path.replace(/^\//, "");
    switch (o.op) {
      case "add": case "replace":
        if (o.op === "replace" && !(k in data)) throw new BoxError(400, "bad_request", `replace on missing field ${k}`);
        data[k] = o.value; break;
      case "remove": delete data[k]; break;
      case "test": if (JSON.stringify(data[k]) !== JSON.stringify(o.value)) throw new BoxError(409, "precondition_failed", `test failed for ${k}`); break;
      case "copy": case "move": {
        const from = (o.from || "").replace(/^\//, "");
        data[k] = data[from];
        if (o.op === "move") delete data[from];
        break;
      }
      default: throw new BoxError(400, "bad_request", `Unsupported op ${o.op}`);
    }
  }
  validateValues(scope, key, data);
  db().prepare("UPDATE metadata_instances SET data = ?, version = version + 1, updated_at = ? WHERE item_type = ? AND item_id = ? AND scope = ? AND template_key = ?").run(JSON.stringify(data), now(), itemType, itemId, scope, key);
  return serializeInstance(itemType, itemId, scope, key, data, row.version + 1);
}

// ---------- tasks ----------
type TaskRow = { id: string; file_id: string; action: string; message: string; due_at: string | null; completion_rule: string; created_by: string; created_at: string; is_completed: number };
type AssignmentRow = { id: string; task_id: string; assigned_to: string; assigned_by: string; resolution_state: string; message: string | null; assigned_at: string; completed_at: string | null };

function serializeAssignment(a: AssignmentRow) {
  const t = db().prepare("SELECT file_id FROM tasks WHERE id = ?").get(a.task_id) as { file_id: string };
  const f = db().prepare("SELECT id, name FROM files WHERE id = ?").get(t.file_id) as { id: string; name: string };
  return {
    type: "task_assignment", id: a.id, item: { type: "file", id: f.id, name: f.name },
    assigned_to: userMini(a.assigned_to), assigned_by: userMini(a.assigned_by), message: a.message ?? "",
    resolution_state: a.resolution_state, assigned_at: a.assigned_at, completed_at: a.completed_at,
    reminded_at: null,
  };
}
export function serializeTask(t: TaskRow) {
  const f = db().prepare("SELECT id, name FROM files WHERE id = ?").get(t.file_id) as { id: string; name: string };
  const assignments = db().prepare("SELECT * FROM task_assignments WHERE task_id = ?").all(t.id) as AssignmentRow[];
  return {
    type: "task", id: t.id, item: { type: "file", id: f.id, name: f.name }, action: t.action, message: t.message,
    due_at: t.due_at, completion_rule: t.completion_rule, is_completed: !!t.is_completed,
    created_by: userMini(t.created_by), created_at: t.created_at,
    task_assignment_collection: { total_count: assignments.length, entries: assignments.map(serializeAssignment) },
  };
}
function taskRow(id: string): TaskRow {
  const t = db().prepare("SELECT * FROM tasks WHERE id = ?").get(id) as TaskRow | undefined;
  if (!t) throw new BoxError(404, "not_found", "Not Found");
  return t;
}
export function createTask(userId: string, body: { item?: { type?: string; id?: string }; action?: string; message?: string; due_at?: string | null; completion_rule?: string }) {
  if (body.item?.type !== "file" || !body.item.id) throw new BoxError(400, "bad_request", "Tasks can only be created on files");
  requireFile(userId, body.item.id);
  const action = body.action ?? "review";
  if (!["review", "complete"].includes(action)) throw new BoxError(400, "bad_request", "action must be review or complete");
  const rule = body.completion_rule ?? "all_assignees";
  if (!["all_assignees", "any_assignee"].includes(rule)) throw new BoxError(400, "bad_request", "invalid completion_rule");
  const id = nextId("task");
  db().prepare("INSERT INTO tasks(id, file_id, action, message, due_at, completion_rule, created_by, created_at) VALUES(?,?,?,?,?,?,?,?)")
    .run(id, body.item.id, action, body.message ?? "", body.due_at ?? null, rule, userId, now());
  return serializeTask(taskRow(id));
}
export function getTask(userId: string, id: string) {
  const t = taskRow(id);
  requireFile(userId, t.file_id);
  return serializeTask(t);
}
export function updateTask(userId: string, id: string, body: { message?: string; due_at?: string | null }) {
  const t = taskRow(id);
  requireFile(userId, t.file_id);
  if (t.created_by !== userId) throw new BoxError(403, "access_denied_insufficient_permissions", "Only the task creator can update the task");
  db().prepare("UPDATE tasks SET message = COALESCE(?, message), due_at = COALESCE(?, due_at) WHERE id = ?").run(body.message ?? null, body.due_at ?? null, id);
  return serializeTask(taskRow(id));
}
export function listFileTasks(userId: string, fileId: string) {
  requireFile(userId, fileId);
  const rows = db().prepare("SELECT * FROM tasks WHERE file_id = ? ORDER BY created_at DESC").all(fileId) as TaskRow[];
  return { total_count: rows.length, entries: rows.map(serializeTask) };
}
export function listTaskAssignments(userId: string, taskId: string) {
  const t = taskRow(taskId);
  requireFile(userId, t.file_id);
  const rows = db().prepare("SELECT * FROM task_assignments WHERE task_id = ?").all(taskId) as AssignmentRow[];
  return { total_count: rows.length, entries: rows.map(serializeAssignment) };
}
export function assignTask(userId: string, body: { task?: { id?: string }; assign_to?: { id?: string; login?: string } }) {
  const t = taskRow(body.task?.id ?? "");
  requireFile(userId, t.file_id);
  let assignee: UserRow | undefined;
  if (body.assign_to?.id) assignee = db().prepare("SELECT * FROM users WHERE id = ?").get(body.assign_to.id) as UserRow | undefined;
  else if (body.assign_to?.login) assignee = db().prepare("SELECT * FROM users WHERE login = ?").get(body.assign_to.login) as UserRow | undefined;
  if (!assignee) throw new BoxError(404, "not_found", "User not found");
  const f = file(t.file_id);
  // Box: the assignee must be a collaborator on the file; otherwise the API returns 500.
  if (!folderRole(assignee.id, f.parent_id)) throw new BoxError(500, "internal_server_error", "Assignee does not have access to the file");
  const id = nextId("assignment");
  db().prepare("INSERT INTO task_assignments(id, task_id, assigned_to, assigned_by, assigned_at) VALUES(?,?,?,?,?)").run(id, t.id, assignee.id, userId, now());
  return serializeAssignment(db().prepare("SELECT * FROM task_assignments WHERE id = ?").get(id) as AssignmentRow);
}
export function resolveAssignment(userId: string, id: string, body: { resolution_state?: string; message?: string }) {
  const a = db().prepare("SELECT * FROM task_assignments WHERE id = ?").get(id) as AssignmentRow | undefined;
  if (!a) throw new BoxError(404, "not_found", "Not Found");
  if (a.assigned_to !== userId) throw new BoxError(403, "access_denied_insufficient_permissions", "Only the assignee can resolve this assignment");
  const t = taskRow(a.task_id);
  const allowed = t.action === "review" ? ["incomplete", "approved", "rejected"] : ["incomplete", "completed"];
  if (body.resolution_state && !allowed.includes(body.resolution_state)) throw new BoxError(400, "bad_request", `resolution_state must be one of ${allowed.join(", ")}`);
  if (t.action === "complete" && a.resolution_state === "completed") throw new BoxError(403, "forbidden", "A completed task cannot be changed");
  const state = body.resolution_state ?? a.resolution_state;
  db().prepare("UPDATE task_assignments SET resolution_state = ?, message = COALESCE(?, message), completed_at = ? WHERE id = ?")
    .run(state, body.message ?? null, state === "incomplete" ? null : now(), id);
  const open = db().prepare("SELECT COUNT(*) c FROM task_assignments WHERE task_id = ? AND resolution_state = 'incomplete'").get(t.id) as { c: number };
  const done = t.completion_rule === "any_assignee" ? state !== "incomplete" : open.c === 0;
  db().prepare("UPDATE tasks SET is_completed = ? WHERE id = ?").run(done ? 1 : 0, t.id);
  return serializeAssignment(db().prepare("SELECT * FROM task_assignments WHERE id = ?").get(id) as AssignmentRow);
}
export function tasksForUser(userId: string) {
  const rows = db().prepare(`SELECT a.* FROM task_assignments a JOIN tasks t ON t.id = a.task_id
    WHERE a.assigned_to = ? ORDER BY a.assigned_at DESC`).all(userId) as AssignmentRow[];
  return rows.map((a) => ({ assignment: serializeAssignment(a), task: serializeTask(taskRow(a.task_id)) }));
}

// ---------- comments ----------
export function createComment(userId: string, body: { item?: { type?: string; id?: string }; message?: string }) {
  if (!body.item?.id || !["file", "comment"].includes(body.item.type ?? "")) throw new BoxError(400, "bad_request", "item.type must be file or comment");
  if (!body.message) throw new BoxError(400, "bad_request", "message is required");
  requireFile(userId, body.item.id);
  const id = nextId("comment");
  db().prepare("INSERT INTO comments(id, file_id, message, created_by, created_at) VALUES(?,?,?,?,?)").run(id, body.item.id, body.message, userId, now());
  return { type: "comment", id, message: body.message, created_by: userMini(userId), created_at: now(), item: { type: "file", id: body.item.id } };
}

// ---------- webhooks ----------
const TRIGGERS = new Set(["FILE.UPLOADED", "FILE.TRASHED", "FILE.DELETED", "FILE.MOVED", "FILE.RENAMED", "FILE.RESTORED", "METADATA_INSTANCE.UPDATED", "TASK_ASSIGNMENT.UPDATED", "COMMENT.CREATED"]);
type WebhookRow = { id: string; target_type: string; target_id: string; address: string; triggers: string; created_by: string; created_at: string };
const serializeWebhook = (w: WebhookRow) => ({
  type: "webhook", id: w.id, target: { type: w.target_type, id: w.target_id }, address: w.address,
  triggers: JSON.parse(w.triggers), created_by: userMini(w.created_by), created_at: w.created_at,
});
export function createWebhook(userId: string, body: { target?: { type?: string; id?: string }; address?: string; triggers?: string[] }) {
  const type = body.target?.type, id = body.target?.id;
  if (!id || (type !== "folder" && type !== "file")) throw new BoxError(400, "bad_request", "target must be a file or folder");
  if (type === "folder" && id === "0") throw new BoxError(400, "bad_request", "Webhooks cannot be created on the root folder");
  if (type === "folder") requireFolder(userId, id); else requireFile(userId, id);
  const triggers = body.triggers ?? [];
  if (!triggers.length || triggers.some((t) => !TRIGGERS.has(t))) throw new BoxError(400, "bad_request", "Invalid triggers");
  if (type === "file" && triggers.includes("FILE.UPLOADED")) throw new BoxError(400, "bad_request", "FILE.UPLOADED is only valid on folders");
  if (!body.address || !/^https?:\/\//.test(body.address)) throw new BoxError(400, "bad_request", "address must be a URL");
  const count = db().prepare("SELECT COUNT(*) c FROM webhooks WHERE created_by = ?").get(userId) as { c: number };
  if (count.c >= 1000) throw new BoxError(400, "bad_request", "Webhook limit reached");
  const whId = nextId("webhook");
  try {
    db().prepare("INSERT INTO webhooks(id, target_type, target_id, address, triggers, created_by, created_at) VALUES(?,?,?,?,?,?,?)")
      .run(whId, type, id, body.address, JSON.stringify(triggers), userId, now());
  } catch {
    // One webhook per item, per application, per user.
    throw new BoxError(409, "conflict", "Webhook on this target already exists for this app and user");
  }
  return serializeWebhook(db().prepare("SELECT * FROM webhooks WHERE id = ?").get(whId) as WebhookRow);
}
export function listWebhooks(userId: string) {
  const rows = db().prepare("SELECT * FROM webhooks WHERE created_by = ?").all(userId) as WebhookRow[];
  return { entries: rows.map(serializeWebhook), limit: 100 };
}
export function deleteWebhook(userId: string, id: string) {
  const r = db().prepare("DELETE FROM webhooks WHERE id = ? AND created_by = ?").run(id, userId);
  if (!r.changes) throw new BoxError(404, "not_found", "Not Found");
}
export function recentDeliveries(limit = 20) {
  return db().prepare("SELECT * FROM webhook_deliveries ORDER BY id DESC LIMIT ?").all(limit);
}

function emit(trigger: string, folderId: string, actorId: string, source: Record<string, unknown>) {
  const chain = folderChain(folderId).map((f) => f.id);
  const hooks = (db().prepare("SELECT * FROM webhooks WHERE target_type = 'folder'").all() as WebhookRow[])
    .filter((w) => chain.includes(w.target_id) && JSON.parse(w.triggers).includes(trigger));
  for (const w of hooks) {
    const body = JSON.stringify({
      type: "webhook_event", id: crypto.randomUUID(), created_at: now(), trigger,
      webhook: { id: w.id, type: "webhook" }, created_by: userMini(actorId), source, additional_info: [],
    });
    const eventId = JSON.parse(body).id as string;
    const info = db().prepare("INSERT INTO webhook_deliveries(webhook_id, event_id, trigger, source_name, created_by, status, created_at, updated_at) VALUES(?,?,?,?,?,?,?,?)")
      .run(w.id, eventId, trigger, String(source.name ?? ""), actorId, "pending", now(), now());
    void deliver(Number(info.lastInsertRowid), w.address, body, 0);
  }
}

export function signWebhook(body: string, timestamp: string, key: string) {
  return crypto.createHmac("sha256", key).update(Buffer.concat([Buffer.from(body), Buffer.from(timestamp)])).digest("base64");
}

async function deliver(deliveryRowId: number, address: string, body: string, attempt: number) {
  const timestamp = new Date().toISOString().replace(/\.\d{3}Z$/, "+00:00");
  const headers: Record<string, string> = {
    "content-type": "application/json; charset=UTF-8",
    "box-delivery-id": crypto.randomUUID(),
    "box-delivery-timestamp": timestamp,
    "box-signature-version": "1",
    "box-signature-algorithm": "HmacSHA256",
    "box-signature-primary": signWebhook(body, timestamp, env("FAKEBOX_WEBHOOK_PRIMARY_KEY")),
    "box-signature-secondary": signWebhook(body, timestamp, env("FAKEBOX_WEBHOOK_SECONDARY_KEY")),
    "user-agent": "Box-WH-Client/0.1",
  };
  let status = 0;
  try {
    const res = await fetch(address, { method: "POST", headers, body, signal: AbortSignal.timeout(30_000) });
    status = res.status;
  } catch {
    status = 0;
  }
  const ok = status >= 200 && status < 300;
  const final = ok || attempt >= 5;
  db().prepare("UPDATE webhook_deliveries SET attempts = ?, status = ?, last_status_code = ?, updated_at = ? WHERE id = ?")
    .run(attempt + 1, ok ? "delivered" : final ? "failed" : "retrying", status, now(), deliveryRowId);
  // Box retries up to 5 times over an hour; locally we compress the schedule.
  if (!final) setTimeout(() => void deliver(deliveryRowId, address, body, attempt + 1), 1000 * 2 ** attempt);
}
