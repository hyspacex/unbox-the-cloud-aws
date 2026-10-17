import type { FolderProjection as FP } from "@/lib/types";
import { Disclosure } from "@/components/ui/Disclosure";
import { utc } from "@/lib/ui/format";

export function FolderProjection({ projection, currentSnapshotId }: { projection: FP | null; currentSnapshotId: string }) {
  if (!projection) {
    return (
      <div className="text-[13px] text-muted">
        In Box: no folder metadata written yet for this package.
      </div>
    );
  }
  const stale = projection.keel_snapshot_id !== currentSnapshotId;
  return (
    <Disclosure
      label={
        <span>
          In Box: folder metadata <span className="mono">keel_snapshot_id</span> ={" "}
          <span className="mono text-ink">{projection.keel_snapshot_id}</span>
        </span>
      }
      hint={
        <span className={projection.result === "ok" && !stale ? "" : "text-red-ink"}>
          · write {projection.result}
          {projection.pointer_check ? ` · pointer check ${projection.pointer_check.matches ? "matches" : "does not match"}` : ""}
          {stale ? ` · Keel is on ${currentSnapshotId}, consumers must not trust these fields` : ""}
        </span>
      }
    >
      <div className="rounded-lg border hairline bg-panel-cool p-4 text-[13px]">
        <div className="grid gap-x-8 gap-y-1 sm:grid-cols-2">
          {Object.entries(projection.statuses).map(([cid, code]) => (
            <div key={cid} className="flex items-baseline justify-between gap-3 border-b border-dashed hairline py-1">
              <span className="mono text-ink-2">keel_status_{cid.replace(/-/g, "_")}</span>
              <span className="mono text-ink">{code}</span>
            </div>
          ))}
        </div>
        <dl className="mt-3 grid gap-1 text-[12.5px] text-muted">
          <div>
            <dt className="inline">keel_last_human_review </dt>
            <dd className="inline mono text-ink-2 break-all">{projection.keel_last_human_review ?? "null"}</dd>
          </div>
          <div>
            <dt className="inline">keel_record_url </dt>
            <dd className="inline mono text-ink-2 break-all">{projection.keel_record_url}</dd>
          </div>
          {projection.written_at ? (
            <div>
              <dt className="inline">written </dt>
              <dd className="inline mono text-ink-2">{utc(projection.written_at)}</dd>
            </div>
          ) : null}
          {projection.last_projected_snapshot ? (
            <div>
              <dt className="inline">last_projected_snapshot </dt>
              <dd className="inline mono text-ink-2">{projection.last_projected_snapshot}</dd>
            </div>
          ) : null}
          {projection.pointer_check ? (
            <div>
              <dt className="inline">pointer check before write </dt>
              <dd className="inline text-ink-2">
                current snapshot <span className="mono">{projection.pointer_check.current_snapshot_id}</span>,{" "}
                {projection.pointer_check.matches ? "matches" : "does not match"}
              </dd>
            </div>
          ) : null}
        </dl>
        <p className="mt-3 text-[12px] text-muted">
          One folder-level instance, no per-file rollups. Consumers check <span className="mono">keel_snapshot_id</span> against
          Keel&apos;s current snapshot before trusting a status field.
        </p>
      </div>
    </Disclosure>
  );
}
