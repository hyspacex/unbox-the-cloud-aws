/** The sixteen display rules, staleness by tier (acceptance 3, 4), assessment precedence, classification. */
import { describe, expect, it } from "vitest";
import { countLine, displayStatus, RULES, weakenedLabel, clauseNoun } from "../src/lib/engine/display";
import { verificationHolds, stalenessEventType } from "../src/lib/engine/staleness";
import { classifyChange, deriveAssessment, selectBinding } from "../src/lib/engine/assess";
import { addBusinessDays } from "../src/lib/engine/disposition";
import { wordDiff } from "../src/lib/engine/diff";
import type { ClauseSupport, DisplayInputs, DispositionRecord, EvidenceRef, PriorVerification } from "../src/lib/types";

const PV: PriorVerification = { actor: "Priya Natarajan", role: "Principal Security Architect, ARB reviewer", snapshot_id: "S2", fileId: "f1", fileName: "architecture.md", versionId: "v2id", verified_at: "2026-10-08T10:32:00Z", event_id: "EVT-0044" };
const BINDING = { fileId: "f1", fileName: "architecture.md", versionId: "v3id", section: "§4.3 Data protection at rest", quote: "q" };
const disp = (d: DispositionRecord["disposition"], extra: Partial<DispositionRecord> = {}): DispositionRecord => ({
  disposition: d,
  actor: { name: "Dana Okafor", role: "ARB reviewer, Technology Resilience" },
  recorded_at: "2026-10-17T15:33:54Z",
  snapshot_id: "S4",
  binding: { fileId: "f1", fileName: "architecture.md", versionId: "v3id", quote: "q" },
  ...extra,
});
const base = (o: Partial<DisplayInputs> = {}): DisplayInputs => ({
  current_snapshot_id: "S4",
  current_disposition: null,
  prior_verification: null,
  verification_holds: false,
  acknowledgment_required: false,
  machine_assessment: "evidence_found",
  change_classification: "none",
  unsupported_clauses: [],
  evaluation_state: "complete",
  tier: "Critical",
  current_binding: BINDING,
  ...o,
});
const label = (f: string, v: string) => ({ v2id: "v2", v3id: "v3" })[v] ?? `${f}:${v}`;

