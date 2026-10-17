/**
 * Validation of the model's output (spec 3 step 7; acceptance 7, 10, 16). The model's output is
 * untrusted until it passes here:
 *  - strict Zod schema (a disposition, status or history key is rejected);
 *  - every control in the profile has exactly one finding; unknown control ids are rejected; any of
 *    these fails the whole evaluation (evaluation_state error, no partial application);
 *  - every cited quote must string-match the pinned version text after normalization, in a file of
 *    this snapshot that was actually given to the evaluator; a finding with a failed quote becomes
 *    not_evaluated (fabricated quote), and so does a finding with a missing or unknown clause.
 * Section, paragraph and page are recomputed by code from the pinned text.
 */
import { FindingSet, type ControlFindingOut, type QuoteRef } from "../agent/schema";
import type { ClauseSupport, ControlProfile, EvidenceRef, Snapshot } from "../types";
import { deepLink } from "./ledger";
import { findQuote, quoteValid } from "./normalize";
import type { NotEvaluatedReason } from "./assess";

export const LOCATION_UNAVAILABLE = "(location unavailable: quote spans paragraphs)";

export interface PinnedFile {
  fileId: string;
  fileName: string;
  versionId: string;
  versionLabel?: string;
  text: string | null;
  /** True when the text was sent to the evaluator (readable and not quarantined). */
  given: boolean;
}

export interface ValidatedFinding {
  control_id: string;
  clause_support: ClauseSupport[];
  conflicting: EvidenceRef | null;
  model_basis: string[];
  model_suggested_action?: string;
  invalid?: NotEvaluatedReason;
  raw: ControlFindingOut;
}

export type ValidationResult =
  | { ok: false; error: { code: string; message: string } }
  | { ok: true; findings: Map<string, ValidatedFinding>; quotes_checked: number; quotes_matched: number; downgraded: { control_id: string; code: string; message: string }[] };

function checkQuote(q: QuoteRef, files: PinnedFile[], folderId?: string): { ref?: EvidenceRef; error?: string } {
  const f = files.find((x) => x.fileName === q.fileName && x.versionId === q.versionId);
  if (!f) {
    const other = files.find((x) => x.fileName === q.fileName);
    return { error: other ? `quote cites ${q.fileName} version ${q.versionId}, which is not the pinned version ${other.versionId}` : `quote cites ${q.fileName}, which is not in the snapshot` };
  }
  if (!f.given || f.text === null) return { error: `quote cites ${q.fileName} ${f.versionLabel ?? f.versionId}, whose text was not given to the evaluator` };
  if (!quoteValid(q.quote, f.text)) return { error: `quote not found in ${q.fileName} ${f.versionLabel ?? f.versionId} (${f.versionId}) after normalization` };
  const loc = findQuote(q.quote, f.text);
  return {
    ref: {
      fileId: f.fileId,
      fileName: f.fileName,
      versionId: f.versionId,
      versionLabel: f.versionLabel,
      // Location is computed from the pinned text, never taken from the model. A valid quote that
      // spans paragraphs has no single location: recorded as unavailable.
      section: loc?.section ?? LOCATION_UNAVAILABLE,
      paragraph: loc?.paragraph,
      page: loc?.page,
      quote: q.quote,
      box_deep_link: deepLink(f.fileId, f.versionId, folderId),
    },
  };
}

