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
