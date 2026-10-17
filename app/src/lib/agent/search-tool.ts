/**
 * search_snapshot (spec section 3 step 6): Box AI ask in multi-file mode with citations over the
 * other readable files of the snapshot. Code validates every citation against the pinned version
 * text with the engine's normalization; an uncited or unvalidated passage counts as no evidence
 * (acceptance case 20). When Box AI is unavailable the tool falls back to normalized string search
 * over the pinned texts and says so in the label.
 *
 * Box AI reads current versions. The snapshot pins versions. At demo time they are equal; the tool
 * checks that per file and excludes any file whose current version differs from the pinned one.
 */
import type { Snapshot, SnapshotFile, TraceStep } from "../types";
import type { BoxAdapter } from "../box/adapter";
import type { EvaluatorFileText, SearchSnapshotTool } from "./evaluator.types";
import { findQuote, hasTerm, norm, quoteValid, sentences } from "../engine/normalize";

export type SearchCitation = Awaited<ReturnType<SearchSnapshotTool["search"]>>["citations"][number];

export interface SearchResult {
  label: string;
  fallback: boolean;
  citations: SearchCitation[];
  /** The trace step recorded for this call (also passed to onStep). */
  step: TraceStep;
}

/** SearchSnapshotTool whose results also carry the recorded trace step. */
export interface SnapshotSearchTool extends SearchSnapshotTool {
  search(query: string, excludeFileName?: string): Promise<SearchResult>;
}

export interface SearchToolOptions {
  /** Epoch ms that TraceStep.startMs is measured from. Default: when the tool was made. */
  originMs?: number;
  /** Cap on statements returned per call. */
  maxCitations?: number;
}

/** Steps already delivered through a search tool's onStep, so the evaluator does not emit them twice. */
export const EMITTED_STEPS = new WeakSet<TraceStep>();

