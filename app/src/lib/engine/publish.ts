/**
 * Publication into Box (spec 3 step 10): a separate outcome from evaluation. Before the write,
 * Keel re-reads the authoritative current snapshot pointer and writes only if it still matches.
 * A failed write is read back and recorded as box_metadata_write_failed with
 * last_projected_snapshot; Box keeps its last successfully written values (acceptance 11, 17).
 */
import type { Actor, ControlProfile, FolderProjection, LedgerEvent, ProjectionCode } from "../types";
import type { BoxAdapter } from "../box/adapter";
import type { KeelConfig } from "../config";
import type { Store } from "../store";
import { buildRows } from "./state";
import { buildProjectionFields, encodeLastHumanReview, projectionFieldKey, recordUrl, SNAPSHOT_FIELD } from "./projection";

export const APP_ACTOR: Actor = { type: "app", name: "keel", role: "snapshot, validation, staleness and projection" };

export const eventOpts = (config: KeelConfig) => ({ mrmModelId: config.mrmModelId, folderId: config.box.folderId });

/** Most recent human disposition anywhere in the ledger, encoded for keel_last_human_review. */
export function lastHumanReview(events: LedgerEvent[]): string | null {
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (e.event_type === "human_disposition_recorded") {
      return encodeLastHumanReview({ name: e.actor.name, role: e.actor.role ?? "", controlId: e.control_id ?? "", snapshotId: e.snapshot_id ?? "", utc: e.ts });
    }
  }
  return null;
}

/** Snapshot of the last successful projection according to the ledger. */
export function lastProjectedSnapshot(events: LedgerEvent[]): string | null {
  for (let i = events.length - 1; i >= 0; i--) if (events[i].event_type === "box_metadata_written") return events[i].snapshot_id;
  return null;
}

export async function publishProjection(args: { store: Store; box: BoxAdapter; profile: ControlProfile; config: KeelConfig; snapshotId: string; extra?: Record<string, unknown> }): Promise<{ ok: boolean; event: LedgerEvent; fields: Record<string, string | null> }> {
  const { store, box, profile, config, snapshotId } = args;
  const rows = buildRows(store, profile, snapshotId);
  const fields = buildProjectionFields({
    snapshotId,
    statuses: rows.map((r) => ({ control_id: r.control_id, code: r.status.projection_code })),
    lastHumanReview: lastHumanReview(store.events),
    recordUrl: recordUrl(config.recordUrlBase, config.box.folderId, snapshotId),
  });
  const target = { type: "folder" as const, id: config.box.folderId, template: config.box.templateKey, instance: "folder-level" };
  // Pointer check: re-read the authoritative current snapshot pointer immediately before writing.
  const pointer = store.data.current_snapshot_id ?? "";
  const pointer_check = { current_snapshot_id: pointer, matches: pointer === snapshotId };
  if (!pointer_check.matches) {
    const event = store.append(
      {
        event_type: "box_metadata_write_failed",
        actor: APP_ACTOR,
        snapshot_id: snapshotId,
        target,
        pointer_check,
        fields_attempted: fields,
        error: { code: "POINTER_MISMATCH", message: `current snapshot is ${pointer}; projection for ${snapshotId} not written` },
        projection: { box_metadata: "deferred" },
        last_projected_snapshot: lastProjectedSnapshot(store.events),
        ...args.extra,
      },
      eventOpts(config),
    );
    return { ok: false, event, fields };
  }
  let res: Awaited<ReturnType<BoxAdapter["writeFolderMetadata"]>>;
  try {
    res = await box.writeFolderMetadata(config.box.folderId, config.box.templateKey, fields);
  } catch (err) {
    res = { ok: false, error: { code: "METADATA_WRITE_THREW", message: err instanceof Error ? err.message : String(err) } };
  }
  if (res.ok) {
    const event = store.append(
      {
        event_type: "box_metadata_written",
        actor: APP_ACTOR,
        snapshot_id: snapshotId,
        target,
        pointer_check,
        fields_written: fields,
        projection: { box_metadata: "ok" },
        last_projected_snapshot: snapshotId,
        ...args.extra,
      },
      eventOpts(config),
    );
    return { ok: true, event, fields };
  }
  // Failed or ambiguous: read back what Box holds now.
  let readback: Record<string, string | null> | null = null;
  try {
    readback = await box.readFolderMetadata(config.box.folderId, config.box.templateKey);
  } catch {
    readback = null;
  }
  // Ambiguous write confirmed only when Box holds every attempted field (statuses, last review, url).
  const mismatched = Object.keys(fields).filter((k) => (readback?.[k] ?? null) !== fields[k]);
  const ambiguous = !!readback && mismatched.length === 0;
  const event = store.append(
    {
      event_type: ambiguous ? "box_metadata_written" : "box_metadata_write_failed",
      actor: APP_ACTOR,
      snapshot_id: snapshotId,
      target,
      pointer_check,
      fields_attempted: fields,
      ...(ambiguous ? { fields_written: readback } : {}),
      error: res.error,
      readback: readback ? { [SNAPSHOT_FIELD]: readback[SNAPSHOT_FIELD] ?? null, fields_differing: mismatched } : null,
      projection: { box_metadata: ambiguous ? "ambiguous" : "failed" },
      last_projected_snapshot: ambiguous ? snapshotId : lastProjectedSnapshot(store.events),
      ...args.extra,
    },
    eventOpts(config),
  );
  return { ok: ambiguous, event, fields };
}

/**
 * The folder projection as Keel last recorded it (PackageView.projection). After a failed write the
 * statuses are the values Box retained from the last successful write, and result is "failed".
 */
export function currentProjection(store: Store, profile: ControlProfile): FolderProjection | null {
  const events = store.events;
  const isProj = (e: LedgerEvent) => e.event_type === "box_metadata_written" || e.event_type === "box_metadata_write_failed";
  const latest = [...events].reverse().find(isProj);
  if (!latest) return null;
  const lastOk = [...events].reverse().find((e) => e.event_type === "box_metadata_written");
  const fields = ((lastOk?.fields_written as Record<string, string | null> | undefined) ?? {}) as Record<string, string | null>;
  const statuses: Record<string, ProjectionCode> = {};
  for (const c of profile.controls) {
    const v = fields[projectionFieldKey(c.id)];
    if (v) statuses[c.id] = v as ProjectionCode;
  }
  const result = (latest.projection?.box_metadata ?? "ok") as string;
  return {
    keel_snapshot_id: fields[SNAPSHOT_FIELD] ?? "",
    keel_last_human_review: fields.keel_last_human_review ?? null,
    keel_record_url: fields.keel_record_url ?? "",
    statuses,
    written_at: lastOk?.ts,
    result: (result === "n/a" ? "ok" : result) as FolderProjection["result"],
    last_projected_snapshot: (latest.last_projected_snapshot as string | null | undefined) ?? lastOk?.snapshot_id ?? undefined,
    pointer_check: latest.pointer_check,
  };
}
