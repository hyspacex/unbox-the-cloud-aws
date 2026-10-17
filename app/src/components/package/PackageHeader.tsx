import type { PackageView } from "@/lib/types";
import { utc } from "@/lib/ui/format";
import { Hash } from "@/components/ui/Mono";

export function PackageHeader({ view }: { view: Pick<PackageView, "header" | "snapshot" | "profile" | "prior_snapshot_id"> }) {
  const { header, snapshot, profile } = view;
  const d = header.arb_decision;
  return (
    <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
      <div className="min-w-0">
        <div className="eyebrow mb-2">
          ARB package in Box{header.folderName ? ` · ${header.folderName}` : ""} ·{" "}
          <span className="mono normal-case tracking-normal">folder {header.folderId}</span>
        </div>
        <h1 className="text-[30px] leading-[1.15] font-semibold tracking-[-0.025em] text-ink text-balance">{header.project}</h1>
        <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-[14px] text-ink-2">
          <Meta label="Application" value={<span className="mono">{header.application_id}</span>} />
          <Meta label="Tier" value={header.application_tier} />
          <Meta label="Regulatory scope" value={header.regulatory_scope} />
          <Meta
            label="ARB decision"
            value={
              <>
                <span className="mono">{d.id}</span> {d.outcome}, {d.date}, chair {d.chair}
              </>
            }
          />
        </dl>
      </div>
      <div className="flex items-stretch gap-0 rounded-[10px] border hairline bg-panel overflow-hidden" style={{ boxShadow: "var(--shadow-card)" }}>
        <div className="px-4 py-2.5">
          <div className="eyebrow">Current snapshot</div>
          <div className="mono text-[22px] font-semibold leading-tight text-ink">{snapshot.snapshot_id}</div>
        </div>
        <div className="px-4 py-2.5 border-l hairline text-[12.5px] text-muted leading-[1.55]">
          <div>
            Captured <span className="mono text-ink-2">{utc(snapshot.captured_at)}</span>
          </div>
          <div>
            {snapshot.files.length} files pinned · manifest <Hash value={snapshot.manifest_hash} className="text-ink-2" />
          </div>
          <div>
            Profile <span className="mono text-ink-2">{profile.profile_version}</span>
            {view.prior_snapshot_id ? (
              <>
                {" "}
                · prior <span className="mono text-ink-2">{view.prior_snapshot_id}</span>
              </>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}

function Meta({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <dt className="text-muted text-[13px]">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
