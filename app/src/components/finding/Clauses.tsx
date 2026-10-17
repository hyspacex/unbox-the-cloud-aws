import type { ClauseSupport, Control } from "@/lib/types";
import { Disclosure } from "@/components/ui/Disclosure";

function Mark({ supported }: { supported: boolean }) {
  return supported ? (
    <span className="mt-[2px] inline-flex h-[18px] w-[18px] flex-none items-center justify-center rounded-full bg-[var(--grey-ink)] text-white" aria-label="supported">
      <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
        <path d="M2 5.2 4.1 7.3 8 2.8" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  ) : (
    <span className="mt-[2px] inline-flex h-[18px] w-[18px] flex-none items-center justify-center rounded-full border-[1.5px] border-[var(--amber-dot)] text-[var(--amber-ink)]" aria-label="unsupported">
      <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden>
        <path d="M1.5 4h5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    </span>
  );
}

export function ClauseChecklist({ clauses }: { clauses: ClauseSupport[] }) {
  const supported = clauses.filter((c) => c.support === "supported").length;
  return (
    <div>
      <div className="flex items-baseline justify-between mb-2">
        <h4 className="text-[13px] font-semibold text-ink">Required clauses</h4>
        <span className="text-[12.5px] text-muted tabular-nums">
          {supported} of {clauses.length} supported by a validated quote
        </span>
      </div>
      <ul className="divide-y divide-[var(--line)] rounded-lg border hairline bg-panel">
        {clauses.map((c) => (
          <li key={c.clause_id} className="flex gap-3 px-3.5 py-2.5">
            <Mark supported={c.support === "supported"} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className={`text-[14px] ${c.support === "supported" ? "text-ink" : "text-ink font-medium"}`}>{c.clause}</span>
                <span className="mono text-[11.5px] text-faint">{c.clause_id}</span>
              </div>
              {c.support === "supported" && c.quote ? (
                <div className="mt-1">
                  <q className="text-[13px] leading-[1.55] text-ink-2 italic">{c.quote.quote}</q>
                  <div className="mt-0.5 text-[11.5px] text-muted">
                    <span className="mono">
                      {c.quote.fileName} {c.quote.versionLabel ?? c.quote.versionId}
                    </span>{" "}
                    · {c.quote.section}
                    {c.quote.paragraph ? ` ¶${c.quote.paragraph}` : ""}
                    {c.quote.page ? ` · p.${c.quote.page}` : ""}
                  </div>
                </div>
              ) : (
                <div className="mt-0.5 text-[12.5px] text-amber-ink">Unsupported: no validated quote in any file of this snapshot.</div>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ControlBlock({
  control,
  clauses,
  profileVersion,
}: {
  control: Control;
  clauses: ClauseSupport[];
  profileVersion: string;
}) {
  const fm = Object.entries(control.framework_map).filter(([k]) => k !== "status");
  return (
    <section aria-label="Control">
      <div className="eyebrow mb-1.5">Control</div>
      <h3 className="text-[17px] font-semibold text-ink tracking-[-0.01em]">
        <span className="mono font-medium">{control.id}</span> {control.title}
      </h3>
      <p className="mt-2 text-[14px] leading-[1.6] text-ink-2 max-w-[68ch]">
        <span className="text-muted">Requirement. </span>
        {control.requirement}
      </p>
      <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[12.5px] text-muted">
        <span>
          Standard <span className="text-ink-2">{control.standard}</span>
        </span>
        <span>
          Tier <span className="text-ink-2">{control.tier}</span>
        </span>
        <span>
          Profile <span className="mono text-ink-2">{profileVersion}</span>
        </span>
      </div>
      <div className="mt-4">
        <ClauseChecklist clauses={clauses} />
      </div>
      <Disclosure className="mt-3" label="Applicability, evidence locations and framework map" hint="(framework map illustrative)">
        <dl className="grid gap-3 text-[13px] text-ink-2">
          <div>
            <dt className="eyebrow">Applicability</dt>
            <dd className="mt-0.5">{control.applicability}</dd>
          </div>
          <div>
            <dt className="eyebrow">Evidence locations</dt>
            <dd className="mt-0.5">{control.evidence.join("; ")}</dd>
          </div>
          <div>
            <dt className="eyebrow">Framework map, illustrative</dt>
            <dd className="mt-1">
              <p className="text-[12px] text-muted mb-1.5">{control.framework_map.status}</p>
              <ul className="grid sm:grid-cols-2 gap-x-6 gap-y-0.5">
                {fm.map(([k, v]) => (
                  <li key={k} className="flex gap-2">
                    <span className="mono text-[12px] text-muted min-w-[11ch]">{k}</span>
                    <span className="mono text-[12px]">{Array.isArray(v) ? v.join(", ") : v}</span>
                  </li>
                ))}
              </ul>
            </dd>
          </div>
          <div>
            <dt className="eyebrow">Reviewer role</dt>
            <dd className="mt-0.5">{control.reviewer_role}</dd>
          </div>
        </dl>
      </Disclosure>
    </section>
  );
}
