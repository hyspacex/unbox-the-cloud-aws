import type { FindingCard } from "@/lib/types";
import { Hash } from "@/components/ui/Mono";
import { utc } from "@/lib/ui/format";
import { QuoteInText, WordDiff } from "./WordDiff";

type Prior = NonNullable<FindingCard["prior_version"]>;
type Next = NonNullable<FindingCard["new_version"]>;

export function VersionColumns({ prior, next }: { prior: FindingCard["prior_version"]; next: FindingCard["new_version"] }) {
  const sameFile = prior && next && prior.file.fileId === next.file.fileId;
  return (
    <section aria-label="Reviewed and submitted versions" className="grid gap-4 md:grid-cols-2">
      <Column title="Reviewed version" sub={prior ? "the evidence a person verified" : undefined}>
        {prior ? <PriorBody v={prior} /> : <p className="text-[13px] text-muted">No prior verified evidence for this control.</p>}
      </Column>
      <Column title="Submitted version" sub={next ? (sameFile ? "the same file, new version" : "evidence now bound elsewhere") : undefined}>
        {next ? (
          <NextBody v={next} prior={prior} sameFile={Boolean(sameFile)} />
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
      <div className="rounded-md bg-paper/80 border hairline px-3 py-2.5">
        <div className="eyebrow mb-1">Verified quote, in its section</div>
        <QuoteInText text={v.text} quote={v.quote} />
      </div>
    </>
  );
}

function NextBody({ v, prior, sameFile }: { v: Next; prior: FindingCard["prior_version"]; sameFile: boolean }) {
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
      <div className="rounded-md bg-paper/80 border hairline px-3 py-2.5">
        {sameFile && prior?.text && v.text ? (
          <>
            <div className="eyebrow mb-1">Section text, word diff against the reviewed version</div>
            <WordDiff before={prior.text} after={v.text} />
          </>
        ) : (
          <>
            <div className="eyebrow mb-1">{v.quote ? "Supporting quote, in its section" : "Section text"}</div>
            <QuoteInText text={v.text} quote={v.quote} />
            {!sameFile && prior ? (
              <p className="mt-2 text-[11.5px] text-faint">
                Different file from the reviewed version, so no word diff is shown.
              </p>
            ) : null}
          </>
        )}
      </div>
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
