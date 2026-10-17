import type { FindingCard } from "@/lib/types";
import { wordDiff } from "@/lib/ui/diff";

function shortSection(s?: string): string {
  if (!s) return "";
  const m = s.match(/^(§[\d.]+)/);
  return m ? m[1] : s;
}

/**
 * The before/after pair the narration opens with: the verified sentence and the sentence that
 * replaced it, large and side by side. Lost words are struck inline in the submitted sentence.
 */
export function EvidencePair({ card }: { card: FindingCard }) {
  const prior = card.prior_version;
  const next = card.new_version;
  const binding = card.finding.evidence[0] ?? null;
  // When the evidence moved to another file, the submitted side shows the new binding.
  // Moved: the submitted side is the new binding (engine new_version), or the finding's evidence as a fallback.
  const nextMoved = Boolean(next && prior && next.file.fileId !== prior.file.fileId);
  const bindingMoved = !next?.quote && Boolean(binding && prior && binding.fileId !== prior.file.fileId);
  const moved = nextMoved || bindingMoved;
  const newQuote = next?.quote ?? (bindingMoved ? binding!.quote : null);
  const newLabel = bindingMoved
    ? `${binding!.fileName} ${binding!.versionLabel ?? ""} ${shortSection(binding!.section)}`
    : next
      ? `${next.file.fileName} ${next.file.versionLabel ?? ""} ${shortSection(next.section)}`
      : "";
  const same = prior && newQuote && norm(prior.quote) === norm(newQuote);

  if (!prior && !newQuote) return null;
  return (
    <section aria-label="Reviewed and submitted sentence" className="grid gap-3 md:grid-cols-2">
      <Block
        title="Reviewed version"
        where={prior ? `${prior.file.fileName} ${prior.file.versionLabel ?? ""} ${shortSection(prior.section)}` : ""}
        sub={prior?.verified_by ? `verified by ${prior.verified_by}` : undefined}
      >
        {prior ? (
          <p className="text-[17px] leading-[1.6] text-ink">
            <mark className="quote-mark bg-transparent text-ink">{prior.quote}</mark>
          </p>
        ) : (
          <p className="text-[14px] text-muted">No prior verified sentence for this control.</p>
        )}
      </Block>
      <Block title="Submitted version" where={newLabel} sub={moved ? "the same sentence, bound to another file" : same ? "unchanged" : undefined}>
        {newQuote ? (
          prior && !same && !moved ? (
            <p className="text-[17px] leading-[1.6] text-ink">
              {wordDiff(prior.quote, newQuote).map((op, i) =>
                op.type === "same" ? (
                  <span key={i}>{op.text}</span>
                ) : op.type === "del" ? (
                  <del key={i} className="diff-del">
                    {op.text}
                  </del>
                ) : (
                  <ins key={i} className="diff-ins">
                    {op.text}
                  </ins>
                ),
              )}
            </p>
          ) : (
            <p className="text-[17px] leading-[1.6] text-ink">{newQuote}</p>
          )
        ) : (
          <p className="text-[15px] leading-[1.6] text-ink-2">
            No sentence in the submitted version supports this control.
            {prior ? (
              <>
                {" "}
                The verified sentence is gone: <del className="diff-del">{prior.quote}</del>
              </>
            ) : null}
          </p>
        )}
      </Block>
    </section>
  );
}

function norm(s: string) {
  return s.toLowerCase().replace(/\s+/g, " ").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').trim();
}

function Block({ title, where, sub, children }: { title: string; where: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[12px] border hairline bg-panel px-5 py-4 min-w-0">
      <div className="flex flex-wrap items-baseline gap-x-2 mb-2">
        <span className="text-[13px] font-semibold text-ink">{title}</span>
        {where ? <span className="mono text-[12.5px] text-muted">· {where.trim()}</span> : null}
        {sub ? <span className="text-[12px] text-faint ml-auto">{sub}</span> : null}
      </div>
      {children}
    </div>
  );
}
