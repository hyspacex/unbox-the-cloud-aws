import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { dataDir } from "../env";

// Read-only view of Keel's store (DynamoDB single table in production). The runner owns writes.

type G = typeof globalThis & { __keelDb?: Database.Database };

function db(): Database.Database | null {
  const g = globalThis as G;
  if (!g.__keelDb) {
    const file = path.join(dataDir(), "keel.db");
    if (!fs.existsSync(file)) return null;
    const d = new Database(file, { readonly: true, fileMustExist: true });
    d.pragma("busy_timeout = 5000");
    g.__keelDb = d;
  }
  return g.__keelDb;
}

function query<T>(pk: string, prefix = "", desc = false, limit?: number): T[] {
  const d = db();
  if (!d) return [];
  try {
    const rows = d.prepare(`SELECT data FROM items WHERE pk = ? AND sk >= ? AND sk < ? ORDER BY sk ${desc ? "DESC" : "ASC"}${limit ? ` LIMIT ${limit}` : ""}`)
      .all(pk, prefix, prefix + "\uffff") as { data: string }[];
    return rows.map((r) => JSON.parse(r.data) as T);
  } catch {
    return [];
  }
}
function get<T>(pk: string, sk: string): T | null {
  const d = db();
  if (!d) return null;
  try {
    const row = d.prepare("SELECT data FROM items WHERE pk = ? AND sk = ?").get(pk, sk) as { data: string } | undefined;
    return row ? (JSON.parse(row.data) as T) : null;
  } catch {
    return null;
  }
}

export type UserRef = { id: string; name: string } | null;
export type Counts = { passing: number; failing: number; unknown: number; total: number };
export type SnapshotFile = {
  id: string; name: string; version_id: string; sha1: string; version_number: number; size: number;
  modified_at: string; modified_by: UserRef; changed: boolean; added: boolean;
};
export type Pack = { id: string; version: string; name: string; publisher: string };
export type Run = {
  run_id: string; number: number; folder_id: string; status: "running" | "completed" | "error";
  trigger: { reason: string; event?: string; actor: UserRef; file: { id: string; name: string; version_id: string } | null };
  started_at: string; finished_at?: string; duration_ms?: number;
  snapshot: { hash: string; files: SnapshotFile[]; removed: { id: string; name: string }[] };
  judge: { name: string; model_id: string };
  rules?: { hash: string; file: { id: string; version_id: string; version_number: number }; uses: string[]; packs: Pack[]; changed: boolean };
  coverage?: { file_id: string; name: string; status: string; detail?: string }[];
  counts?: Counts;
  changes?: { broke: string[]; fixed: string[]; added: string[]; removed: string[]; first_run: boolean };
  tasks?: { kind: string; task_id?: string; file_id: string; assignee_id: string; assignee?: UserRef; rules: string[]; error?: string }[];
  projection?: { status: string; error?: string };
  error?: string;
};
export type Citation = { file_id: string; file_name: string; version_id: string; quote: string; line: number | null; section: string | null; timestamp: string | null };
export type Blame = { user: UserRef; file: { id: string; name: string; version_id?: string; version_number?: number; removed?: boolean } | null };
export type Result = {
  run_id: string; rule_id: string; title: string; text: string; source: "folder" | "pack"; pack: Pack | null;
  status: "pass" | "fail" | "unknown"; reason: string; citations: Citation[]; missing: string[]; problems: string[];
  previous_status: string | null; change: "first" | "added" | "broke" | "fixed" | "same";
  blame?: Blame | null; fixed_by?: Blame | null; task_id?: string | null; failing_since?: string;
};
export type FolderMeta = {
  folder_id: string; name: string; owner: UserRef; webhook_id: string; connected_at: string; connected_by: UserRef;
  run_count: number; last_completed_run?: number; latest_run?: { run_id: string; number: number; status: string; counts?: Counts; finished_at?: string; error?: string };
};

export const listFolders = () => query<{ folder_id: string; name: string }>("FOLDERS", "FOLDER#").map((f) => getFolder(f.folder_id)).filter(Boolean) as FolderMeta[];
export const getFolder = (id: string) => get<FolderMeta>(`FOLDER#${id}`, "META");
export const listRuns = (folderId: string, limit = 200) => query<Run>(`FOLDER#${folderId}`, "RUN#", true, limit);
export const getRun = (folderId: string, n: number) => get<Run>(`FOLDER#${folderId}`, `RUN#${String(n).padStart(6, "0")}`);
export const getResults = (runId: string) => query<Result>(`RUN#${runId}`, "RESULT#");
export const getResult = (runId: string, ruleId: string) => get<Result>(`RUN#${runId}`, `RESULT#${ruleId}`);

export function latestCompleted(folderId: string): Run | null {
  const n = getFolder(folderId)?.last_completed_run;
  return n ? getRun(folderId, n) : null;
}
export function inProgress(folderId: string): Run | null {
  const r = listRuns(folderId, 1)[0];
  return r && r.status === "running" ? r : null;
}
export function queuedCount(folderId: string): number {
  const d = db();
  if (!d) return 0;
  try {
    const sql = `SELECT COUNT(*) c FROM queue_messages WHERE group_id = ? AND receive_count = 0 AND body NOT LIKE '%"reason": "reconcile"%'`;
    return (d.prepare(sql).get(folderId) as { c: number }).c;
  } catch {
    return 0;
  }
}
export function ruleHistory(folderId: string, ruleId: string) {
  return listRuns(folderId, 30).reverse().map((run) => ({ run, result: run.status === "completed" ? getResult(run.run_id, ruleId) : null }));
}