describe("display: the sixteen ordered rules (spec 4)", () => {
  const cases: [number, DisplayInputs, string, string][] = [
    [1, base({ evaluation_state: "pending", prior_displayed_status: "Verified, holds" }), "Re-check pending", "PENDING"],
    [2, base({ machine_assessment: "not_evaluated", evaluation_reason: "architecture.md v3 could not be read", evaluation_reason_code: "TEXT_REPRESENTATION_NOT_READY" }), "Not evaluated: file unreadable", "NOT_EVALUATED"],
    [3, base({ current_disposition: disp("superseded", { profile_version: "2026.4" }) }), "Superseded, re-verify under profile v2026.4", "PENDING"],
    [4, base({ current_disposition: disp("not_applicable") }), "Not applicable", "NOT_APPLICABLE"],
    [5, base({ current_disposition: disp("exception_approved", { expires_at: "2027-06-30T00:00:00Z" }) }), "Exception approved until 2027-06-30", "EXCEPTION"],
    [6, base({ current_disposition: disp("exception_requested") }), "Exception requested", "EXCEPTION"],
    [7, base({ current_disposition: disp("compensating_control") }), "Compensating control", "EXCEPTION"],
    [8, base({ current_disposition: disp("returned_to_author", { due_at: "2026-10-23T17:00:00Z" }), machine_assessment: "evidence_weakened" }), "Returned to author, open", "RETURNED_TO_AUTHOR"],
    [9, base({ current_disposition: disp("verified") }), "Verified", "VERIFIED"],
    [10, base({ prior_verification: PV, verification_holds: true, change_classification: "unchanged" }), "Verified, holds", "VERIFIED_HOLDS"],
    [11, base({ prior_verification: PV, change_classification: "unchanged", acknowledgment_required: true, acknowledgment_reason: "evidencing file changed" }), "Acknowledge: evidencing file changed", "ACKNOWLEDGE"],
    [12, base({ prior_verification: PV, change_classification: "moved", tier: "High" }), "Needs review: evidence binding changed", "NEEDS_REVIEW_BINDING"],
    [13, base({ prior_verification: PV, machine_assessment: "evidence_weakened", change_classification: "weakened", unsupported_clauses: ["AES-256 stated", "key management model stated (AWS KMS customer-managed keys or CipherTrust)"] }), "Needs review: key-management evidence missing", "NEEDS_REVIEW_WEAKENED"],
    [14, base({ prior_verification: PV, machine_assessment: "evidence_absent", change_classification: "removed" }), "Needs review: evidence lost", "NEEDS_REVIEW_ABSENT"],
    [15, base({ prior_verification: PV, machine_assessment: "evidence_contradicted", change_classification: "contradicted" }), "Needs review: conflicting evidence", "NEEDS_REVIEW_CONFLICT"],
    [16, base(), "Pending review", "PENDING"],
  ];
  it.each(cases)("rule %i", (rule, inputs, expectedLabel, code) => {
    const s = displayStatus(inputs, { versionLabel: label, now: new Date("2026-10-17T00:00:00Z") });
    expect(s.rule).toBe(rule);
    expect(s.label).toBe(expectedLabel);
    expect(s.projection_code).toBe(code);
  });

  it("every published rule is reachable and numbered 1 to 16 in order", () => {
    expect(RULES.map((r) => r.rule)).toEqual(Array.from({ length: 16 }, (_, i) => i + 1));
    expect(cases.map((c) => c[0]).sort((a, b) => a - b)).toEqual(RULES.map((r) => r.rule));
  });

  it("rule 5 expired, and rule 1 carries the prior status struck through", () => {
    expect(displayStatus(base({ current_disposition: disp("exception_approved", { expires_at: "2026-01-01T00:00:00Z" }) }), { now: new Date("2026-10-17T00:00:00Z") }).label).toBe("Exception expired, re-review due");
    expect(displayStatus(base({ evaluation_state: "pending", prior_displayed_status: "Verified, holds" })).struck).toBe("Verified, holds");
  });

  it("rule 11 section variant (High) and severities", () => {
    const s = displayStatus(base({ tier: "High", prior_verification: PV, change_classification: "unchanged", acknowledgment_required: true, acknowledgment_reason: "evidencing section changed" }));
    expect(s.label).toBe("Acknowledge: evidencing section changed");
    expect(s.severity).toBe("High");
    expect(displayStatus(cases[11][1]).severity).toBe("Low");
    expect(displayStatus(cases[12][1]).severity).toBe("Critical");
  });

  it("green only for a human Verified on the current snapshot and binding (rule 9)", () => {
    for (const [rule, inputs] of cases) {
      const s = displayStatus(inputs, { now: new Date("2026-10-17T00:00:00Z") });
      expect(s.tone === "green", `rule ${rule}`).toBe(rule === 9);
    }
    // Verified on an older snapshot or another binding is not rule 9.
    expect(displayStatus(base({ current_disposition: disp("verified", { snapshot_id: "S3" }), prior_verification: PV })).rule).not.toBe(9);
    expect(displayStatus(base({ current_disposition: disp("verified", { binding: { fileId: "f1", fileName: "architecture.md", versionId: "other" } }) })).rule).not.toBe(9);
  });

  it("acceptance 13: the prior verification is the secondary line, never the current disposition", () => {
    const s = displayStatus(base({ prior_verification: PV, verification_holds: true, change_classification: "unchanged" }), { versionLabel: label });
    expect(s.secondary).toBe("Verified by Priya Natarajan, Principal Security Architect, ARB reviewer, on architecture.md v2, 2026-10-08T10:32:00Z");
    expect(s.kind).toBe("verified_holds");
  });

  it("weakened labels: clause-group mapping, then a generic noun phrase", () => {
    expect(weakenedLabel(["rotation period stated (at least annually)"])).toBe("Needs review: rotation period missing");
    expect(weakenedLabel([])).toBe("Needs review: clause missing");
    expect(clauseNoun("key custodians named")).toBe("key custodians");
    expect(clauseNoun("key management model stated (AWS KMS customer-managed keys or CipherTrust)")).toBe("key model");
  });

  it("count line counts displayed outcomes in the fixture's order", () => {
    const rows = [10, 10, 10, 10, 10].map(() => ({ status: displayStatus(cases[9][1]) }));
    rows.push({ status: displayStatus(base({ tier: "High", prior_verification: PV, change_classification: "unchanged", acknowledgment_required: true, acknowledgment_reason: "evidencing section changed" })) });
    rows.push({ status: displayStatus(cases[11][1]) });
    rows.push({ status: displayStatus(cases[12][1]) });
    expect(countLine(rows, "S4")).toBe("8 controls on snapshot S4: 5 Verified holds, 1 Acknowledge (High), 1 Needs review (Low), 1 Needs review (Critical)");
  });
});

