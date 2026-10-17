"use client";

/**
 * A small markdown renderer for the Box preview (headings, paragraphs, lists, tables, quotes, code; bold, italic, code
 * spans, links as text) with one highlighted sentence. The match is found on each block's plain text with the engine's
 * normalisation (lib/engine/normalize.ts `norm`: backticks, quotes, hyphens, whitespace, case), so the sentence the engine
 * quoted is the sentence that lights up. Highlighting happens while rendering; React owns every node.
 */
import { forwardRef } from "react";
import { norm } from "@/lib/engine/normalize";

type Seg = { text: string; b?: boolean; i?: boolean; code?: boolean };
type Inline = Seg[];
type Block =
  | { kind: "h"; level: number; inline: Inline }
  | { kind: "p"; inline: Inline }
  | { kind: "ul" | "ol"; items: Inline[] }
  | { kind: "table"; head: Inline[]; rows: Inline[][] }
  | { kind: "quote"; inline: Inline }
  | { kind: "code"; text: string }
  | { kind: "hr" };

/** Inline markdown to segments. Links keep their text; images are dropped. */
function parseInline(src: string): Inline {
  const out: Seg[] = [];
  const re = /(\*\*([^*]+)\*\*|__([^_]+)__|`([^`]+)`|\*([^*\s][^*]*)\*|_([^_\s][^_]*)_|!\[[^\]]*\]\([^)]*\)|\[([^\]]+)\]\([^)]*\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    if (m.index > last) out.push({ text: src.slice(last, m.index) });
    if (m[2] ?? m[3]) out.push({ text: (m[2] ?? m[3])!, b: true });
    else if (m[4]) out.push({ text: m[4], code: true });
    else if (m[5] ?? m[6]) out.push({ text: (m[5] ?? m[6])!, i: true });
    else if (m[7]) out.push({ text: m[7] });
    last = m.index + m[0].length;
  }
  if (last < src.length) out.push({ text: src.slice(last) });
  return out;
}

const cells = (line: string) =>
  line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => parseInline(c.trim()));

export function parseMarkdown(text: string): Block[] {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;
  const isListLine = (l: string) => /^\s*([-*+]|\d+[.)])\s+/.test(l);
  while (i < lines.length) {
    const l = lines[i];
    if (!l.trim()) {
      i++;
      continue;
    }
    const h = /^(#{1,6})\s+(.*)$/.exec(l);
    if (h) {
      blocks.push({ kind: "h", level: h[1].length, inline: parseInline(h[2].trim()) });
      i++;
      continue;
    }
    if (/^```/.test(l)) {
      const buf: string[] = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]);
      i++;
      blocks.push({ kind: "code", text: buf.join("\n") });
      continue;
    }
    if (/^\s*\|/.test(l)) {
      const rowsRaw: string[] = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])) rowsRaw.push(lines[i++]);
      const sepAt = rowsRaw.findIndex((r) => /^\s*\|?\s*:?-{3,}/.test(r));
      const head = sepAt === 1 ? cells(rowsRaw[0]) : [];
      const body = rowsRaw.filter((_, k) => k !== sepAt && !(sepAt === 1 && k === 0)).map(cells);
      blocks.push({ kind: "table", head, rows: body });
      continue;
    }
    if (/^(-{3,}|\*{3,})\s*$/.test(l)) {
      blocks.push({ kind: "hr" });
      i++;
      continue;
    }
    if (/^>\s?/.test(l)) {
      const buf: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) buf.push(lines[i++].replace(/^>\s?/, ""));
      blocks.push({ kind: "quote", inline: parseInline(buf.join(" ")) });
      continue;
    }
    if (isListLine(l)) {
      const ordered = /^\s*\d+[.)]\s+/.test(l);
      const items: string[] = [];
      while (i < lines.length && lines[i].trim() && (isListLine(lines[i]) || /^\s{2,}\S/.test(lines[i]))) {
        if (isListLine(lines[i])) items.push(lines[i].replace(/^\s*([-*+]|\d+[.)])\s+/, ""));
        else items[items.length - 1] += " " + lines[i].trim();
        i++;
      }
      blocks.push({ kind: ordered ? "ol" : "ul", items: items.map(parseInline) });
      continue;
    }
    const buf: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,6}\s|```|\s*\||>)/.test(lines[i]) && !isListLine(lines[i])) buf.push(lines[i++].trim());
    blocks.push({ kind: "p", inline: parseInline(buf.join(" ")) });
  }
  return blocks;
}

/** `norm` with an index map back to the plain text, so a normalised match can be cut out of the original. */
function normWithMap(plain: string): { s: string; map: number[] } {
  let s = "";
  const map: number[] = [];
  let pendingSpace = false;
  for (let k = 0; k < plain.length; k++) {
    let ch = plain[k];
    if (ch === "`") continue;
    if (/\s/.test(ch)) {
      if (s.length) pendingSpace = true;
      continue;
    }
    if (pendingSpace) {
      s += " ";
      map.push(k);
      pendingSpace = false;
    }
    if (ch === "‘" || ch === "’") ch = "'";
    else if (ch === "“" || ch === "”") ch = '"';
    else if (/[‐‑–—]/.test(ch)) ch = "-";
    const lower = ch.toLowerCase();
    for (const c of lower) {
      s += c;
      map.push(k);
    }
  }
  return { s, map };
}

