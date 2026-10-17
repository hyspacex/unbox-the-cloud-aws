/**
 * Finding card (spec 6): prior and new version blocks bound to Box version ids, the clause marks,
 * the machine assessment labelled as such, related rows, the built actions with the reason when
 * disabled, the reviewer identity, the binding freshness check and the thread from the ledger.
 */
import type { KeelConfig } from "../config";
import type { Store, StoredFinding } from "../store";
import type { ControlProfile, EvidenceRef, Finding, FindingCard, LedgerEvent, SnapshotFile, TraceStep } from "../types";
import { bindingsEqual, verifyPrecondition } from "./assess";
import { clauseNoun, NEEDS_REVIEW_KINDS } from "./display";
import { listJoin } from "./basis";
import { addBusinessDays, REVIEWER_IDENTITY_SOURCE } from "./disposition";
import { NORMALIZATION, quoteValid, sectionByLabel, sectionContaining } from "./normalize";
import { buildRows, latestVerification, publicRow, verificationBinding, type ControlState, type RowWithState } from "./state";
import { suggestedAction } from "./tasks";
import { isSearchStep } from "./bubble";
import { decisionFlags, receiptFor } from "./summary";
import { controlTimeline } from "./history";
import { bannedWords } from "./wording";

/** A Finding for a control evaluated before this run (seed snapshots), built from its ledger event. */
export function findingFromState(store: Store, profile: ControlProfile, config: KeelConfig, row: RowWithState): StoredFinding {
  const st = row.state;
  const e = st.evaluation_event;
  const pvEvent = latestVerification(store.events, st.control.id);
  const pb = verificationBinding(store, pvEvent);
  return {
    finding_id: st.finding_id ?? `${e?.evaluation_id ?? `EVAL-${st.snapshot_id}`}/${st.control.id}`,
    control_id: st.control.id,
    control_title: st.control.title,
    tier: st.control.tier,
    materiality: profile.materiality[st.control.tier],
    snapshot_id: st.snapshot_id,
    machine_assessment: st.machine_assessment,
    change_classification: st.change_classification,
    basis: e?.basis ?? [],
    evidence: st.evidence,
    clause_support: st.clause_support,
    prior_evidence: pb && pvEvent ? [{ ...pb, verified_by: pvEvent.actor.name, verified_role: pvEvent.actor.role, verified_at: pvEvent.ts, verified_snapshot_id: pvEvent.snapshot_id ?? undefined }] : [],
    verification_holds: st.verification_holds,
    acknowledgment_required: st.acknowledgment_required,
    acknowledgment_reason: st.acknowledgment_reason,
    severity: row.status.severity,
    not_evaluated_reason: st.not_evaluated_reason,
    model_id: (e?.model_id as string | undefined) ?? config.modelId,
    inference_profile: (e?.inference_profile as string | undefined) ?? config.inferenceProfile,
    prompt_version: (e?.prompt_version as string | undefined) ?? config.promptVersion,
    prompt_hash: e?.prompt_hash ?? "",
    mrm_model_id: e?.mrm_model_id ?? config.mrmModelId,
    normalization: NORMALIZATION,
    box_deep_link: `https://app.box.com/folder/${config.box.folderId}`,
    suggested_action: suggestedAction(row, st.control, store),
  };
}

function snapshotFile(store: Store, fileId: string, versionId: string, fileName: string): SnapshotFile {
  const v = store.versionInfo(fileId, versionId);
  return { fileId, fileName, versionId, contentHash: v?.contentHash ?? "", versionLabel: v?.label };
}

function blockText(text: string | undefined, quote: string | null, sectionLabel?: string): { section?: string; raw?: string } {
  if (!text) return {};
  const s = (quote ? sectionContaining(text, quote) : null) ?? (sectionLabel ? sectionByLabel(text, sectionLabel) : null);
  return s ? { section: s.label, raw: s.body } : {};
}

