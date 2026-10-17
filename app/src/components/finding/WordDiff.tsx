import { diffStats, splitOnQuote, wordDiff } from "@/lib/ui/diff";

export function WordDiff({ before, after }: { before: string; after: string }) {
  const ops = wordDiff(before, after);
  const stats = diffStats(ops);
  return (
    <div>
      <p className="text-[14px] leading-[1.7] text-ink-2 whitespace-pre-wrap">
        {ops.map((op, i) =>
          op.type === "same" ? (
            <span key={i}>{op.text}</span>
          ) : op.type === "del" ? (
            <del key={i} className="diff-del" title="Deleted in the submitted version">
              {op.text}
            </del>
          ) : (
            <ins key={i} className="diff-ins no-underline" title="Inserted in the submitted version">
              {op.text}
            </ins>
          ),
        )}
      </p>
      <p className="mt-2 text-[11.5px] text-faint">
        Word diff of the section: <del className="diff-del">struck</del> deleted ({stats.deleted} words),{" "}
        <ins className="diff-ins">underlined</ins> inserted ({stats.inserted} words).
      </p>
    </div>
  );
}

export function QuoteInText({ text, quote }: { text?: string | null; quote?: string | null }) {
  if (!text && !quote) return <p className="text-[13px] text-faint">No text recorded.</p>;
  if (!text) return <blockquote className="text-[14px] leading-[1.7] text-ink"><mark className="quote-mark bg-transparent text-inherit">{quote}</mark></blockquote>;
  const parts = splitOnQuote(text, quote);
  if (!parts) return <p className="text-[14px] leading-[1.7] text-ink-2 whitespace-pre-wrap">{text}</p>;
  return (
    <p className="text-[14px] leading-[1.7] text-ink-2 whitespace-pre-wrap">
      {parts[0]}
      <mark className="quote-mark bg-transparent text-ink">{parts[1]}</mark>
      {parts[2]}
    </p>
  );
}