/** The query as the engine normalises it; markdown emphasis markers the renderer drops are dropped here too. */
export function normQuery(q: string): string {
  return norm(q.replace(/\*\*|__/g, ""));
}

const plainOf = (inline: Inline) => inline.map((x) => x.text).join("");

/** [start, end) in an inline's plain text where the query matches, or null. */
function matchIn(inline: Inline, nq: string): [number, number] | null {
  if (!nq) return null;
  const { s, map } = normWithMap(plainOf(inline));
  const at = s.indexOf(nq);
  if (at < 0) return null;
  return [map[at], map[at + nq.length - 1] + 1];
}

/** Every inline unit in document order, so the first match is chosen once. */
function inlineUnits(blocks: Block[]): Inline[] {
  const out: Inline[] = [];
  for (const b of blocks) {
    if (b.kind === "h" || b.kind === "p" || b.kind === "quote") out.push(b.inline);
    else if (b.kind === "ul" || b.kind === "ol") out.push(...b.items);
    else if (b.kind === "table") {
      out.push(...b.head);
      b.rows.forEach((r) => out.push(...r));
    }
  }
  return out;
}

export function findHighlight(blocks: Block[], q: string | null): { unit: Inline; range: [number, number] } | null {
  const nq = q ? normQuery(q) : "";
  if (!nq) return null;
  for (const unit of inlineUnits(blocks)) {
    const range = matchIn(unit, nq);
    if (range) return { unit, range };
  }
  return null;
}

const segClass = (x: Seg) => (x.code ? "rounded bg-[#F2F2F2] px-1 font-mono text-[0.92em]" : "") + (x.b ? " font-bold" : "") + (x.i ? " italic" : "");

type HL = { unit: Inline; range: [number, number] } | null;

/** Render an inline unit; the highlighted range is cut across segments into <mark> pieces (the first carries the ref). */
function InlineView({ inline, hl, markRef }: { inline: Inline; hl: HL; markRef: React.Ref<HTMLElement> }) {
  if (!hl || hl.unit !== inline) {
    return (
      <>
        {inline.map((x, k) =>
          x.code ? (
            <code key={k} className={segClass(x)}>
              {x.text}
            </code>
          ) : (
            <span key={k} className={segClass(x) || undefined}>
              {x.text}
            </span>
          ),
        )}
      </>
    );
  }
  const pieces = cutPieces(inline, hl.range);
  return (
    <>
      {pieces.map(({ x, before, mid, after, isFirst }, k) => {
        const Tag = x.code ? "code" : "span";
        return (
          <Tag key={k} className={segClass(x) || undefined}>
            {before}
            {mid ? (
              <mark
                ref={isFirst ? markRef : undefined}
                data-testid={isFirst ? "preview-highlight" : "preview-highlight-part"}
                className="rounded-[2px] bg-[#FDE7B0] px-0.5 text-inherit shadow-[0_0_0_2px_#FDE7B0] [box-decoration-break:clone]"
              >
                {mid}
              </mark>
            ) : null}
            {after}
          </Tag>
        );
      })}
    </>
  );
}