/** Verify enabled only when every clause is supported on the current binding and not contradicted (spec 4). */
export function verifyAction(st: ControlState, row: RowWithState, attestation: string): FindingCard["actions"]["verify"] {
  if (row.status.kind === "verified") return { enabled: false, reason: "Already Verified on the current binding.", attestation_phrase: attestation };
  if (!st.open_task) {
    return {
      enabled: false,
      reason: row.status.kind === "verified_holds" ? "No review needed: the prior verification holds." : `Verify is disabled: no open review task for ${st.control.id}.`,
      attestation_phrase: attestation,
    };
  }
  if (st.evaluation_state === "pending") return { enabled: false, reason: "Verify is disabled: re-check pending.", attestation_phrase: attestation };
  const pre = verifyPrecondition(st.machine_assessment, st.clause_support);
  if (pre.ok) return { enabled: true, attestation_phrase: attestation };
  if (pre.reason === "contradicted") return { enabled: false, reason: "Verify is disabled: another quote in this snapshot conflicts with the supporting evidence; a new snapshot must resolve it.", attestation_phrase: attestation };
  if (pre.reason === "not_evaluated") return { enabled: false, reason: `Verify is disabled: not evaluated (${st.evaluation_reason ?? "no evaluation"}).`, attestation_phrase: attestation };
  const nouns = pre.unsupported.map((c) => clauseNoun(c.clause));
  return { enabled: false, reason: `Verify is disabled: no document in this package supports the ${listJoin(nouns, "or")} clause.`, attestation_phrase: attestation };
}

const COUNT_WORDS = ["", "it", "both", "all three", "all four", "all five", "all six"];
const short = (standard: string) => {
  const m = /^(\S+).*?(§\S+)\s*$/.exec(standard);
  return m ? `${m[1]} ${m[2]}` : standard;
};
/** Reviewer-facing noun for a lost clause, worded from the verified sentence when it says more (judge B7). */
function reasonNoun(clause: string, verifiedQuote: string): string {
  const q = verifiedQuote.toLowerCase();
  if (/^aes-256/i.test(clause)) return /each data store has its own aes-256 key|per-store/.test(q) ? "AES-256 per-store keys" : "AES-256";
  if (/key management model/i.test(clause)) return q.includes("kms") && q.includes("customer-managed") ? "the KMS customer-managed key model" : "the key management model";
  if (/rotation period/i.test(clause)) return /annual/.test(q) ? "annual rotation" : "the rotation period";
  if (/custodian/i.test(clause)) return "the key custodians";
  return `the ${clauseNoun(clause)}`;
}

/**
 * Suggested reason for Return to author, built from the finding: the clauses the verified sentence
 * supported that no file now supports, where it was, and the standard. For the hero this reads:
 * "architecture.md v3 §4.3 no longer states the KMS customer-managed key model, annual rotation or the
 * key custodians; no other file in the package does either. IS-STD-014 §5.1 requires all three. Restore
 * them or cite where they are now documented." The reviewer edits it; it is never sent unedited by code.
 */
