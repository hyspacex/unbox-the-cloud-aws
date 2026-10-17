/**
 * Word-level diff for the finding card (LCS over word tokens, whitespace kept).
 * Rendered with strike-through for deleted and underline for inserted text.
 */

export type DiffOp = { type: "same" | "del" | "ins"; text: string; /** for "same": the old version's exact text */ old?: string };

function tokenize(s: string): string[] {
  // Words and the whitespace that follows them stay separate tokens so spacing survives.
  return s.match(/\s+|[^\s]+/g) ?? [];
}

function norm(t: string): string {
  return t
    .toLowerCase()
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[“”„‟]/g, '"')
    .replace(/[‐-―]/g, "-");
}

export function wordDiff(a: string, b: string): DiffOp[] {
  const A = tokenize(a);
  const B = tokenize(b);
  const n = A.length;
  const m = B.length;
  // Guard against pathological sizes; sections are short.
  if (n * m > 4_000_000) {
    return [
      { type: "del", text: a },
      { type: "ins", text: b },
    ];
  }
  const An = A.map(norm);
  const Bn = B.map(norm);
  const dp: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = An[i] === Bn[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const out: DiffOp[] = [];
  const push = (type: DiffOp["type"], text: string, old?: string) => {
    const last = out[out.length - 1];
    if (last && last.type === type) {
      last.text += text;
      if (type === "same") last.old = (last.old ?? "") + (old ?? text);
    } else out.push(type === "same" ? { type, text, old: old ?? text } : { type, text });
  };
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (An[i] === Bn[j]) {
      push("same", B[j], A[i]);
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      push("del", A[i++]);
    } else {
      push("ins", B[j++]);
    }
  }
  while (i < n) push("del", A[i++]);
  while (j < m) push("ins", B[j++]);

  // Fold whitespace-only changes into "same" so the diff reads as words.
  const folded = out.map((op) => (op.type !== "same" && /^\s+$/.test(op.text) ? { type: "same" as const, text: op.text, old: op.text } : op));
  return semanticCleanup(folded);
}

const wordCount = (t: string) => (t.match(/[^\s]+/g) ?? []).length;

/**
 * Readability pass: short unchanged runs (two words or fewer) sandwiched between changes are
 * absorbed into the change, and each change cluster is shown as all deleted words, then all
 * inserted words. A rewrite then reads as "old phrase / new phrase" instead of confetti.
 */
function semanticCleanup(ops: DiffOp[]): DiffOp[] {
  // Group into alternating same / change clusters.
  type Cluster = { same: true; text: string; old: string } | { same: false; del: string; ins: string };
  const clusters: Cluster[] = [];
  for (const op of ops) {
    const last = clusters[clusters.length - 1];
    if (op.type === "same") {
      if (last && last.same) {
        last.text += op.text;
        last.old += op.old ?? op.text;
      } else clusters.push({ same: true, text: op.text, old: op.old ?? op.text });
    } else {
      if (last && !last.same) {
        if (op.type === "del") last.del += op.text;
        else last.ins += op.text;
      } else clusters.push({ same: false, del: op.type === "del" ? op.text : "", ins: op.type === "ins" ? op.text : "" });
    }
  }
  // Single left-to-right pass: absorb one-word unchanged runs (articles, "and") between changes.
  const merged: Cluster[] = [];
  for (let i = 0; i < clusters.length; i++) {
    const c = clusters[i];
    const a = merged[merged.length - 1];
    const b = clusters[i + 1];
    if (c.same && a && !a.same && b && !b.same && wordCount(c.text) <= 1 && !/\n/.test(c.text)) {
      a.del += c.old + b.del;
      a.ins += c.text + b.ins;
      i++;
      continue;
    }
    merged.push(c.same ? { ...c } : { ...c });
  }
  const res: DiffOp[] = [];
  for (const c of merged) {
    if (c.same) res.push({ type: "same", text: c.text });
    else {
      if (c.del.trim()) res.push({ type: "del", text: c.del.replace(/\s+$/, "") });
      if (c.del.trim() && c.ins.trim()) res.push({ type: "same", text: " " });
      if (c.ins.trim()) res.push({ type: "ins", text: c.ins.replace(/\s+$/, "") });
      const trail = (c.ins.trim() ? c.ins : c.del).match(/\s+$/);
      if (trail) res.push({ type: "same", text: trail[0] });
    }
  }
  return res;
}

export function diffStats(ops: DiffOp[]): { deleted: number; inserted: number } {
  const count = (t: string) => (t.match(/[^\s]+/g) ?? []).length;
  return ops.reduce(
    (acc, op) => {
      if (op.type === "del") acc.deleted += count(op.text);
      if (op.type === "ins") acc.inserted += count(op.text);
      return acc;
    },
    { deleted: 0, inserted: 0 },
  );
}

/** Split text around the first case-insensitive occurrence of a quote (for highlighting). */
export function splitOnQuote(text: string, quote?: string | null): [string, string, string] | null {
  if (!quote) return null;
  const idx = norm(text).indexOf(norm(quote));
  if (idx < 0) return null;
  return [text.slice(0, idx), text.slice(idx, idx + quote.length), text.slice(idx + quote.length)];
}