describe("staleness by tier materiality (spec 3 step 8; acceptance 3, 4)", () => {
  const prior = { fileId: "f1", fileName: "architecture.md", versionId: "v2id", versionLabel: "v2", section: "§4.2 Privileged access", quote: "q" };
  const next = { ...prior, versionId: "v3id", versionLabel: "v3" };
  it("Critical: acknowledge when the evidencing file version changed, even with the quote unchanged", () => {
    const r = verificationHolds({ prior, binding: next, classification: "unchanged", tier: "Critical", materiality: "acknowledge_on_evidencing_file_change" });
    expect(r).toMatchObject({ holds: false, acknowledgment_required: true, reason: "evidencing file changed" });
    expect(r.note).toBe("evidencing file version changed (architecture.md v2 to v3); tier Critical requires acknowledgment");
    expect(stalenessEventType(r, "unchanged")).toBe("verification_requires_acknowledgment");
  });
  it("High: acknowledge when the section changed around an unchanged quote (SEC-ARCH-05)", () => {
    const r = verificationHolds({ prior, binding: next, classification: "unchanged", tier: "High", materiality: "acknowledge_on_evidencing_section_change", sectionTextChanged: true });
    expect(r).toMatchObject({ holds: false, acknowledgment_required: true, reason: "evidencing section changed" });
    expect(r.note).toBe("evidencing file version changed (architecture.md v2 to v3); cited quote unchanged; evidencing section §4.2 text changed; tier High requires acknowledgment");
  });
  it("High: holds after the file changed when the section is unchanged (acceptance 3)", () => {
    const r = verificationHolds({ prior, binding: next, classification: "unchanged", tier: "High", materiality: "acknowledge_on_evidencing_section_change", sectionTextChanged: false });
    expect(r.holds).toBe(true);
    expect(stalenessEventType(r, "unchanged")).toBe("verification_holds");
  });
  it("Medium: holds when the quote is unchanged", () => {
    expect(verificationHolds({ prior, binding: next, classification: "unchanged", tier: "Medium", materiality: "hold_if_quote_unchanged" }).holds).toBe(true);
  });
  it("any tier holds when the evidencing file version is unchanged", () => {
    expect(verificationHolds({ prior, binding: prior, classification: "unchanged", tier: "Critical", materiality: "acknowledge_on_evidencing_file_change" })).toMatchObject({ holds: true, acknowledgment_required: false });
  });
  it("a moved binding never holds and writes binding_changed; no prior verification -> nothing", () => {
    const r = verificationHolds({ prior, binding: { ...next, fileId: "f2" }, classification: "moved", tier: "High", materiality: "acknowledge_on_evidencing_section_change" });
    expect(r.holds).toBe(false);
    expect(stalenessEventType(r, "moved")).toBe("binding_changed");
    expect(verificationHolds({ prior: null, binding: next, classification: "none", tier: "High", materiality: "acknowledge_on_evidencing_section_change" }).holds).toBeNull();
  });
});

describe("assessment and classification (spec 4)", () => {
  const q = (quote: string, versionId = "v3id"): EvidenceRef => ({ fileId: "f1", fileName: "architecture.md", versionId, section: "§4.3", quote });
  const cs = (...s: (EvidenceRef | null)[]): ClauseSupport[] => s.map((x, i) => ({ clause_id: `C.${i + 1}`, clause: `clause ${i + 1}`, support: x ? "supported" : "unsupported", quote: x }));
  it("all/some/none and precedence not_evaluated > contradicted > absent > weakened > found", () => {
    expect(deriveAssessment(cs(q("a"), q("a")))).toBe("evidence_found");
    expect(deriveAssessment(cs(q("a"), null))).toBe("evidence_weakened");
    expect(deriveAssessment(cs(null, null))).toBe("evidence_absent");
    expect(deriveAssessment(cs(q("a"), q("a")), { conflicting: true })).toBe("evidence_contradicted");
    expect(deriveAssessment(cs(null, null), { conflicting: true })).toBe("evidence_absent");
    expect(deriveAssessment(cs(q("a"), q("a")), { conflicting: true, notEvaluatedReason: { code: "x", message: "y" } })).toBe("not_evaluated");
  });
  it("binding = quote supporting the most clauses", () => {
    const sel = selectBinding(cs(q("roles"), q("pam"), q("pam"), q("pam")));
    expect(sel.binding?.quote).toBe("pam");
    expect(sel.evidence.map((e) => e.quote)).toEqual(["pam", "roles"]);
  });
  it("classification against the prior binding", () => {
    const prior = { binding: { fileId: "f1", versionId: "v2id", quote: "A sentence." }, assessment: "evidence_found" as const };
    expect(classifyChange(null, "evidence_found", q("x"))).toBe("none");
    expect(classifyChange(prior, "evidence_found", q("a  SENTENCE."))).toBe("unchanged");
    expect(classifyChange(prior, "evidence_weakened", q("x"))).toBe("weakened");
    expect(classifyChange(prior, "evidence_absent", null)).toBe("removed");
    expect(classifyChange(prior, "evidence_contradicted", q("a sentence."))).toBe("contradicted");
    expect(classifyChange(prior, "evidence_found", { ...q("A sentence."), fileId: "f2" })).toBe("moved");
    expect(classifyChange({ ...prior, assessment: "evidence_weakened" }, "evidence_found", q("new"))).toBe("none");
  });
});

describe("helpers", () => {
  it("business days: 5 from Saturday 2026-10-17 is Friday 2026-10-23 at 17:00Z", () => {
    expect(addBusinessDays(new Date("2026-10-17T15:33:54Z"), 5)).toBe("2026-10-23T17:00:00Z");
    expect(addBusinessDays(new Date("2026-10-23T09:00:00Z"), 1)).toBe("2026-10-26T17:00:00Z");
  });
  it("word diff marks removed and inserted runs", () => {
    expect(wordDiff("are not used for operations.", "play no part in day-to-day operations.")).toEqual([
      { type: "del", text: "are not used for" },
      { type: "ins", text: "play no part in day-to-day" },
      { type: "same", text: "operations." },
    ]);
  });
});
