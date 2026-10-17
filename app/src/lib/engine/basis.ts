/**
 * Basis bullets built by code from recorded operations only (spec 6 finding card; v3.4 Dana
 * defect 3): the prior quote not found after normalization (diff hint), the exact Box AI ask query
 * and its validated cited-statement count (from the run's recorded asks), the weaker statement
 * found at section and paragraph, the number of other assertions changed in the section, the
 * binding move, and the staleness check. Never a search the trace does not show.
 * The model's own basis is kept separately on the event as model_basis.
 */
import type { DiffHint } from "../agent/evaluator.types";
import type { ChangeClassification, ClauseSupport, EvidenceRef, MachineAssessment } from "../types";
import type { BoxAiAskRecord } from "../store";
import type { StalenessResult } from "./staleness";
import { clauseNoun } from "./display";
import { NORMALIZATION, norm, quoteValid, sectionByLabel, sectionContaining, sentences } from "./normalize";

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
const secNum = (s?: string) => (s ?? "").split(" ")[0] || "the section";

export function listJoin(items: string[], conj = "and"): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} ${conj} ${items[items.length - 1]}`;
}

/**
 * Sentences of the prior evidencing section that are no longer in the new version's section of the
 * same number, excluding sentences that were themselves cited as prior evidence.
 */
export function assertionsChanged(priorText: string, priorQuote: string, newText: string, priorCited: string[]): { count: number; section: string } | null {
  const prior = sectionContaining(priorText, priorQuote);
  if (!prior) return null;
  const next = sectionByLabel(newText, prior.number);
  if (!next) return null;
  const cited = priorCited.map(norm);
  const lost = sentences(prior.body).filter((s) => {
    const ns = norm(s);
    if (cited.some((c) => c.includes(ns) || ns.includes(c))) return false;
    return !quoteValid(s, next.raw);
  });
  return { count: lost.length, section: next.number };
}

/** Box AI asks in the run that concern this control (named by the agent, or by hint-term overlap). */
export function asksForControl(asks: BoxAiAskRecord[], controlId: string, hint: DiffHint | undefined): BoxAiAskRecord[] {
  return asks.filter((a) => {
    if (a.control_id) return a.control_id === controlId;
    if (!hint || hint.status === "present") return false;
    const terms = a.query.split(/\s+OR\s+/i).map(norm);
    return (hint.hint_terms_in_prior_quote ?? []).some((t) => terms.some((q) => q.includes(norm(t)) || norm(t).includes(q)));
  });
}

export function askBullet(a: BoxAiAskRecord): string {
  const n = a.files_asked.length;
  const m = a.cited_statements;
  const where = m ? ` in ${listJoin([...new Set(a.citations.map((c) => `${c.fileName} ${secNum(c.section)}`))])}, validated against pinned text` : "";
  const rejected = a.rejected_citations.length
    ? ` ${plural(a.rejected_citations.length, "cited passage")} not found in the pinned text, counted as no evidence.`
    : "";
  const head = a.fallback ? `String search over ${n} other files (Box AI unavailable), query '${a.query}'` : `Box AI ask over ${n} other files, query '${a.query}'`;
  return `${head}: ${plural(m, a.fallback ? "matching statement" : "cited statement")}${where}.${rejected}`;
}

export interface BasisInput {
  clauseSupport: ClauseSupport[];
  assessment: MachineAssessment;
  classification: ChangeClassification;
  hint?: DiffHint;
  /** The prior verification's binding (section, paragraph, version label). */
  prior?: EvidenceRef | null;
  /** Label of the prior binding's file in the new snapshot ("v3"). */
  newLabelOfPriorFile?: string;
  asks: BoxAiAskRecord[];
  changedAssertions?: { count: number; section: string } | null;
  binding?: EvidenceRef | null;
  /** Labels of the binding file's versions that already contained the binding quote. */
  quoteExistedIn?: string[];
  conflicting?: EvidenceRef | null;
  staleness?: StalenessResult | null;
}

export function buildBasis(i: BasisInput): string[] {
  const cs = i.clauseSupport;
  const n = cs.filter((c) => c.support === "supported").length;
  const m = cs.length;
  const out: string[] = [];
  const lostPrior = i.hint && i.hint.status !== "present" && i.prior;
  if (lostPrior && i.prior) {
    const p = i.prior;
    out.push(
      `Verified quote from ${p.fileName} ${p.versionLabel ?? p.versionId} ${p.section}${p.paragraph ? ` ¶${p.paragraph}` : ""} not found in ${i.newLabelOfPriorFile ?? "the new version"} after normalization (${NORMALIZATION}).`,
    );
  }
  if (i.assessment === "evidence_weakened") {
    const sup = cs.filter((c) => c.support === "supported" && c.quote);
    const first = sup[0];
    const uns = cs.filter((c) => c.support !== "supported").map((c) => clauseNoun(c.clause));
    const q = first.quote!;
    const at = `${secNum(q.section)}${q.paragraph ? ` ¶${q.paragraph}` : ""} (${q.fileName} ${q.versionLabel ?? q.versionId})`;
    out.push(`${cap(clauseNoun(first.clause))} is still stated at ${at}; ${n} of ${m} required clauses supported. ${listJoin(uns)} ${uns.length === 1 ? "is" : "are"} unsupported.`);
  }
  for (const a of i.asks) out.push(askBullet(a)); // the caller passes only this control's recorded asks
  if (i.changedAssertions && i.changedAssertions.count > 0) out.push(`${plural(i.changedAssertions.count, "other assertion")} changed in ${i.changedAssertions.section}.`);
  if (i.assessment === "evidence_absent") out.push(`0 of ${m} required clauses supported by any readable file in the snapshot.`);
  if (i.assessment === "evidence_found" || i.assessment === "evidence_contradicted") {
    const files = [...new Set(cs.map((c) => (c.quote ? `${c.quote.fileName} ${c.quote.versionLabel ?? c.quote.versionId}` : "")).filter(Boolean))];
    out.push(`${n} of ${m} required clauses supported by validated quotes${i.classification === "moved" && files.length === 1 ? ` from ${files[0]}` : ""}.`);
  }
  if (i.assessment === "evidence_contradicted" && i.conflicting) {
    const c = i.conflicting;
    out.push(`Conflicting statement in ${c.fileName} ${c.versionLabel ?? c.versionId} ${c.section}${c.paragraph ? ` ¶${c.paragraph}` : ""}: "${c.quote}"`);
  }
  if (i.classification === "unchanged") out.push("Prior binding quote matched after normalization.");
  if (i.classification === "none" && i.assessment !== "not_evaluated") out.push("No prior evidence to compare.");
  if (i.classification === "moved" && i.binding) {
    const b = i.binding;
    out.push(
      i.quoteExistedIn && i.quoteExistedIn.length
        ? `The ${b.fileName} quote already existed before this snapshot (${b.fileName} ${listJoin(i.quoteExistedIn)}), so the binding moved and the support did not.`
        : `The ${b.fileName} quote is new in ${b.versionLabel ?? b.versionId}; the binding moved to new text.`,
    );
  }
  if (i.staleness && i.staleness.holds !== null && i.staleness.note && !i.staleness.note.startsWith("classification")) out.push(`Staleness check: ${i.staleness.note}.`);
  return out;
}

/** Basis for a control that code set to not_evaluated (coverage, input gate, quote validation). */
export function notEvaluatedBasis(reason: { code: string; message: string }): string[] {
  return [
    `${reason.message}.`.replace(/\.\.$/, "."),
    "The finding is not_evaluated rather than a quote-less positive; no status is inferred from the model output for this control.",
  ];
}