/** Split each segment at the highlight range [a, z) of the inline's plain text. */
function cutPieces(inline: Inline, [a, z]: [number, number]) {
  const out: { x: Seg; before: string; mid: string; after: string; isFirst: boolean }[] = [];
  let pos = 0;
  let seenMark = false;
  for (const x of inline) {
    const s0 = pos;
    const s1 = pos + x.text.length;
    pos = s1;
    const i0 = Math.max(0, a - s0);
    const i1 = Math.max(0, Math.min(z, s1) - s0);
    const mid = x.text.slice(i0, Math.max(i0, i1));
    out.push({ x, before: x.text.slice(0, i0), mid, after: x.text.slice(Math.max(i0, i1)), isFirst: mid.length > 0 && !seenMark });
    if (mid.length > 0) seenMark = true;
  }
  return out;
}

/** The document column. `markRef` receives the first highlighted piece. */
export const MarkdownDoc = forwardRef<HTMLElement, { blocks: Block[]; hl: HL }>(function MarkdownDoc({ blocks, hl }, markRef) {
  return (
    <div className="box-doc text-[15px] leading-[1.65] text-[#222222]">
      {blocks.map((b, k) => {
        switch (b.kind) {
          case "h": {
            const size = b.level === 1 ? "text-[26px] mt-2 mb-5" : b.level === 2 ? "text-[20px] mt-9 mb-3" : "text-[16px] mt-6 mb-2";
            const H = (`h${Math.min(b.level, 6)}` as "h1");
            return (
              <H key={k} className={`font-bold leading-snug ${size}`}>
                <InlineView inline={b.inline} hl={hl} markRef={markRef} />
              </H>
            );
          }
          case "p":
            return (
              <p key={k} className="my-3">
                <InlineView inline={b.inline} hl={hl} markRef={markRef} />
              </p>
            );
          case "quote":
            return (
              <blockquote key={k} className="my-3 border-l-[3px] border-[#D3D3D3] pl-4 text-[#4E4E4E]">
                <InlineView inline={b.inline} hl={hl} markRef={markRef} />
              </blockquote>
            );
          case "ul":
          case "ol": {
            const L = b.kind;
            return (
              <L key={k} className={`my-3 pl-6 ${b.kind === "ul" ? "list-disc" : "list-decimal"}`}>
                {b.items.map((it, j) => (
                  <li key={j} className="my-1">
                    <InlineView inline={it} hl={hl} markRef={markRef} />
                  </li>
                ))}
              </L>
            );
          }
          case "table":
            return (
              <div key={k} className="my-4 overflow-x-auto">
                <table className="w-full border-collapse text-[13.5px]">
                  {b.head.length ? (
                    <thead>
                      <tr>
                        {b.head.map((c, j) => (
                          <th key={j} className="border border-[#E8E8E8] bg-[#F7F7F8] px-3 py-1.5 text-left font-bold">
                            <InlineView inline={c} hl={hl} markRef={markRef} />
                          </th>
                        ))}
                      </tr>
                    </thead>
                  ) : null}
                  <tbody>
                    {b.rows.map((r, j) => (
                      <tr key={j}>
                        {r.map((c, n) => (
                          <td key={n} className="border border-[#E8E8E8] px-3 py-1.5 align-top">
                            <InlineView inline={c} hl={hl} markRef={markRef} />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          case "code":
            return (
              <pre key={k} className="my-3 overflow-x-auto rounded bg-[#F7F7F8] p-3 font-mono text-[13px]">
                {b.text}
              </pre>
            );
          case "hr":
            return <hr key={k} className="my-6 border-[#E8E8E8]" />;
        }
      })}
    </div>
  );
});

