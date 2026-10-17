/**
 * Quote normalization and location (spec 3 steps 4 and 7). Exactly the rules of gen.py `norm`
 * and keel.html `norm`: strip backticks, curly quotes to straight, hyphen variants to "-",
 * collapse whitespace, lowercase. Disclosed on the card as NORMALIZATION.
 */

export const NORMALIZATION = "whitespace, quotes, hyphens, case";

export function norm(s: string): string {
  const t = s
    .replace(/`/g, "")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[‐‑–—]/g, "-");
  return t.split(/\s+/).filter(Boolean).join(" ").toLowerCase();
}

/** Spec 3 step 7: a quote is valid when it string-matches the pinned text after normalization. */
export function quoteValid(quote: string, text: string): boolean {
  const q = norm(quote);
  return q.length > 0 && norm(text).includes(q);
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** gen.py has_term: term must not be preceded by a letter or digit (prefix match allowed after). */
export function hasTerm(text: string, term: string): boolean {
  return new RegExp("(?<![a-z0-9])" + escapeRe(norm(term))).test(norm(text));
}

/** Code-point length, as Python's len(str). */
const cpLen = (s: string) => Array.from(s).length;

/** "3.1 Services and components" -> "§3.1 Services and components"; unnumbered headings unchanged. */
export function formatHeading(rawHeading: string): string {
  const heading = rawHeading.replace(/^#+/, "").trim();
  const m = /^(\d+(\.\d+)?)\.?\s/.exec(heading);
  return m ? "§" + m[1] + " " + heading.slice(m[0].length) : heading;
}

export interface QuoteLocation {
  section: string;
  paragraph: number;
  page: number;
}

/**
 * Locate a quote as gen.py Versions.locate does: the markdown heading above it (with the document's
 * own numbering), the 1-based paragraph index under that heading, and a page estimate of
 * 1 + offset // 3000 characters. Returns null when the quote is not in the text.
 */
export function findQuote(quote: string, text: string): QuoteLocation | null {
  const nq = norm(quote);
  if (!nq) return null;
  let heading = "(front matter)";
  let para = 0;
  let buf: string[] = [];
  let pos = 0;
  for (const ln of [...text.split("\n"), ""]) {
    if (ln.startsWith("#")) {
      heading = ln.replace(/^#+/, "").trim();
      para = 0;
      buf = [];
    } else if (ln.trim() === "") {
      if (buf.length) {
        para += 1;
        if (norm(buf.join(" ")).includes(nq)) {
          return { section: formatHeading(heading), paragraph: para, page: 1 + Math.floor(pos / 3000) };
        }
      }
      buf = [];
    } else {
      buf.push(ln);
    }
    pos += cpLen(ln) + 1;
  }
  return null;
}

export interface MarkdownSection {
  /** "§4.3 Data protection at rest", or "(front matter)" for text before the first heading. */
  label: string;
  /** Section number token: "§4.3", or the label when unnumbered. */
  number: string;
  headingLine: string | null;
  /** Raw text of the section, heading line included. */
  raw: string;
  /** Raw body without the heading line, trimmed. */
  body: string;
}

/** Split markdown into sections: each heading line starts a section that runs to the next heading. */
export function sections(text: string): MarkdownSection[] {
  const out: MarkdownSection[] = [];
  let cur: string[] = [];
  let headingLine: string | null = null;
  const flush = () => {
    if (headingLine === null && cur.length === 0) return;
    const label = headingLine === null ? "(front matter)" : formatHeading(headingLine);
    out.push({
      label,
      number: label.startsWith("§") ? label.split(" ")[0] : label,
      headingLine,
      raw: (headingLine !== null ? [headingLine, ...cur] : cur).join("\n"),
      body: cur.join("\n").trim(),
    });
  };
  for (const ln of text.split("\n")) {
    if (ln.startsWith("#")) {
      flush();
      headingLine = ln;
      cur = [];
    } else cur.push(ln);
  }
  flush();
  return out;
}

/** The section (heading to next heading) that contains the quote, as gen.py section_text. */
export function sectionContaining(text: string, quote: string): MarkdownSection | null {
  const nq = norm(quote);
  return sections(text).find((s) => norm(s.raw).includes(nq)) ?? null;
}

/** Normalized text of the section containing the quote (High-tier section-change check, spec 3 step 8). */
export function sectionText(text: string, quote: string): string | null {
  const s = sectionContaining(text, quote);
  return s ? norm(s.raw) : null;
}

/** Find a section by its label ("§4.3 Data protection at rest") or number ("§4.3"). */
export function sectionByLabel(text: string, label: string): MarkdownSection | null {
  const all = sections(text);
  const number = label.startsWith("§") ? label.split(" ")[0] : label;
  return all.find((s) => s.label === label) ?? all.find((s) => s.number === number) ?? null;
}

/** Sentences of a text block (markdown emphasis-aware), used for assertions and citations. */
export function sentences(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .flatMap((p) => p.replace(/\s*\n\s*/g, " ").split(/(?<=[.!?][*_"')\]]*)\s+(?=[A-Z0-9`"(*|])/))
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !/^#/.test(s));
}

/**
 * UI v4.1 (file preview highlight): where `quote` sits in the RAW `text`, as character offsets
 * [start, end), matched under exactly the rules of `norm` (backticks dropped, curly quotes and hyphen
 * variants folded, whitespace collapsed, case ignored). Pure; null when the quote is not in the text.
 */
export function locateInText(quote: string, text: string): { start: number; end: number } | null {
  const nq = norm(quote);
  if (!nq) return null;
  const out: string[] = [];
  const map: number[] = [];
  let pendingSpace = -1;
  for (let i = 0; i < text.length; i++) {
    let ch = text[i];
    if (ch === "`") continue;
    if (/\s/.test(ch)) {
      if (out.length && pendingSpace < 0) pendingSpace = i;
      continue;
    }
    if (pendingSpace >= 0) {
      out.push(" ");
      map.push(pendingSpace);
      pendingSpace = -1;
    }
    if (ch === "‘" || ch === "’") ch = "'";
    else if (ch === "“" || ch === "”") ch = '"';
    else if ("‐‑–—".includes(ch)) ch = "-";
    const low = ch.toLowerCase();
    for (const c of low) {
      out.push(c);
      map.push(i);
    }
  }
  const at = out.join("").indexOf(nq);
  if (at < 0) return null;
  return { start: map[at], end: map[at + nq.length - 1] + 1 };
}
