import type { FindingCard } from "@/lib/types";
import { Hash } from "@/components/ui/Mono";
import { utc } from "@/lib/ui/format";
import { QuoteInText, WordDiff } from "./WordDiff";
import { Disclosure } from "@/components/ui/Disclosure";

type Prior = NonNullable<FindingCard["prior_version"]>;
type Next = NonNullable<FindingCard["new_version"]>;

type OldLocation = NonNullable<FindingCard["old_location"]>;

export function VersionColumns({
  prior,
  next,
  oldLocation,
}: {
  prior: FindingCard["prior_version"];
  next: FindingCard["new_version"];
  oldLocation?: FindingCard["old_location"];
}) {
  const sameFile = Boolean(prior && next && prior.file.fileId === next.file.fileId);
  return (
    <section aria-label="Reviewed and submitted versions" className="grid gap-4 md:grid-cols-2 items-start">
      <Column title="Reviewed version" sub={prior ? "the evidence a person verified" : undefined}>
        {prior ? <PriorBody v={prior} /> : <p className="text-[13px] text-muted">No prior verified evidence for this control.</p>}
      </Column>
      <Column
        title={next && prior && !sameFile ? "Current binding: a different file" : "Submitted version"}
        sub={next ? (sameFile ? "the same file, new version" : prior ? "the support moved; it did not disappear" : undefined) : undefined}
      >
        {next ? (
          <NextBody v={next} prior={prior} sameFile={Boolean(sameFile)} old={oldLocation ?? null} />
        ) : (
          <p className="text-[13px] text-muted">No supporting evidence in the submitted snapshot.</p>
        )}
      </Column>
    </section>
  );
}

function Column({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[10px] border hairline bg-panel flex flex-col min-w-0">
      <div className="px-4 pt-3 pb-2 border-b hairline">
        <div className="flex items-baseline justify-between gap-2">
          <h4 className="text-[13px] font-semibold text-ink">{title}</h4>
          {sub ? <span className="text-[11.5px] text-faint">{sub}</span> : null}
        </div>
      </div>
      <div className="px-4 py-3 flex-1 flex flex-col gap-3 min-w-0">{children}</div>
    </div>
  );
}

function FileLine({ v }: { v: Prior | Next }) {
  return (
    <div className="min-w-0">
      <div className="mono text-[14px] text-ink truncate">
        {v.file.fileName} <span className="text-muted">{v.file.versionLabel ?? ""}</span>
      </div>
      <div className="mt-0.5 text-[12px] text-muted">
        Box version <span className="mono text-ink-2">{v.file.versionId}</span>
        {v.section ? <> · {v.section}</> : null}
        {v.page ? <> · p.{v.page}</> : null}
      </div>
    </div>
  );
}

function Meta({ rows }: { rows: [string, React.ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-[12.5px]">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-muted">{k}</dt>
          <dd className="text-ink-2 min-w-0 break-words">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function PriorBody({ v }: { v: Prior }) {
  return (
    <>
      <FileLine v={v} />
      <Meta
        rows={[
          [
            "Verified by",
            v.verified_by ? (
              <span>
                <span className="text-blue-ink font-medium">{v.verified_by}</span>
                {v.verified_role ? `, ${v.verified_role}` : ""}
                {v.verified_at ? (
                  <>
                    , <span className="mono">{utc(v.verified_at)}</span>
                  </>
                ) : null}
              </span>
            ) : (
              <span className="text-faint">not verified</span>
            ),
          ],
          ["Uploader", v.uploader ?? <span className="text-faint">not recorded</span>],
          ["Content hash", <Hash key="h" value={v.file.contentHash} />],
          ["Box link", v.deep_link ? <DeepLink key="l" href={v.deep_link} /> : <span className="text-faint">none</span>],
        ]}
      />
      <Disclosure label="Section text" hint="verified quote highlighted">
        <div className="rounded-md bg-paper/80 border hairline px-3 py-2.5">
          <QuoteInText text={v.text} quote={v.quote} />
        </div>
      </Disclosure>
    </>
  );
}

function NextBody({ v, prior, sameFile, old }: { v: Next; prior: FindingCard["prior_version"]; sameFile: boolean; old: OldLocation | null }) {
  return (
    <>
      <FileLine v={v} />
      <Meta
        rows={[
          ["Uploader", v.uploader ?? <span className="text-faint">not recorded</span>],
          ["Version comment", v.version_comment ? <q key="c">{v.version_comment}</q> : <span className="text-faint">none</span>],
          ["Content hash", <Hash key="h" value={v.file.contentHash} />],
          ["Box link", v.deep_link ? <DeepLink key="l" href={v.deep_link} /> : <span className="text-faint">none</span>],
        ]}
      />
      {old ? (
        <div className="rounded-md border border-dashed border-line-strong px-3 py-2 text-[12.5px] text-muted">
          {old.note}
          {prior?.text && old.text ? (
            <Disclosure className="mt-1.5" label="What happened to the old location">
              <div className="rounded-md bg-paper/80 border hairline px-3 py-2.5 text-ink-2">
                <WordDiff before={prior.text} after={old.text} />
              </div>
            </Disclosure>
          ) : null}
        </div>
      ) : null}
      {sameFile && prior?.text && v.text ? (
        <Disclosure label="Full section diff" hint="against the reviewed version">
          <div className="rounded-md bg-paper/80 border hairline px-3 py-2.5">
            <WordDiff before={prior.text} after={v.text} />
          </div>
        </Disclosure>
      ) : v.text ? (
        <Disclosure label="Section text">
          <div className="rounded-md bg-paper/80 border hairline px-3 py-2.5">
            <QuoteInText text={v.text} quote={v.quote} />
            {!sameFile && prior ? <p className="mt-2 text-[11.5px] text-faint">Different file from the reviewed version, so no word diff is shown.</p> : null}
          </div>
        </Disclosure>
      ) : null}
    </>
  );
}

function DeepLink({ href }: { href: string }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="link mono text-[12px] break-all">
      {href.replace(/^https?:\/\//, "")}
    </a>
  );
}
