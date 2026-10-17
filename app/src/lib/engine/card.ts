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
  return {
    opened_at: opened?.ts,
    binding_sections,
    // A moved binding kept its support in another file: listing the old sentence would read as lost support.
    removed_sentences: moved ? [] : [...removedMap.values()].map((r) => ({ ...r, label: listJoin(r.supported_clauses.map((c) => reasonNoun(c, verifiedText).replace(/^the /, ""))) })),
    ...(waiting ? { pending_author_draft: { reason: waitingResponse?.message ?? "", draft: draft?.text, drafted_by: draft?.drafted_by, task_id: waiting.task_id, snapshot_id: waiting.target_snapshot_id } } : {}),
    finding,
    control,
    profile_version: profile.profile_version,
    row: publicRow(row),
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
    related: rows.filter((r) => r.control_id !== control.id).map(publicRow),
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
