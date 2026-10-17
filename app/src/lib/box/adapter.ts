/**
 * BoxAdapter: the only surface through which Keel touches Box. Two implementations:
 * `real.ts` (box-typescript-sdk-gen, MOCK_MODE=false) and `mock.ts` (in-memory, seeded
 * from demo-data/lantern, MOCK_MODE=true). The pipeline, ledger, staleness and display
 * code never import either implementation directly; they receive an adapter.
 */
import type { BoxIdentity, BoxResolutionState } from "../types";

export interface BoxFolderItem {
  fileId: string;
  fileName: string;
  currentVersionId: string;
  sha1?: string;
  size?: number;
}

export interface BoxFileVersion {
  versionId: string;
  createdAt: string; // UTC ISO
  uploader?: BoxIdentity;
  comment?: string;
  sha1?: string;
  /** Display label such as "v3" (1-based, oldest first) when the adapter can compute it. */
  label?: string;
}

export type BoxReadResult =
  | { ok: true; text: string; sha256: string }
  | { ok: false; error: { code: string; message: string } };

export type BoxWriteResult = { ok: true } | { ok: false; error: { code: string; message: string } };

export interface BoxTaskAssignmentView {
  assignment_id: string;
  assigned_to: BoxIdentity;
  resolution_state: BoxResolutionState;
  message: string;
  completed_at: string | null;
}

export interface BoxAiAskRaw {
  answer: string;
  citations: { fileId: string; versionId?: string; content: string }[];
  /** Set by the adapter when the tenant cannot serve Box AI; the caller falls back and labels it. */
  unavailable?: false;
}

export type BoxAiAskResponse = BoxAiAskRaw | { unavailable: true; reason: string };
export type BoxAiTextGenResponse = { text: string; unavailable?: false } | { unavailable: true; reason: string };

export interface BoxAdapter {
  readonly kind: "real" | "mock";
  listFolderItems(folderId: string): Promise<BoxFolderItem[]>;
  listFileVersions(fileId: string): Promise<BoxFileVersion[]>;
  /** Download the pinned version. Reads outside the snapshot are rejected by the caller, not here. */
  downloadVersionText(fileId: string, versionId: string): Promise<BoxReadResult>;
  readFolderMetadata(folderId: string, templateKey: string): Promise<Record<string, string | null> | null>;
  writeFolderMetadata(folderId: string, templateKey: string, fields: Record<string, string | null>): Promise<BoxWriteResult>;
  createTask(fileId: string, message: string, action: "review" | "complete", dueAt?: string): Promise<{ task_id: string }>;
  assignTask(taskId: string, assignee: { id: string } | { login: string }): Promise<{ assignment_id: string; assigned_to: BoxIdentity }>;
  listTaskAssignments(taskId: string): Promise<BoxTaskAssignmentView[]>;
  aiAsk(fileIds: string[], prompt: string, opts: { citations: true }): Promise<BoxAiAskResponse>;
  aiTextGen(fileIds: string[], prompt: string): Promise<BoxAiTextGenResponse>;
  /**
   * Optional (additive): reconcile an ambiguous task creation. The task on `fileId` whose message
   * contains `marker` (an exact message match is preferred), with its assignment ids, or null.
   */
  findTaskByMessage?(fileId: string, marker: string): Promise<{ task_id: string; assignment_ids?: string[] } | null>;
  /** Identity Box reports for the configured service account; used to label the human step. */
  currentUser(): Promise<BoxIdentity>;
}