/** "customer-managed keys OR key rotation" -> ["customer-managed keys", "key rotation"]. */
export function splitQuery(query: string): string[] {
  return query
    .split(/\s+OR\s+|\s*\|\s*|\s*;\s*/i)
    .map((t) => t.trim().replace(/^["']|["']$/g, ""))
    .filter((t) => t.length > 0);
}

/**
 * A term matches when it appears at a word start after normalization, or when every word of a
 * multi-word term does (singular stem), so "customer-managed keys" matches "customer-managed key".
 */
export function termMatches(text: string, term: string): boolean {
  if (hasTerm(text, term)) return true;
  const words = norm(term).split(/[\s/]+/).filter((w) => w.length > 2);
  return words.length > 1 && words.every((w) => hasTerm(text, w.replace(/(es|s)$/, "")));
}

const stripBullet = (s: string) => s.replace(/^\s*(?:[-*+]|\d+\.)\s+/, "").replace(/^\|\s*/, "").trim();

/** Bounded Box AI question (spec 3 step 6). */
export function searchPrompt(query: string): string {
  const q = splitQuery(query).join(", ");
  return `Is there a statement about ${q} in these files? Quote the exact sentence(s). If there is none, say so.`;
}

export function makeSearchSnapshotTool(
  box: BoxAdapter,
  snapshot: Snapshot,
  files: EvaluatorFileText[],
  onStep?: (step: TraceStep) => void,
  opts: SearchToolOptions = {},
): SnapshotSearchTool {
  const origin = opts.originMs ?? Date.now();
  const maxCitations = opts.maxCitations ?? 10;
  let currentVersions: Promise<Map<string, string | null>> | null = null;

  /** fileId -> current Box version id (null when Box could not say). Computed once per tool. */
  const loadCurrentVersions = () =>
    (currentVersions ??= Promise.all(
      files.map(async ({ file }) => {
        try {
          const versions = await box.listFileVersions(file.fileId);
          return [file.fileId, versions.length ? versions[versions.length - 1].versionId : null] as const;
        } catch {
          return [file.fileId, null] as const;
        }
      }),
    ).then((pairs) => new Map(pairs)));

  const toCitation = (f: SnapshotFile, text: string, quote: string): SearchCitation | null => {
    if (!quoteValid(quote, text)) return null;
    const loc = findQuote(quote, text);
    return {
      fileName: f.fileName,
      versionId: f.versionId,
      section: loc?.section ?? "(section not located)",
      paragraph: loc?.paragraph,
      page: loc?.page,
      quote,
      validated_against_pinned_text: true,
    };
  };

  const emit = (step: TraceStep) => {
    if (onStep) {
      EMITTED_STEPS.add(step);
      onStep(step);
    }
    return step;
  };

  function stringSearch(query: string, others: EvaluatorFileText[]): SearchCitation[] {
    const terms = splitQuery(query);
    const out: SearchCitation[] = [];
    const seen = new Set<string>();
    for (const { file, text } of others) {
      for (const raw of sentences(text)) {
        const s = stripBullet(raw);
        if (s.length < 8 || !terms.some((t) => termMatches(s, t))) continue;
        const c = toCitation(file, text, s) ?? toCitation(file, text, raw);
        if (c && !seen.has(norm(c.quote))) {
          seen.add(norm(c.quote));
          out.push(c);
        }
        if (out.length >= maxCitations) return out;
      }
    }
    return out;
  }

  async function search(query: string, excludeFileName?: string): Promise<SearchResult> {
    const t0 = Date.now();
    const others = files.filter((f) => f.file.fileName !== excludeFileName);
    const names = others.map((f) => f.file.fileName);
    const terms = splitQuery(query);
    const args = {
      agent_tool: "search_snapshot",
      query,
      exclude_file: excludeFileName ?? null,
      snapshot_id: snapshot.snapshot_id,
      mode: "multiple_item_qa",
      include_citations: true,
    };
    const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

    const ask = others.length
      ? await box.aiAsk(others.map((f) => f.file.fileId), searchPrompt(query), { citations: true })
      : ({ unavailable: true, reason: "no other readable files in the snapshot" } as const);

    if (ask.unavailable) {
      const citations = stringSearch(query, others);
      const label = `string search over ${plural(others.length, "file")} (Box AI unavailable), ${plural(citations.length, "statement")}`;
      const step = emit({
        source: "app",
        kind: "tool_call",
        tool: "string_search",
        label,
        startMs: t0 - origin,
        durationMs: Date.now() - t0,
        ts: new Date(t0).toISOString(),
        args: { ...args, mode: "string_search", include_citations: false },
        result: { files_asked: names, cited_statements: citations.length, citations, fallback: "string_search", box_ai_unavailable_reason: ask.reason },
        detail: `search_snapshot fell back to normalized string search over pinned texts (Box AI unavailable: ${ask.reason}); terms ${terms.map((t) => `'${t}'`).join(", ")}`,
      });
      return { label, fallback: true, citations, step };
    }

    // Box AI answered. Validate each cited passage against the pinned text of the cited file.
    const current = await loadCurrentVersions();
    const byId = new Map(others.map((f) => [f.file.fileId, f]));
    const mismatched = others.filter((f) => current.get(f.file.fileId) !== f.file.versionId).map((f) => f.file.fileName);
    const answerNorm = norm(ask.answer ?? "");
    const citations: SearchCitation[] = [];
    const rejected: { fileId: string; fileName?: string; content: string; reason: string }[] = [];
    const seen = new Set<string>();

    for (const c of ask.citations) {
      const f = byId.get(c.fileId);
      const content = (c.content ?? "").trim();
      if (!f) {
        rejected.push({ fileId: c.fileId, content: content.slice(0, 300), reason: "cited file is not among the asked snapshot files" });
        continue;
      }
      if (mismatched.includes(f.file.fileName)) {
        rejected.push({ fileId: c.fileId, fileName: f.file.fileName, content: content.slice(0, 300), reason: "current Box version differs from the pinned snapshot version" });
        continue;
      }
      // Candidate statements: the sentences of the cited passage that bear a query term or that the
      // answer itself quotes. The passage as a whole is used only when it is a single sentence.
      const parts = sentences(content).map(stripBullet).filter((s) => s.length >= 8);
      const candidates = (parts.length ? parts : [content]).filter(
        (s) => terms.some((t) => termMatches(s, t)) || (s.length >= 20 && answerNorm.includes(norm(s))),
      );
      let accepted = 0;
      for (const s of candidates) {
        const v = toCitation(f.file, f.text, s);
        if (v && !seen.has(norm(v.quote))) {
          seen.add(norm(v.quote));
          citations.push(v);
          accepted++;
        }
      }
      if (!accepted)
        rejected.push({
          fileId: c.fileId,
          fileName: f.file.fileName,
          content: content.slice(0, 300),
          reason: candidates.length ? "cited passage not found in the pinned version text" : "cited passage bears no query term",
        });
    }

    const kept = citations.slice(0, maxCitations);
    const inFiles = [...new Set(kept.map((c) => c.fileName))];
    let label = `Box AI ask over ${plural(others.length, "file")}, ${plural(kept.length, "cited statement")}${inFiles.length ? ` in ${inFiles.join(", ")}` : ""}`;
    if (mismatched.length) label += " (current version ≠ snapshot; result not relied on for " + mismatched.join(", ") + ")";

    const step = emit({
      source: "boxai",
      kind: "tool_call",
      tool: "box_ai_ask",
      label,
      startMs: t0 - origin,
      durationMs: Date.now() - t0,
      ts: new Date(t0).toISOString(),
      args,
      result: {
        files_asked: names,
        cited_statements: kept.length,
        citations: kept,
        answer: ask.answer,
        unvalidated: rejected,
        version_check: mismatched.length ? { matches: false, files: mismatched } : { matches: true },
      },
      detail: `search_snapshot via Box AI ask (multiple_item_qa, include_citations); citations validated against pinned text by code; query '${query}'`,
    });
    return { label, fallback: false, citations: kept, step };
  }

  return { search };
}
