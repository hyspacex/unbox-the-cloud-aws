/**
 * The published status rules, verbatim from spec v3.4 section 4 (docs/research/30-design-v3.md).
 * The engine (app/src/lib/engine/display.ts) is the only place status is decided; this page publishes the rules.
 */

import { ASSESSMENT_PRECEDENCE_TEXT, RULES, STORED_FIELDS } from "@/lib/engine/display";
import { toneClass } from "@/lib/ui/tone";

const MATERIALITY: [string, string][] = [
  ["Critical", "Acknowledge when the evidencing file changed, even if the quote is unchanged."],
  ["High", "Acknowledge when the evidencing section's text changed, even if the quote is unchanged."],
  ["Medium", "Holds when the quote is unchanged."],
];

const ENFORCED = [
  "Only the human response handler writes a disposition, after checking: the responding identity is on the configured reviewer list, is not the configured author of the evidencing file, and the control's binding is current.",
  "Verified additionally requires every required clause supported by a validated quote in the current snapshot, the machine assessment not evidence_contradicted, and the reviewer's explicit attestation in the task message.",
  "A result for an older snapshot is recorded as history and never changes displayed status.",
  "A response whose binding is no longer current is recorded; re-applied if the binding is unchanged, rejected with explanation otherwise.",
];

/** Turn the engine's terse writer notes into a sentence (C5). */
function writerText(w: string): string {
  if (/model proposes,\s*code validates/i.test(w)) return "Proposed by the model, validated by code.";
  const t = w.replace(/^the /i, "");
  return `Written by ${t}${/[.]$/.test(t) ? "" : "."}`;
}

export function RulesPage() {
  return (
    <div className="mx-auto max-w-[1100px] px-6 lg:px-10 pt-8 pb-16">
      <div className="eyebrow mb-2">Status rules, published</div>
      <h1 className="text-[28px] font-semibold tracking-[-0.025em] text-ink">Sixteen ordered rules decide every row</h1>
      <p className="mt-2 text-[14.5px] text-ink-2 max-w-[72ch]">
        The first rule that matches wins. Current disposition and prior verification are separate inputs: a prior verification is
        shown on the secondary line and is never installed as the current disposition. Code applies these rules; the model does not.
      </p>

      <ol className="mt-6 panel divide-y divide-[var(--line)]">
        {RULES.map((r) => (
          <li key={r.rule} id={`rule-${r.rule}`} className="scroll-mt-24 target:bg-amber-bg/60 transition-colors grid grid-cols-[40px_minmax(0,1fr)] md:grid-cols-[40px_minmax(0,1fr)_minmax(0,1.1fr)] gap-x-4 gap-y-1 px-5 py-3 items-start">
            <span className="mono text-[13px] text-faint pt-0.5 tabular-nums">{String(r.rule).padStart(2, "0")}</span>
            <span className="text-[14px] text-ink-2">
              {r.condition}
              {!r.built ? <span className="ml-2 text-[11.5px] text-faint">{r.note ?? "proposed"}</span> : null}
            </span>
            <span className="col-start-2 md:col-start-auto min-w-0">
              <span className={`chip ${toneClass({ tone: r.tone })}`}>
                <span className="chip-dot" aria-hidden />
                {r.label}
              </span>
            </span>
          </li>
        ))}
      </ol>

      <div className="mt-10 grid gap-8 md:grid-cols-2">
        <section>
          <h2 className="text-[16px] font-semibold text-ink">Assessment precedence</h2>
          <p className="mt-2 text-[14px] text-ink-2">Inside the machine field, applied by code, not the model:</p>
          <p className="mt-2 mono text-[13px] text-ink leading-[1.8]">
            {ASSESSMENT_PRECEDENCE_TEXT}
          </p>
          <p className="mt-3 text-[13.5px] text-ink-2">
            All required clauses supported gives evidence_found; some gives evidence_weakened; none gives evidence_absent. Encryption
            stated without a key model is weakened, not absent.
          </p>
        </section>
        <section>
          <h2 className="text-[16px] font-semibold text-ink">Staleness and materiality, per tier</h2>
          <p className="mt-2 text-[14px] text-ink-2">
            Staleness is keyed to the evidence binding and the classification, not to the snapshot. A holding verification writes a{" "}
            <span className="mono text-[13px]">verification_holds</span> event.
          </p>
          <dl className="mt-3 rounded-lg border hairline bg-panel divide-y divide-[var(--line)]">
            {MATERIALITY.map(([t, d]) => (
              <div key={t} className="grid grid-cols-[90px_minmax(0,1fr)] gap-3 px-4 py-2.5 text-[13.5px]">
                <dt className="font-medium text-ink">{t}</dt>
                <dd className="text-ink-2">{d}</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>

      <section className="mt-10">
        <h2 className="text-[16px] font-semibold text-ink">Stored fields</h2>
        <dl className="mt-3 rounded-lg border hairline bg-panel divide-y divide-[var(--line)]">
          {STORED_FIELDS.map((f) => (
            <div key={f.field} className="grid md:grid-cols-[200px_minmax(0,1fr)] gap-x-4 gap-y-0.5 px-4 py-2.5 text-[13.5px]">
              <dt className="font-medium text-ink">{f.field}</dt>
              <dd className="text-ink-2">
                <span className="text-muted">{f.scope}. </span>
                <span className="mono text-[12.5px]">{f.values.join(" · ")}</span>
                <span className="block text-[12px] text-muted mt-0.5">{writerText(f.writer)}</span>
              </dd>
            </div>
          ))}
          <div className="grid md:grid-cols-[200px_minmax(0,1fr)] gap-x-4 gap-y-0.5 px-4 py-2.5 text-[13.5px]">
            <dt className="font-medium text-ink">Machine events</dt>
            <dd className="text-ink-2">
              Never carry a human disposition. They record current_disposition (default unreviewed) and a prior_verification block. The
              word verified appears on a machine event only inside prior_verification.
            </dd>
          </div>
        </dl>
      </section>

      <section className="mt-10">
        <h2 className="text-[16px] font-semibold text-ink">Rules enforced by code</h2>
        <ul className="mt-3 space-y-2 text-[14px] text-ink-2 max-w-[80ch]">
          {ENFORCED.map((t) => (
            <li key={t} className="flex gap-3">
              <span className="mt-[9px] h-1 w-1 rounded-full bg-[var(--ink-2)] flex-none" />
              {t}
            </li>
          ))}
        </ul>
      </section>
      <p className="mt-10 text-[12px] text-muted">
        Rendered from the engine&apos;s published rule table in <span className="mono">app/src/lib/engine/display.ts</span>, the
        same module that computes every row. Spec: v3.4 section 4, <span className="mono">docs/research/30-design-v3.md</span>.
      </p>
    </div>
  );
}
