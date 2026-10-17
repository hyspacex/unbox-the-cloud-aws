/**
 * Prior-quote diff hints (spec 3 step 4; gen.py Scenario.diff_hints) and the card's word diff.
 * Hints are hints for the judge, shown in the UI; a vanished quote is not a verdict.
 */
import type { DiffHint } from "../agent/evaluator.types";
import type { RequiredClause } from "../types";
import { hasTerm, quoteValid } from "./normalize";

export interface PriorBoundQuote {
  control_id: string;
  fileId: string;
  fileName: string;
  quote: string;
  required_clauses: RequiredClause[];
}

/**
 * For each control with a prior verification: is the bound quote still in the new version of the
 * same file? If not, which of the clause hint terms that appeared in the prior quote are still in
 * the file (weakened) or none are (removed).
 */
export function priorQuoteDiffHints(prior: PriorBoundQuote[], newTextByFileId: Map<string, string | null>): DiffHint[] {
  return prior.map((p) => {
    const text = newTextByFileId.get(p.fileId) ?? null;
    if (text !== null && quoteValid(p.quote, text)) return { control_id: p.control_id, file: p.fileName, status: "present" as const };
    const terms = p.required_clauses.flatMap((rc) => rc.hint_terms.filter((t) => hasTerm(p.quote, t)));
    const kept = text === null ? [] : terms.filter((t) => hasTerm(text, t));
    return {
      control_id: p.control_id,
      file: p.fileName,
      quote: p.quote,
      status: kept.length ? ("weakened" as const) : ("removed" as const),
      hint_terms_in_prior_quote: terms,
      hint_terms_still_in_file: kept,
      note: text === null ? "file not readable in the new snapshot; hint for the evaluator, not a verdict" : "hint for the evaluator, not a verdict",
    };
  });
}

export interface DiffToken {
  type: "same" | "del" | "ins";
  text: string;
}

/** Word-level diff (LCS over whitespace-separated words), merged into runs. */
export function wordDiff(a: string, b: string): DiffToken[] {
  const A = a.split(/\s+/).filter(Boolean);
  const B = b.split(/\s+/).filter(Boolean);
  const n = A.length;
  const m = B.length;
  const L: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = A[i] === B[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const out: DiffToken[] = [];
  const push = (type: DiffToken["type"], w: string) => {
    const last = out[out.length - 1];
    if (last && last.type === type) last.text += " " + w;
    else out.push({ type, text: w });
  };
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (A[i] === B[j]) {
      push("same", A[i]);
      i++;
      j++;
    } else if (L[i + 1][j] >= L[i][j + 1]) push("del", A[i++]);
    else push("ins", B[j++]);
  }
  while (i < n) push("del", A[i++]);
  while (j < m) push("ins", B[j++]);
  return out;
}
