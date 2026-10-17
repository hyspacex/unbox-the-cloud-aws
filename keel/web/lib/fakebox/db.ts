import Database from "better-sqlite3";
import path from "node:path";
import { dataDir } from "../env";

// Fake Box persistence. Owned exclusively by the Fake Box API; Keel never reads it directly.
const SCHEMA = `
CREATE TABLE IF NOT EXISTS seq (name TEXT PRIMARY KEY, value INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, login TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL DEFAULT 'user', title TEXT, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS folders (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, parent_id TEXT, owned_by TEXT NOT NULL,
  created_at TEXT NOT NULL, modified_at TEXT NOT NULL, trashed_at TEXT);
CREATE TABLE IF NOT EXISTS collaborations (
  id TEXT PRIMARY KEY, folder_id TEXT NOT NULL, user_id TEXT NOT NULL, role TEXT NOT NULL,
  created_at TEXT NOT NULL, UNIQUE(folder_id, user_id));
CREATE TABLE IF NOT EXISTS files (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, parent_id TEXT NOT NULL,
  current_version_id TEXT NOT NULL, created_by TEXT NOT NULL, created_at TEXT NOT NULL,
  modified_at TEXT NOT NULL, modified_by TEXT NOT NULL, trashed_at TEXT, sequence_id INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS file_versions (
  id TEXT PRIMARY KEY, file_id TEXT NOT NULL, version_number INTEGER NOT NULL, name TEXT NOT NULL,
  sha1 TEXT NOT NULL, size INTEGER NOT NULL, content BLOB NOT NULL, created_at TEXT NOT NULL,
  modified_by TEXT NOT NULL, comment TEXT);
CREATE TABLE IF NOT EXISTS metadata_templates (
  scope TEXT NOT NULL, template_key TEXT NOT NULL, display_name TEXT NOT NULL, fields TEXT NOT NULL,
  PRIMARY KEY (scope, template_key));
CREATE TABLE IF NOT EXISTS metadata_instances (
  item_type TEXT NOT NULL, item_id TEXT NOT NULL, scope TEXT NOT NULL, template_key TEXT NOT NULL,
  data TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL,
  PRIMARY KEY (item_type, item_id, scope, template_key));
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY, file_id TEXT NOT NULL, action TEXT NOT NULL, message TEXT NOT NULL,
  due_at TEXT, completion_rule TEXT NOT NULL, created_by TEXT NOT NULL, created_at TEXT NOT NULL,
  is_completed INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS task_assignments (
  id TEXT PRIMARY KEY, task_id TEXT NOT NULL, assigned_to TEXT NOT NULL, assigned_by TEXT NOT NULL,
  resolution_state TEXT NOT NULL DEFAULT 'incomplete', message TEXT, assigned_at TEXT NOT NULL,
  completed_at TEXT);
CREATE TABLE IF NOT EXISTS comments (
  id TEXT PRIMARY KEY, file_id TEXT NOT NULL, message TEXT NOT NULL, created_by TEXT NOT NULL,
  created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS webhooks (
  id TEXT PRIMARY KEY, target_type TEXT NOT NULL, target_id TEXT NOT NULL, address TEXT NOT NULL,
  triggers TEXT NOT NULL, created_by TEXT NOT NULL, created_at TEXT NOT NULL,
  UNIQUE(target_type, target_id, created_by));
CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id INTEGER PRIMARY KEY AUTOINCREMENT, webhook_id TEXT NOT NULL, event_id TEXT NOT NULL,
  trigger TEXT NOT NULL, source_name TEXT, created_by TEXT, attempts INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL, last_status_code INTEGER, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
`;

type G = typeof globalThis & { __fakeboxDb?: Database.Database };

export function db(): Database.Database {
  const g = globalThis as G;
  if (!g.__fakeboxDb) {
    const d = new Database(path.join(dataDir(), "fakebox.db"));
    d.pragma("journal_mode = WAL");
    d.pragma("busy_timeout = 5000");
    d.exec(SCHEMA);
    g.__fakeboxDb = d;
  }
  return g.__fakeboxDb;
}

export function resetDb() {
  const d = db();
  const tables = d.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all() as { name: string }[];
  d.transaction(() => { for (const t of tables) d.exec(`DELETE FROM ${t.name}`); })();
}

// Box ids are numeric-looking strings.
export function nextId(kind: string): string {
  const d = db();
  const base: Record<string, number> = {
    user: 30110000, folder: 318840000, file: 1650000000, version: 1810000000, task: 41200000,
    assignment: 59300000, comment: 77100000, webhook: 9700, collaboration: 52800000,
  };
  return d.transaction(() => {
    const row = d.prepare("SELECT value FROM seq WHERE name = ?").get(kind) as { value: number } | undefined;
    const value = row ? row.value + Math.floor(Math.random() * 7) + 1 : (base[kind] ?? 1000) + Math.floor(Math.random() * 90) + 10;
    d.prepare("INSERT INTO seq(name, value) VALUES(?, ?) ON CONFLICT(name) DO UPDATE SET value = excluded.value").run(kind, value);
    return String(value);
  })();
}

export const now = () => new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