export function validateFindingSet(raw: unknown, ctx: { profile: ControlProfile; snapshot: Snapshot; files: PinnedFile[]; folderId?: string }): ValidationResult {
  const parsed = FindingSet.safeParse(raw);
  if (!parsed.success) {
    const msg = parsed.error.issues
      .slice(0, 4)
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("; ");
    return { ok: false, error: { code: "SCHEMA_REJECTED", message: `model output rejected by the FindingSet schema: ${msg}` } };
  }
  const out = parsed.data;
  if (out.snapshot_id !== ctx.snapshot.snapshot_id) {
    return { ok: false, error: { code: "SNAPSHOT_MISMATCH", message: `model output is for snapshot ${out.snapshot_id}, expected ${ctx.snapshot.snapshot_id}` } };
  }
  const known = new Set(ctx.profile.controls.map((c) => c.id));
  const unknown = out.findings.filter((f) => !known.has(f.control_id)).map((f) => f.control_id);
  if (unknown.length) return { ok: false, error: { code: "UNKNOWN_CONTROL", message: `model output names control ids not in the profile: ${unknown.join(", ")}` } };
  const seen = new Map<string, number>();
  for (const f of out.findings) seen.set(f.control_id, (seen.get(f.control_id) ?? 0) + 1);
  const dup = [...seen].filter(([, n]) => n > 1).map(([id]) => id);
  if (dup.length) return { ok: false, error: { code: "DUPLICATE_FINDING", message: `more than one finding for ${dup.join(", ")}` } };
  const missing = ctx.profile.controls.filter((c) => !seen.has(c.id)).map((c) => c.id);
  if (missing.length) return { ok: false, error: { code: "MISSING_FINDING", message: `no finding for ${missing.join(", ")}; every control needs exactly one` } };

  const findings = new Map<string, ValidatedFinding>();
  const downgraded: { control_id: string; code: string; message: string }[] = [];
  let checked = 0;
  let matched = 0;
  for (const control of ctx.profile.controls) {
    const f = out.findings.find((x) => x.control_id === control.id)!;
    let invalid: NotEvaluatedReason | undefined;
    const byId = new Map(f.clause_support.map((c) => [c.clause_id, c]));
    const dupClauses = f.clause_support.map((c) => c.clause_id).filter((id, i, a) => a.indexOf(id) !== i);
    if (dupClauses.length) invalid = { code: "CLAUSE_DUPLICATE", message: `clause ids given more than once for ${control.id}: ${[...new Set(dupClauses)].join(", ")}` };
    const extra = f.clause_support.filter((c) => !control.required_clauses.some((rc) => rc.clause_id === c.clause_id)).map((c) => c.clause_id);
    if (extra.length) invalid ??= { code: "CLAUSE_MISMATCH", message: `clause ids not in the profile for ${control.id}: ${extra.join(", ")}` };
    const clause_support: ClauseSupport[] = control.required_clauses.map((rc) => {
      const c = byId.get(rc.clause_id);
      if (!c) {
        invalid ??= { code: "CLAUSE_MISSING", message: `no clause support given for ${rc.clause_id}` };
        return { clause_id: rc.clause_id, clause: rc.clause, support: "unsupported", quote: null };
      }
      if (c.support === "unsupported") return { clause_id: rc.clause_id, clause: rc.clause, support: "unsupported", quote: null };
      if (!c.quote) {
        invalid ??= { code: "QUOTE_MISSING", message: `${rc.clause_id} marked supported without a quote` };
        return { clause_id: rc.clause_id, clause: rc.clause, support: "unsupported", quote: null };
      }
      checked++;
      const r = checkQuote(c.quote, ctx.files, ctx.folderId);
      if (r.error) {
        invalid ??= { code: "QUOTE_NOT_IN_PINNED_TEXT", message: `${rc.clause_id}: ${r.error}` };
        return { clause_id: rc.clause_id, clause: rc.clause, support: "unsupported", quote: null };
      }
      matched++;
      return { clause_id: rc.clause_id, clause: rc.clause, support: "supported", quote: r.ref! };
    });
    let conflicting: EvidenceRef | null = null;
    if (f.conflicting_quote) {
      checked++;
      const r = checkQuote(f.conflicting_quote, ctx.files, ctx.folderId);
      if (r.error) invalid ??= { code: "QUOTE_NOT_IN_PINNED_TEXT", message: `conflicting quote: ${r.error}` };
      else {
        matched++;
        conflicting = r.ref!;
      }
    }
    if (invalid) downgraded.push({ control_id: control.id, ...invalid });
    findings.set(control.id, { control_id: control.id, clause_support, conflicting, model_basis: f.basis, model_suggested_action: f.suggested_action, invalid, raw: f });
  }
  return { ok: true, findings, quotes_checked: checked, quotes_matched: matched, downgraded };
}
