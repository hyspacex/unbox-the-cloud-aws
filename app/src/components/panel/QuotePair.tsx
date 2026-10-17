"use client";

import Link from "next/link";
import type { FindingCard } from "@/lib/types";
import { wordDiff } from "@/lib/ui/diff";
import { C, shortSection } from "./parts";

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').trim();

/**
 * WAS / NOW: the sentence a person verified, pinned to its version, and the sentence that stands in the same
 * place now (or the current binding when the support moved to another file). Inserted words are underlined.
 * Every quote shown is the engine's validated quote; nothing is paraphrased here.
 */
export function QuotePair({ card }: { card: FindingCard }) {
  const prior = card.prior_version;
  const next = card.new_version;
  const binding = card.finding.evidence[0] ?? null;
  const nextMoved = Boolean(next && prior && next.file.fileId !== prior.file.fileId);
  const bindingMoved = !next?.quote && Boolean(binding && prior && binding.fileId !== prior.file.fileId);
  const moved = nextMoved || bindingMoved || card.finding.change_classification === "moved";
  const nowQuote = next?.quote ?? (bindingMoved ? binding!.quote : null);
  const nowFile = bindingMoved ? { name: binding!.fileName, v: binding!.versionLabel ?? "", s: binding!.section } : next ? { name: next.file.fileName, v: next.file.versionLabel ?? "", s: next.section } : null;
  const same = Boolean(prior && nowQuote && norm(prior.quote) === norm(nowQuote));

  if (!prior && !nowQuote) return null;

  const wasWhere = prior ? `${prior.file.versionLabel ?? ""} ${shortSection(prior.section)}`.trim() : "";
  const nowWhere = nowFile ? (moved ? `${nowFile.name} ${nowFile.v} ${shortSection(nowFile.s)}` : `${nowFile.v} ${shortSection(nowFile.s)}`).trim() : "";

  return (
    <section aria-label="Reviewed sentence and current sentence" className="space-y-3">
      <Block head="Was" where={wasWhere} title={prior ? `${prior.file.fileName} ${prior.file.versionLabel ?? ""}, ${prior.section ?? ""}` : undefined}>
        {prior ? <Quote>{prior.quote}</Quote> : <Muted>No sentence was verified for this control.</Muted>}
      </Block>
      <Block
        head={moved ? "Current binding" : "Now"}
        where={nowWhere}
        tag={same && !moved ? "unchanged" : moved && same ? "same sentence" : undefined}
        title={nowFile ? `${nowFile.name} ${nowFile.v}, ${nowFile.s ?? ""}` : undefined}
      >
        {nowQuote ? (
          prior && !same && !moved ? (
            <Quote>
              {wordDiff(prior.quote, nowQuote).map((op, i) =>
                op.type === "del" ? null : op.type === "ins" ? (
                  <span key={i} className="underline decoration-[1.5px] underline-offset-[3px]" style={{ textDecorationColor: C.amber }}>
                    {op.text}
                  </span>
                ) : (
                  <span key={i}>{op.text}</span>
                ),
              )}
            </Quote>
          ) : (
            <Quote>{nowQuote}</Quote>
          )
        ) : (
          // The engine says why there is no current sentence (quote_pair_note); the panel draws no conclusion.
          card.quote_pair_note ? <Muted>{card.quote_pair_note}</Muted> : null
        )}
      </Block>
    </section>
  );
}

function Block({ head, where, tag, title, children }: { head: string; where: string; tag?: string; title?: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="mb-1 flex items-baseline gap-1.5 text-[11px] font-bold uppercase tracking-[0.08em]" style={{ color: C.secondary }} title={title}>
        <span>{head}</span>
        {where ? <span className="normal-case tracking-normal font-normal text-[12px]">· {where}</span> : null}
        {tag ? <span className="ml-auto normal-case tracking-normal font-normal text-[11.5px]">{tag}</span> : null}
      </div>
      <div className="border-l-[3px] pl-3" style={{ borderColor: C.border }}>
        {children}
      </div>
    </div>
  );
}

function Quote({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[14px] leading-[1.5] line-clamp-6" style={{ color: C.text }}>
      {children}
    </p>
  );
}

function Muted({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[13px] leading-[1.5]" style={{ color: C.secondary }}>
      {children}
    </p>
  );
}

/**
 * v4.1 hero blocks (design 51 decision 5). AGREED is the verified commitment with the engine's byline. CHANGED
 * carries the engine's heading ("Changed in architecture.md v3 §4.3", "Now in runbook.md v2 §3", "Section changed
 * around it · v3 §4.2") and the new sentence, with inserted words underlined when it replaced the agreed one. "Open
 * in document" goes to lane A's Box preview with the sentence highlighted. CHANGED is omitted when the engine sends
 * null (a hold, or while pending).
 */
export function AgreedChanged({ card, controlId }: { card: FindingCard; controlId: string }) {
  const a = card.agreed ?? null;
  const ch = card.changed ?? null;
  const od = card.open_in_document;
  const href = od
    ? `/files/${encodeURIComponent(od.file_id)}?v=${encodeURIComponent(od.version_id)}${od.sentence ? `&q=${encodeURIComponent(od.sentence)}` : ""}&c=${encodeURIComponent(controlId)}`
    : null;
  const replaced = Boolean(a && ch?.quote && ch.kind === "replaced" && norm(a.quote) !== norm(ch.quote));
  return (
    <section aria-label="What was agreed and what changed" className="space-y-3">
      {a ? (
        <div className="min-w-0">
          <Head>Agreed</Head>
          <div className="border-l-[3px] pl-3" style={{ borderColor: C.blue }}>
            <Quote>{a.quote}</Quote>
          </div>
          <p className="mt-1 text-[12px]" style={{ color: C.secondary }}>
            {a.byline}
          </p>
        </div>
      ) : null}
      {ch ? (
        <div className="min-w-0">
          {/* The engine's heading carries a file name: keep its case. */}
          <div className="mb-1 text-[12.5px] font-bold" style={{ color: C.text }}>
            {ch.heading}
          </div>
          <div className="border-l-[3px] pl-3" style={{ borderColor: C.amber }}>
            {ch.quote ? (
              <Quote>
                {replaced
                  ? wordDiff(a!.quote, ch.quote).map((op, i) =>
                      op.type === "del" ? null : op.type === "ins" ? (
                        <span key={i} className="underline decoration-[1.5px] underline-offset-[3px]" style={{ textDecorationColor: C.amber }}>
                          {op.text}
                        </span>
                      ) : (
                        <span key={i}>{op.text}</span>
                      ),
                    )
                  : ch.quote}
              </Quote>
            ) : card.quote_pair_note ? (
              <Muted>{card.quote_pair_note}</Muted>
            ) : null}
          </div>
          {href ? (
            <Link href={href} className="mt-1 inline-flex items-center gap-1 text-[12.5px] font-bold hover:underline" style={{ color: C.boxBlue }}>
              Open in document <span aria-hidden>↗</span>
            </Link>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function Head({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-1 text-[11px] font-bold uppercase tracking-[0.08em]" style={{ color: C.secondary }}>
      {children}
    </div>
  );
}
