import type { Finding, TraceStep } from "@/lib/types";
import { Disclosure } from "@/components/ui/Disclosure";
import { Hash } from "@/components/ui/Mono";
import { SourceTag } from "@/components/ui/SourceTag";
import { ms } from "@/lib/ui/format";

export function MachineBlock({ finding, traceSteps }: { finding: Finding; traceSteps?: TraceStep[] }) {
  return (
    <section aria-label="Machine assessment" className="rounded-[10px] border border-grey-line bg-grey-bg/55">
      <div className="px-4 pt-3 pb-3 border-b border-grey-line">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h4 className="text-[13px] font-semibold text-grey-ink">Machine assessment, not a verdict</h4>
          <span className="text-[11.5px] text-muted">proposed by the agent; code applied the assessment rule</span>
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          <Pill k="Result" v={finding.machine_assessment} />
          <Pill k="Classification" v={finding.change_classification} />
          <Pill k="Holds" v={String(finding.verification_holds)} />
          {finding.acknowledgment_required ? <Pill k="Acknowledgment" v={finding.acknowledgment_reason ?? "required"} /> : null}
          {finding.not_evaluated_reason ? <Pill k="Not evaluated" v={`${finding.not_evaluated_reason.code}: ${finding.not_evaluated_reason.message}`} /> : null}
        </div>
      </div>
      <div className="px-4 py-3">
        <div className="eyebrow !text-grey-ink mb-1.5">Basis, from recorded operations</div>
        <ul className="space-y-1.5 text-[13.5px] leading-[1.55] text-ink-2">
          {finding.basis.map((b, i) => (
            <li key={i} className="flex gap-2.5">
              <span className="mt-[9px] h-[3px] w-[3px] rounded-full bg-[var(--grey-dot)] flex-none" aria-hidden />
              <span>{b}</span>
            </li>
          ))}
        </ul>
        <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-[12px] text-muted sm:grid-cols-3">
          <Kv k="Model" v={<span className="mono">{finding.model_id}</span>} />
          <Kv k="Inference profile" v={<span className="mono">{finding.inference_profile}</span>} />
          <Kv k="MRM model id" v={<span className="mono">{finding.mrm_model_id}</span>} />
          <Kv k="Prompt" v={<span className="mono">{finding.prompt_version}</span>} />
          <Kv k="Prompt hash" v={<Hash value={finding.prompt_hash} />} />
          <Kv k="Normalization" v={finding.normalization} />
        </dl>
        {traceSteps && traceSteps.length ? (
          <Disclosure className="mt-3" label="Trace" hint={`${traceSteps.length} recorded operations for this control`}>
            <ol className="space-y-1.5">
              {traceSteps.map((s, i) => (
                <li key={i} className="rounded-md bg-panel border hairline px-3 py-2 text-[12.5px]">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-ink">{s.label}</span>
                    <span className="mono text-faint whitespace-nowrap">{s.durationMs != null ? ms(s.durationMs) : ""}</span>
                  </div>
                  <div className="mt-0.5 flex flex-wrap gap-x-3 text-[11.5px] text-faint">
                    <SourceTag source={s.tool === "box_ai_ask" ? "boxai" : s.source} />
                    {s.tool ? <span className="mono">{s.tool}</span> : null}
                    {s.args && "query" in s.args ? <span className="mono">query &apos;{String(s.args.query)}&apos;</span> : null}
                  </div>
                </li>
              ))}
            </ol>
          </Disclosure>
        ) : null}
      </div>
    </section>
  );
}

function Pill({ k, v }: { k: string; v: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 h-[24px] rounded-md border border-grey-line bg-panel px-2 text-[12px]">
      <span className="text-muted">{k}</span>
      <span className="mono text-grey-ink">{v}</span>
    </span>
  );
}

function Kv({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="inline">{k} </dt>
      <dd className="inline text-ink-2 break-words">{v}</dd>
    </div>
  );
}
