"use client";

import type { FolderProjection as FP } from "@/lib/types";
import { Disclosure } from "@/components/ui/Disclosure";
import { utc } from "@/lib/ui/format";

/** The folder metadata as a Box reviewer sees it in the sidebar, plus Keel's write result. */
export function FolderProjection({
  projection,
  currentSnapshotId,
  defaultOpen = false,
  folderName,
  writing = false,
}: {
  projection: FP | null;
  currentSnapshotId: string;
  defaultOpen?: boolean;
  folderName?: string;
  /** A run is in progress or its metadata write has not landed yet: show it as in flight, not as a warning. */
  writing?: boolean;
}) {
  if (!projection) {
    return <div className="text-[13px] text-muted">In Box: no folder metadata written yet for this package.</div>;
  }
  const stale = projection.keel_snapshot_id !== currentSnapshotId;
  const failed = projection.result === "failed" || projection.result === "ambiguous" || projection.pointer_check?.matches === false;
  const inFlight = !failed && (writing || stale);
  const review = projection.keel_last_human_review?.split("|");
  return (
    <Disclosure
      defaultOpen={defaultOpen}
      label={
        <span>
          In Box: folder metadata <span className="mono">keel_snapshot_id</span> ={" "}
          <span className="mono text-ink">{projection.keel_snapshot_id}</span>
        </span>
      }
      hint={
        inFlight ? (
          <span className="text-muted">· Writing {currentSnapshotId} to Box metadata…</span>
        ) : (
          <span className={failed ? "text-red-ink" : ""}>
            · write {projection.result}
            {projection.pointer_check ? ` · pointer check ${projection.pointer_check.matches ? "matches" : "does not match"}` : ""}
            {failed && stale ? ` · Keel is on ${currentSnapshotId}; consumers must not trust these fields` : ""}
          </span>
        )
      }
    >
      <div className="max-w-[440px] rounded-[10px] border border-line-strong bg-white overflow-hidden" style={{ boxShadow: "var(--shadow-card)" }}>
        <div className="flex items-center justify-between px-4 py-2.5 border-b hairline bg-[#f7f8fa]">
          <div className="flex items-center gap-2 text-[12.5px] font-semibold text-[#222]">
            <span className="inline-flex h-4 w-4 items-center justify-center rounded-[3px] bg-[#0061d5] text-[9px] font-bold text-white" aria-hidden>
              b
            </span>
            Metadata
          </div>
          <span className="text-[11.5px] text-[#6f7782]">{folderName ?? "folder"} · keelReview</span>
        </div>
        <dl className="px-4 py-3 grid gap-2 text-[12.5px]">
          <Field k="Keel snapshot id" v={projection.keel_snapshot_id} strong />
          {Object.entries(projection.statuses).map(([cid, code]) => (
            <Field key={cid} k={`Status ${cid}`} v={code} />
          ))}
          <Field
            k="Last human review"
            v={review && review.length >= 5 ? [review[0], review[2], review[3], utc(review[4])] : projection.keel_last_human_review ?? "none"}
          />
          <Field k="Keel record URL" v={projection.keel_record_url} url />
        </dl>
        <div className="px-4 py-2 border-t hairline text-[11.5px] text-[#6f7782]">
          Mock of the Box sidebar. {projection.written_at ? <>Written {utc(projection.written_at)}. </> : null}
          {projection.last_projected_snapshot ? <>Last projected snapshot {projection.last_projected_snapshot}.</> : null}
        </div>
      </div>
      <p className="mt-2 text-[12px] text-muted max-w-[60ch]">
        One folder-level instance, no per-file rollups. Before each write Keel re-reads its current snapshot pointer; consumers check{" "}
        <span className="mono">keel_snapshot_id</span> against Keel&apos;s current snapshot before trusting a status field.
      </p>
    </Disclosure>
  );
}

function Field({ k, v, strong, url }: { k: string; v: string | string[]; strong?: boolean; url?: boolean }) {
  return (
    <div className="grid grid-cols-[150px_minmax(0,1fr)] gap-3">
      <dt className="text-[#6f7782]">{k}</dt>
      <dd className={`mono text-[12px] ${url ? "[overflow-wrap:anywhere]" : ""} ${strong ? "font-semibold text-[#222]" : "text-[#222]"}`}>
        {Array.isArray(v)
          ? v.map((p, i) => (
              <span key={i}>
                {i ? " · " : ""}
                <span className="whitespace-nowrap">{p}</span>
              </span>
            ))
          : v}
      </dd>
    </div>
  );
}
