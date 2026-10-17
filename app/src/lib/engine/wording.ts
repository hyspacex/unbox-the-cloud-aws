/**
 * Deterministic wording filter for persisted machine text (CLAUDE.md: machine text never says
 * "satisfied", "compliant", "passed" or "regressed"; Codex finding 18). Applied before persistence
 * to model basis, model suggestions, code-built basis and suggestions, and Box AI drafts.
 * Human-authored text (the reviewer's reason) and verbatim source quotes are exempt: they are
 * removed from the text before the check, never altered.
 */
export const BANNED_MACHINE_WORDS = ["satisfied", "compliant", "passed", "regressed"] as const;
const BANNED_RE = new RegExp(`\\b(${BANNED_MACHINE_WORDS.join("|")})\\b`, "gi");

export interface WordingHit {
  field: string;
  words: string[];
}

/** Banned words in `text` after removing exempt segments (quotes, the reviewer's reason). */
export function bannedWords(text: string, exempt: string[] = []): string[] {
  let t = text;
  for (const e of exempt.filter(Boolean).sort((a, b) => b.length - a.length)) t = t.split(e).join(" ");
  return [...new Set((t.match(BANNED_RE) ?? []).map((w) => w.toLowerCase()))];
}

export const WITHHELD_BULLET = "Machine bullet withheld: it used wording reserved for a human disposition.";

/** Filter a list of machine bullets: offending bullets are replaced by a fixed notice and logged. */
export function filterBullets(field: string, bullets: string[], exempt: string[], hits: WordingHit[]): string[] {
  return bullets.map((b) => {
    const w = bannedWords(b, exempt);
    if (!w.length) return b;
    hits.push({ field, words: w });
    return WITHHELD_BULLET;
  });
}

/** Filter one machine string; returns the fallback when it contains banned wording. */
export function filterText(field: string, text: string | undefined, exempt: string[], fallback: string, hits: WordingHit[]): string | undefined {
  if (text === undefined) return undefined;
  const w = bannedWords(text, exempt);
  if (!w.length) return text;
  hits.push({ field, words: w });
  return fallback;
}

const attNorm = (s: string) => s.toLowerCase().split(/\s+/).filter(Boolean).join(" ").replace(/[\s.!?;:,]+$/, "");

/**
 * Is the profile's attestation phrase in the reviewer's message? Case-insensitive, internal
 * whitespace collapsed, trailing punctuation and surrounding whitespace ignored (judge B6).
 * The message itself is stored verbatim. The UI calls this same function for its live checkmark.
 */
export function attestationPresent(message: string, phrase: string): boolean {
  const p = attNorm(phrase);
  return p.length > 0 && attNorm(message).includes(p);
}

/** Box task messages are plain text: strip markdown backticks before storage and display (judge B8). */
export function plainText(s: string): string {
  return s.replace(/`/g, "");
}

const WITHHELD_TERM = "[term withheld]";
/** Segments in straight or curly double quotes are verbatim source or human text: exempt. */
const QUOTED = /"[^"]*"|“[^”]*”/g;

/** Replace banned words outside quoted segments and outside the exempt strings; deterministic. */
export function sanitizeMachineText(field: string, text: string, exempt: string[], hits: WordingHit[]): string {
  const guard: string[] = [];
  const protect = (seg: string) => {
    guard.push(seg);
    return `\u0000${guard.length - 1}\u0000`;
  };
  let t = text.replace(QUOTED, protect);
  for (const e of exempt.filter((x) => x && x.length >= 4).sort((a, b) => b.length - a.length)) t = t.split(e).join(protect(e));
  const found = new Set<string>();
  t = t.replace(BANNED_RE, (w) => {
    found.add(w.toLowerCase());
    return WITHHELD_TERM;
  });
  if (found.size) hits.push({ field, words: [...found] });
  return t.replace(/\u0000(\d+)\u0000/g, (_, i) => guard[Number(i)]);
}

/**
 * The persistence boundary (Codex finding 18): every machine-authored text field of a ledger event
 * passes this filter before it is hashed and stored. Human events, verbatim quotations, Box task
 * responses, comments and reviewer-approved author messages are exempt.
 */
export function sanitizeMachineEvent(e: Record<string, unknown>): Record<string, unknown> {
  const actor = e.actor as { type?: string } | undefined;
  if (actor?.type === "human") return e;
  const hits: WordingHit[] = [];
  const quotes: string[] = [];
  const pushQ = (q: unknown) => typeof q === "string" && quotes.push(q);
  pushQ(e.quote);
  for (const c of (e.clause_support as { quote?: { quote?: string } | null }[] | null) ?? []) pushQ(c?.quote?.quote);
  pushQ((e.conflicting_quote as { quote?: string } | undefined)?.quote);
  pushQ((e.previous_binding as { quote?: string } | undefined)?.quote);
  for (const ev of (e.evidence as { quote?: string }[] | undefined) ?? []) pushQ(ev?.quote);
  const out: Record<string, unknown> = { ...e };
  for (const k of ["basis", "model_basis"]) {
    const v = out[k];
    if (Array.isArray(v)) out[k] = v.map((b) => (typeof b === "string" ? sanitizeMachineText(k, b, quotes, hits) : b));
  }
  for (const k of ["note", "explanation", "rejection"]) if (typeof out[k] === "string") out[k] = sanitizeMachineText(k, out[k] as string, quotes, hits);
  const err = out.error as { message?: string } | undefined;
  if (err && typeof err.message === "string") out.error = { ...err, message: sanitizeMachineText("error.message", err.message, quotes, hits) };
  const task = out.task as { message?: string; kind?: string } | undefined;
  if (task && typeof task.message === "string" && task.kind !== "author") out.task = { ...task, message: sanitizeMachineText("task.message", task.message, quotes, hits) };
  if (hits.length) out.wording_filter = [...(((e.wording_filter as WordingHit[] | undefined) ?? [])), ...hits];
  return out;
}
