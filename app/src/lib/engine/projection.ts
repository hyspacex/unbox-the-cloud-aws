/**
 * Projection into Box folder metadata (spec 3 step 10): one folder-level instance with
 * keel_snapshot_id, one enum field per control with fixed codes, keel_last_human_review encoded
 * "name|role|controlId|snapshotId|utc", and keel_record_url. Consumers must compare
 * keel_snapshot_id with Keel's current snapshot before trusting a status field.
 */
import type { ProjectionCode } from "../types";

export const PROJECTION_CODES: { code: ProjectionCode; meaning: string }[] = [
  { code: "PENDING", meaning: "Re-check pending, or pending review" },
  { code: "NOT_EVALUATED", meaning: "Not evaluated (read failure, input gate, quote validation or evaluation error)" },
  { code: "VERIFIED", meaning: "Human Verified on the current snapshot and binding" },
  { code: "VERIFIED_HOLDS", meaning: "A prior human verification holds under the tier materiality rule" },
  { code: "ACKNOWLEDGE", meaning: "Prior verification needs a human acknowledgment (file or section changed)" },
  { code: "NEEDS_REVIEW_BINDING", meaning: "Evidence found in a different file or version (severity Low)" },
  { code: "NEEDS_REVIEW_WEAKENED", meaning: "Some required clauses lost support" },
  { code: "NEEDS_REVIEW_ABSENT", meaning: "No required clause supported" },
  { code: "NEEDS_REVIEW_CONFLICT", meaning: "Supporting quote conflicts with another quote in the snapshot" },
  { code: "RETURNED_TO_AUTHOR", meaning: "Reviewer returned the finding to the author; open" },
  { code: "NOT_APPLICABLE", meaning: "Proposed" },
  { code: "EXCEPTION", meaning: "Proposed (exception requested, approved, expired; compensating control)" },
];

export const SNAPSHOT_FIELD = "keel_snapshot_id";
export const LAST_REVIEW_FIELD = "keel_last_human_review";
export const RECORD_URL_FIELD = "keel_record_url";

/** "SEC-ARCH-07" -> "keel_status_SEC_ARCH_07" */
export function projectionFieldKey(controlId: string): string {
  return "keel_status_" + controlId.replace(/-/g, "_");
}

export interface LastHumanReview {
  name: string;
  role: string;
  controlId: string;
  snapshotId: string;
  utc: string;
}

export function encodeLastHumanReview(r: LastHumanReview): string {
  return [r.name, r.role, r.controlId, r.snapshotId, r.utc].join("|");
}

export function decodeLastHumanReview(s: string | null | undefined): LastHumanReview | null {
  if (!s) return null;
  const p = s.split("|");
  if (p.length !== 5) return null;
  return { name: p[0], role: p[1], controlId: p[2], snapshotId: p[3], utc: p[4] };
}

export function recordUrl(base: string, folderId: string, snapshotId: string): string {
  return `${base}${folderId}?snapshot=${snapshotId}`;
}

/** Field set in the fixture's order: snapshot id, one status per control (profile order), last review, record url. */
export function buildProjectionFields(args: {
  snapshotId: string;
  statuses: { control_id: string; code: ProjectionCode }[];
  lastHumanReview: string | null;
  recordUrl: string;
}): Record<string, string | null> {
  const f: Record<string, string | null> = { [SNAPSHOT_FIELD]: args.snapshotId };
  for (const s of args.statuses) f[projectionFieldKey(s.control_id)] = s.code;
  f[LAST_REVIEW_FIELD] = args.lastHumanReview;
  f[RECORD_URL_FIELD] = args.recordUrl;
  return f;
}

/** Consumer rule (spec 3 step 10): trust a status field only when keel_snapshot_id matches Keel's current snapshot. */
export function consumerMayTrust(fields: Record<string, string | null> | null, currentSnapshotId: string): boolean {
  return !!fields && fields[SNAPSHOT_FIELD] === currentSnapshotId;
}
