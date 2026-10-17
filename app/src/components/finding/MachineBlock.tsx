import type { Finding, TraceStep } from "@/lib/types";
import { Disclosure } from "@/components/ui/Disclosure";
import { Hash } from "@/components/ui/Mono";
import { SourceTag } from "@/components/ui/SourceTag";
import { ms } from "@/lib/ui/format";

const ASSESSMENT_WORDS: Record<string, string> = {
  evidence_found: "Every required clause has a supporting quote",
  evidence_weakened: "Some required clauses have a supporting quote, some do not",
  evidence_absent: "No required clause has a supporting quote",
  evidence_contradicted: "A supporting quote is contradicted elsewhere in the snapshot",
  not_evaluated: "Not evaluated",
};
const CLASS_WORDS: Record<string, string> = {
  unchanged: "Evidence unchanged since the verified version",
  moved: "The evidence binding moved; the support did not",
  weakened: "The verified evidence was weakened",
  removed: "The verified evidence was removed",
  contradicted: "The verified evidence is now contradicted",
  none: "No prior evidence to compare with",
};

type BoxAiAsk = { query: string; question: string; files: number; cited: number };

/** "a OR b OR c" -> "Is there a statement about a, b or c in these files?" */
function asQuestion(query: string): string {
  const terms = query.split(/\s+OR\s+/i).map((t) => t.trim()).filter(Boolean);
  const list = terms.length > 1 ? `${terms.slice(0, -1).join(", ")} or ${terms[terms.length - 1]}` : terms[0] ?? query;
  return `Is there a statement about ${list} in these files?`;
}

/** The Box AI ask recorded for this control: from its trace step, else from the recorded basis bullet. */
function boxAiAsk(finding: Finding, steps?: TraceStep[]): BoxAiAsk | null {
  const step = steps?.find((s) => s.tool === "box_ai_ask" || /^Box AI ask/.test(s.label));
  if (step) {
    const args = (step.args ?? {}) as { query?: string; question?: string };
    const res = (step.result ?? {}) as { files_asked?: string[]; cited_statements?: number };
    const query = args.query ?? (step as { query?: string }).query;
    if (query) {
      return {
        query,
        question: args.question ?? asQuestion(query),
        files: res.files_asked?.length ?? Number(step.label.match(/over (\d+) files?/)?.[1] ?? 0),
        cited: res.cited_statements ?? Number(step.label.match(/(\d+) cited/)?.[1] ?? 0),
      };
    }
  }
  for (const b of finding.basis) {
    const m = b.match(/Box AI ask over (\d+) (?:other )?files?, query '([^']+)': (\d+) cited statement/i);
    if (m) return { query: m[2], question: asQuestion(m[2]), files: Number(m[1]), cited: Number(m[3]) };
  }
  return null;
}

export function MachineBlock({ finding, traceSteps }: { finding: Finding; traceSteps?: TraceStep[] }) {
  const ask = boxAiAsk(finding, traceSteps);
  return (
    <section aria-label="Machine assessment" className="rounded-[10px] border border-grey-line bg-grey-bg/55">
      <div className="px-4 pt-3 pb-3 border-b border-grey-line">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h4 className="text-[13px] font-semibold text-grey-ink">Machine assessment, not a verdict</h4>
          <span className="text-[11.5px] text-muted">proposed by the agent; code applied the assessment rule</span>
        </div>
        {ask ? (
          <div className="mt-2.5 rounded-lg border bg-panel px-3 py-2.5" style={{ borderColor: "color-mix(in srgb, var(--src-boxai) 30%, transparent)" }}>
            <div className="flex flex-wrap items-center gap-2">
              <span
                className="inline-flex h-6 items-center gap-1.5 rounded-md px-2 text-[12px] font-medium text-white"
                style={{ background: "var(--src-boxai)" }}
              >
                Box AI · {ask.cited} cited {ask.cited === 1 ? "statement" : "statements"} across {ask.files} files
              </span>
            </div>
            <p className="mt-1.5 text-[14px] text-ink">{ask.question}</p>
            <p className="mt-1 text-[11.5px] text-muted">
              Recorded query <span className="mono text-ink-2">{ask.query}</span> · citations validated against pinned text by code
            </p>
          </div>
        ) : null}
        <dl className="mt-2.5 grid gap-1.5 text-[13.5px] text-ink-2">
          <Plain k="Result" words={ASSESSMENT_WORDS[finding.machine_assessment] ?? finding.machine_assessment} code={finding.machine_assessment} />
          <Plain k="Change" words={CLASS_WORDS[finding.change_classification] ?? finding.change_classification} code={finding.change_classification} />
          <Plain
            k="Prior verification"
            words={finding.verification_holds ? "Holds" : finding.acknowledgment_required ? `Needs an acknowledgment: ${finding.acknowledgment_reason ?? "materiality"}` : "Does not hold"}
            code={`verification_holds=${finding.verification_holds}`}
          />
          {finding.not_evaluated_reason ? (
            <Plain k="Not evaluated" words={finding.not_evaluated_reason.message} code={finding.not_evaluated_reason.code} />
          ) : null}
        </dl>
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

function Plain({ k, words, code }: { k: string; words: string; code: string }) {
  return (
    <div className="grid grid-cols-[130px_minmax(0,1fr)] gap-3">
      <dt className="text-muted text-[12.5px] pt-px">{k}</dt>
      <dd>
        {words} <span className="mono text-[11px] text-faint ml-1">{code}</span>
      </dd>
    </div>
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