export function suggestedReason(store: Store, finding: Finding, control: { standard: string }, st: ControlState): string | null {
  const unsupported = st.clause_support.filter((c) => c.support !== "supported");
  if (!unsupported.length) return null;
  const prior = finding.prior_evidence[0];
  const pvEvent = latestVerification(store.events, finding.control_id);
  // Every unsupported clause is named (judge B2); wording comes from all the verified sentences.
  const verifiedText = [...new Set((pvEvent?.clause_support ?? []).flatMap((c) => (c.quote ? [c.quote.quote] : [])))].join(" ");
  const supportedByVerified = new Set((pvEvent?.clause_support ?? []).filter((c) => c.support === "supported").map((c) => c.clause_id));
  const lost = prior ? unsupported.filter((c) => supportedByVerified.has(c.clause_id)) : [];
  const clauses = unsupported;
  const nouns = clauses.map((c) => reasonNoun(c.clause, verifiedText || prior?.quote || ""));
  const snap = store.snapshot(finding.snapshot_id);
  const where = prior ? snap?.files.find((f) => f.fileId === prior.fileId) : undefined;
  const whereLabel = where ? `${where.fileName} ${where.versionLabel ?? store.versionLabel(where.fileId, where.versionId) ?? ""} ${prior!.section.split(" ")[0]}` : `${st.binding?.fileName ?? "the package"}`;
  const n = nouns.length;
  const one = n === 1;
  return `${whereLabel.replace(/\s+/g, " ").trim()} ${lost.length ? "no longer states" : "does not state"} ${listJoin(nouns, "or")}; no other file in the package does either. ${short(control.standard)} requires ${COUNT_WORDS[n] ?? `all ${n}`}. Restore ${one ? "it" : "them"} or cite where ${one ? "it is" : "they are"} now documented.`;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * UI v4 level-2 verdict: one or two short computed sentences from the clause support counts, the
 * Box AI (or string-search) citation count and the number of files asked. Never evaluative; passes
 * the wording filter. Hero: "4 of 5 clauses unsupported in every file of this snapshot. Box AI found
 * 0 citations across the other 4 files."
 */
export function verdictLine(
  row: RowWithState,
  finding: Finding,
  searchSteps: TraceStep[],
  newLocation: { fileName: string; versionLabel?: string; section?: string } | null,
  filesAsked: (step: TraceStep) => number | undefined,
  coverage?: SearchCoverage,
): string {
  const st = row.state;
  const kind = row.status.kind;
  const clauses = finding.clause_support.length ? finding.clause_support : st.clause_support;
  const n = clauses.length;
  const u = clauses.filter((c) => c.support !== "supported").length;
  let out: string;
  if (kind === "pending_recheck") out = `Re-check in progress on ${st.snapshot_id}.`;
  else if (kind === "not_evaluated") out = `${row.status.label} on ${st.snapshot_id}. No clause was checked.`;
  else if (st.change_classification === "moved" && newLocation) {
    const where = `${newLocation.fileName}${newLocation.versionLabel ? ` ${newLocation.versionLabel}` : ""}${newLocation.section ? ` ${newLocation.section.split(" ")[0]}` : ""}`;
    out = `The same sentence is now in ${where}.`;
  } else if (st.machine_assessment === "evidence_contradicted") out = "Another quote in this snapshot conflicts with the verified evidence.";
  else if (st.machine_assessment === "evidence_weakened" || st.machine_assessment === "evidence_absent") {
    const cited = searchSteps.reduce((a, s) => a + (Number((s.result as { cited_statements?: number } | undefined)?.cited_statements) || 0), 0);
    const files = Math.max(0, ...searchSteps.map((s) => filesAsked(s) ?? 0));
    const fallback = searchSteps.length > 0 && searchSteps.every((s) => s.tool === "string_search" || (s.args as { mode?: string } | undefined)?.mode === "string_search");
    // Codex 22: "every file" only when every pinned file was read and the search covered all but the primary file.
    const complete = !!coverage && coverage.complete;
    const first = !searchSteps.length
      ? `${u} of ${plural(n, "clause")} unsupported on ${st.snapshot_id}.`
      : complete
        ? `${u} of ${plural(n, "clause")} unsupported in every file of this snapshot.`
        : `${u} of ${plural(n, "clause")} unsupported in the files checked: ${listJoin(coverage?.checked ?? [])}.${coverage?.not_read.length ? ` ${listJoin(coverage.not_read)} ${coverage.not_read.length === 1 ? "was" : "were"} not read.` : " Not every file was searched."}`;
    const second = !searchSteps.length
      ? ""
      : fallback
        ? ` A text search found ${plural(cited, "match", "matches")}${files ? ` across the other ${plural(files, "file")}` : ""}.`
        : ` Box AI found ${plural(cited, "citation")}${files ? ` across the other ${plural(files, "file")}` : ""}.`;
    out = first + second;
  } else if (st.change_classification === "unchanged" && st.acknowledgment_required) {
    out = st.acknowledgment_reason === "evidencing section changed"
      ? "The section around the verified sentence was rewritten. The sentence is unchanged."
      : "The file holding the verified sentence changed. The sentence is unchanged.";
  } else if (st.change_classification === "unchanged" && (st.prior_verification || finding.prior_evidence.length)) out = "The verified sentence is unchanged.";
  else out = n ? `All ${plural(n, "clause")} have a validated quote on ${st.snapshot_id}.` : `Evidence found on ${st.snapshot_id}.`;
  return bannedWords(out).length ? "See the clauses below." : out;
}

/** Which pinned files the evaluator read and the control's search asked (Codex 22). */
export interface SearchCoverage {
  complete: boolean;
  checked: string[];
  not_read: string[];
}

export function searchCoverage(store: Store, snapshotId: string, asked: string[][]): SearchCoverage {
  const snap = store.snapshot(snapshotId);
  const names = snap?.files.map((f) => f.fileName) ?? [];
  const attempt = [...store.events].reverse().find((e) => e.event_type === "evaluation_attempt" && e.snapshot_id === snapshotId);
  const withheld = ((attempt?.files_withheld as { fileName: string }[] | undefined) ?? []).map((w) => w.fileName);
  const given = (attempt?.files_given as string[] | undefined) ?? names.filter((n) => !withheld.includes(n));
  const searched = new Set(asked.flat());
  const unsearched = given.filter((n) => !searched.has(n)); // the primary file is read directly, not searched
  const complete = !!attempt && withheld.length === 0 && given.length === names.length && unsearched.length <= 1;
  return { complete, checked: given, not_read: names.filter((n) => !given.includes(n)) };
}

/**
 * Why the "now" side of the quote pair shows no sentence (Codex 15). Proven absence only for evidence_absent;
 * otherwise the text was not checked (unreadable, quarantined, pending) or the binding has no quote.
 */
export function quotePairNote(row: RowWithState): string {
  const st = row.state;
  if (row.status.kind === "pending_recheck" || st.evaluation_state === "pending") return "The re-check is still running; no current sentence yet.";
  if (row.status.kind === "not_evaluated") {
    if (st.not_evaluated_reason?.code === "input_gate") return "The current file was withheld by the input gate, so no sentence was checked.";
    if (/unreadable/.test(row.status.label)) return "The current file could not be read, so no sentence was checked.";
    return "This control was not evaluated on this snapshot, so no sentence was checked.";
  }
  if (st.machine_assessment === "evidence_absent") return "No sentence in the current snapshot supports this control.";
  return "No current sentence is bound to this control.";
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const proseDate = (iso?: string) => {
  const m = iso ? /^(\d{4})-(\d\d)-(\d\d)/.exec(iso) : null;
  return m ? `${MONTHS[Number(m[2]) - 1]} ${Number(m[3])}` : "";
};
const secShort = (s?: string) => (s ? s.split(" ")[0] : "");
const safe = (t: string, fallback: string) => (bannedWords(t).length ? fallback : t);

/**
 * UI v4.1 level 2: AGREED (the verified commitment) and CHANGED IN (where the new document changed it),
 * with engine headings, and the "Open in document" target. Built from the card's own version blocks.
 */
export function agreedAndChanged(
  row: RowWithState,
  prior: FindingCard["prior_version"],
  now: FindingCard["new_version"],
  moved: boolean,
): Pick<FindingCard, "agreed" | "changed" | "open_in_document"> {
  const st = row.state;
  const agreed: FindingCard["agreed"] = prior
    ? {
        quote: prior.quote,
        file: prior.file.fileName,
        file_id: prior.file.fileId,
        version_id: prior.file.versionId,
        ...(prior.file.versionLabel ? { version_label: prior.file.versionLabel } : {}),
        ...(prior.section ? { section: prior.section } : {}),
        ...(prior.verified_by ? { verified_by: prior.verified_by } : {}),
        ...(prior.verified_at ? { verified_at: prior.verified_at } : {}),
        byline: safe(
          [prior.verified_by ? `Verified by ${prior.verified_by}` : "Verified", `${prior.file.versionLabel ?? ""} ${secShort(prior.section)}`.trim(), proseDate(prior.verified_at)].filter(Boolean).join(" · "),
          "Verified",
        ),
      }
    : null;
  const where = (n: NonNullable<FindingCard["new_version"]>) => `${n.file.fileName}${n.file.versionLabel ? ` ${n.file.versionLabel}` : ""}${n.section ? ` ${secShort(n.section)}` : ""}`;
  const block = (kind: NonNullable<FindingCard["changed"]>["kind"], heading: string, n: NonNullable<FindingCard["new_version"]>, quote?: string | null): NonNullable<FindingCard["changed"]> => ({
    kind,
    heading: safe(heading, "Changed"),
    ...(quote ? { quote } : {}),
    file: n.file.fileName,
    file_id: n.file.fileId,
    ...(n.file.versionLabel ? { version_label: n.file.versionLabel } : {}),
    version_id: n.file.versionId,
    ...(n.section ? { section: n.section } : {}),
  });
  let changed: FindingCard["changed"] = null;
  const k = row.status.kind;
  if (k === "pending_recheck" || st.evaluation_state === "pending") changed = null;
  else if (k === "not_evaluated") {
    changed = now ? block("none", `Not checked in ${now.file.fileName}${now.file.versionLabel ? ` ${now.file.versionLabel}` : ""}`, now) : null;
  } else if (moved && now) changed = block("moved", `Now in ${where(now)}`, now, now.quote);
  else if (st.change_classification === "unchanged" && st.acknowledgment_required && now) {
    changed = block("section_changed", `Section changed around it · ${`${now.file.versionLabel ?? ""} ${secShort(now.section)}`.trim()}`, now, now.quote ?? st.binding?.quote);
  } else if (st.change_classification === "unchanged") changed = null; // a hold: nothing changed the commitment
  else if (now && prior && ["evidence_weakened", "evidence_absent", "evidence_contradicted"].includes(st.machine_assessment)) {
    changed = block("replaced", `Changed in ${where(now)}`, now, now.quote);
  }
  const open = changed
    ? { file_id: changed.file_id, version_id: changed.version_id, ...(changed.quote ? { sentence: changed.quote } : {}) }
    : st.binding
      ? { file_id: st.binding.fileId, version_id: st.binding.versionId, sentence: st.binding.quote }
      : agreed
        ? { file_id: agreed.file_id, version_id: agreed.version_id, sentence: agreed.quote }
        : undefined;
  return { agreed, changed, ...(open ? { open_in_document: open } : {}) };
}

export function buildFindingCard(store: Store, profile: ControlProfile, config: KeelConfig, finding: Finding & { run_id?: string }): FindingCard {
  const control = profile.controls.find((c) => c.id === finding.control_id)!;
  const currentId = store.data.current_snapshot_id ?? finding.snapshot_id;
  const rows = buildRows(store, profile, currentId);
  const row = rows.find((r) => r.control_id === control.id)!;
  const st = row.state;

  // Prior version: the verification the finding was evaluated against.
  const prior = finding.prior_evidence[0] ?? null;
  const priorText = prior ? store.text(prior.versionId) : undefined;
  const pBlock = prior ? blockText(priorText, prior.quote) : {};
  const priorInfo = prior ? store.versionInfo(prior.fileId, prior.versionId) : undefined;

  // New version: the same file in the finding's snapshot (word diff), else the new binding's file.
  const snap = store.snapshot(finding.snapshot_id);
  const binding: EvidenceRef | null = finding.evidence[0] ?? null;
  const sameFile = prior ? snap?.files.find((f) => f.fileId === prior.fileId) : undefined;
  const bindingFile = binding ? snap?.files.find((f) => f.fileId === binding.fileId) : undefined;
  // Moved binding (judge A1): the new version block describes the NEW binding; the old location goes behind a disclosure.
  const moved = finding.change_classification === "moved" && !!bindingFile;
  const newFile = moved ? bindingFile : (sameFile ?? bindingFile);
  const newText = newFile ? store.text(newFile.versionId) : undefined;
  const newQuote = binding && newFile && binding.fileId === newFile.fileId ? binding.quote : null;
  const nBlock = newFile ? blockText(newText, newQuote, moved ? binding?.section : (prior?.section ?? binding?.section)) : {};
  let old_location: FindingCard["old_location"] = null;
  if (moved && prior && sameFile) {
    const oldText = store.text(sameFile.versionId);
    const oldSec = oldText ? sectionByLabel(oldText, prior.section) : null;
    const oldLabel = sameFile.versionLabel ?? store.versionLabel(sameFile.fileId, sameFile.versionId) ?? sameFile.versionId;
    old_location = {
      file: { ...sameFile, versionLabel: oldLabel },
      section: oldSec?.label ?? prior.section,
      text: oldSec?.body,
      note: `${sameFile.fileName} ${oldLabel} ${(oldSec?.label ?? prior.section).split(" ")[0]} no longer contains the quote`,
    };
  }
  const newInfo = newFile ? store.versionInfo(newFile.fileId, newFile.versionId) : undefined;
  const newLoc = newQuote && binding ? binding : null;

  const needsReview = NEEDS_REVIEW_KINDS.includes(row.status.kind) || row.status.kind === "not_evaluated" || row.status.kind === "pending_review";
  const rta: FindingCard["actions"]["return_to_author"] = {
    enabled: needsReview && !!st.open_task && st.evaluation_state !== "pending",
    reason: !needsReview ? `Return to author applies to rows that need review; this row reads "${row.status.label}".` : !st.open_task ? `No open review task for ${control.id}.` : st.evaluation_state === "pending" ? "Re-check pending." : undefined,
    default_due_at: addBusinessDays(new Date(), profile.default_remediation_window_business_days),
    author: config.author.name,
  };
  // A starting point for the reviewer's reason, built from the unsupported clauses; the reviewer edits it.
  if (rta.enabled) rta.suggested_reason = suggestedReason(store, finding, control, st) ?? undefined;

  const thread = store.events
    .filter((e) => e.control_id === control.id)
    .slice()
    .reverse();
  const authorIdx = thread.findIndex((e) => e.event_type === "box_task_created" && ((e.task as { kind?: string } | undefined)?.kind === "author" || (e.task as { kind?: string } | undefined)?.kind === "author_remediation"));
  if (authorIdx > 0) thread.unshift(...thread.splice(authorIdx, 1));

  const run = finding.run_id ? store.data.runs[finding.run_id] : undefined;
  const trace_steps: TraceStep[] = (run?.steps ?? []).filter(
    (s) => (s.args as { control_id?: string } | undefined)?.control_id === control.id || s.label.includes(`(${control.id})`),
  );

  const decision = finding.snapshot_id;
  const decisionRow = decision === currentId ? row : buildRows(store, profile, decision).find((r) => r.control_id === control.id);
  const binding_fresh = decision === currentId || bindingsEqual(decisionRow?.state.binding, st.binding);

  const opened = store.events.find((e) => e.control_id === control.id && e.snapshot_id === finding.snapshot_id && e.finding_id === finding.finding_id);
  const waiting = Object.values(store.data.processing ?? {}).filter((p) => p.stage === "awaiting_draft" && p.control_id === control.id).at(-1);
  const waitingResponse = waiting ? store.events.find((e) => e.event_id === waiting.ingest_event_id)?.response as { message?: string } | undefined : undefined;
  const draft = waiting ? store.data.drafts[waiting.finding_id] : undefined;
  // C12: sections quoted for the current binding's file.
  const binding_sections = binding
    ? [...new Set(finding.clause_support.flatMap((c) => (c.quote && c.quote.fileId === binding.fileId ? [c.quote.section] : [])).filter(Boolean))]
    : [];
  // C13: verified sentences that supported a clause and are no longer in the submitted version of that file.
  const pvEv = latestVerification(store.events, control.id, store.events.findIndex((e) => e.snapshot_id === finding.snapshot_id && e.event_type === "snapshot_captured") + 1 || undefined);
  const removedMap = new Map<string, { quote: string; section: string; supported_clauses: string[] }>();
  for (const c of pvEv?.clause_support ?? []) {
    if (!c.quote || c.support !== "supported") continue;
    const nowFile = snap?.files.find((f) => f.fileId === c.quote!.fileId);
    const nowText = nowFile ? store.text(nowFile.versionId) : undefined;
    if (nowText && quoteValid(c.quote.quote, nowText)) continue;
    const r = removedMap.get(c.quote.quote) ?? { quote: c.quote.quote, section: c.quote.section, supported_clauses: [] };
    r.supported_clauses.push(c.clause);
    removedMap.set(c.quote.quote, r);
  }
  const verifiedText = [...removedMap.keys()].join(" ");
  // UI v4: the verdict sentence and the receipt.
  const searchSteps = (run?.steps ?? []).filter((s) => isSearchStep(s) && (s.args as { control_id?: string } | undefined)?.control_id === control.id);
  const filesAsked = (s: TraceStep) => {
    const q = (s.args as { query?: string } | undefined)?.query;
    const ask = q ? run?.box_ai_asks?.find((a) => a.query === q) : undefined;
    return ask?.files_asked.length ?? (Number(/over (\d+) files?/.exec(s.label)?.[1]) || undefined);
  };
  const newLocation = moved && newFile && binding ? { fileName: newFile.fileName, versionLabel: newFile.versionLabel ?? newInfo?.label, section: binding.section } : null;
  const askedLists = searchSteps.map((s) => {
    const q = (s.args as { query?: string } | undefined)?.query;
    return (q ? run?.box_ai_asks?.find((a) => a.query === q)?.files_asked : undefined) ?? [];
  });
  const verdict_line = verdictLine(row, finding, searchSteps, newLocation, filesAsked, searchCoverage(store, finding.snapshot_id, askedLists));
  const receipt = currentId === st.snapshot_id ? receiptFor(store, row) : null;
  const priorBlock: FindingCard["prior_version"] = prior
    ? { file: snapshotFile(store, prior.fileId, prior.versionId, prior.fileName), verified_by: prior.verified_by, verified_at: prior.verified_at, section: prior.section || pBlock.section, quote: prior.quote }
    : null;
  const nowBlock: FindingCard["new_version"] = newFile
    ? { file: { ...newFile, versionLabel: newFile.versionLabel ?? newInfo?.label }, section: newLoc?.section ?? nBlock.section, quote: newQuote }
    : null;
  const v41 = agreedAndChanged(row, priorBlock, nowBlock, moved);
  return {
    ...v41,
    timeline: controlTimeline(store, profile, control.id),
    verdict_line,
    receipt,
    ...(newQuote ? {} : { quote_pair_note: quotePairNote(row) }),
    opened_at: opened?.ts,
    binding_sections,
    // A moved binding kept its support in another file: listing the old sentence would read as lost support.
    removed_sentences: moved ? [] : [...removedMap.values()].map((r) => ({ ...r, label: listJoin(r.supported_clauses.map((c) => reasonNoun(c, verifiedText).replace(/^the /, ""))) })),
    ...(waiting ? { pending_author_draft: { reason: waitingResponse?.message ?? "", draft: draft?.text, drafted_by: draft?.drafted_by, task_id: waiting.task_id, snapshot_id: waiting.target_snapshot_id } } : {}),
    finding,
    control,
    profile_version: profile.profile_version,
    row: { ...publicRow(row), ...decisionFlags(store, row) },
    prior_version: prior
      ? {
          file: snapshotFile(store, prior.fileId, prior.versionId, prior.fileName),
          uploader: priorInfo?.uploader,
          verified_by: prior.verified_by,
          verified_role: prior.verified_role,
          verified_at: prior.verified_at,
          section: prior.section || pBlock.section,
          page: prior.page,
          quote: prior.quote,
          deep_link: prior.box_deep_link,
          text: pBlock.raw,
        }
      : null,
    old_location,
    new_version: newFile
      ? {
          file: { ...newFile, versionLabel: newFile.versionLabel ?? newInfo?.label },
          uploader: newInfo?.uploader,
          version_comment: newInfo?.comment,
          section: newLoc?.section ?? nBlock.section,
          page: newLoc?.page,
          quote: newQuote,
          deep_link: `https://app.box.com/file/${newFile.fileId}?version=${newFile.versionId}`,
          text: nBlock.raw,
        }
      : null,
    related: rows.filter((r) => r.control_id !== control.id).map((r) => ({ ...publicRow(r), ...decisionFlags(store, r) })),
    actions: {
      return_to_author: rta,
      verify: verifyAction(st, row, profile.attestation_phrase),
      proposed: ["not_applicable", "compensating_control", "exception_requested", "false_positive"],
    },
    reviewer: {
      name: config.reviewer.name,
      role: config.reviewer.role,
      box_user_id: config.reviewer.box_user_id,
      source: config.mockMode ? `${REVIEWER_IDENTITY_SOURCE}; mock Box, simulated identity` : REVIEWER_IDENTITY_SOURCE,
    },
    binding_fresh,
    thread: thread as LedgerEvent[],
    trace_steps,
  };
}
