/** Spec section 12 acceptance cases 4 (Critical), 5 to 20, plus identity checks and the fallbacks. */
import { describe, expect, it } from "vitest";
import { fixture } from "../src/lib/fixture";
import { FindingSet } from "../src/lib/agent/schema";
import { MockEvaluator, Q } from "../src/lib/agent/mock-evaluator";
import { findQuote } from "../src/lib/engine/normalize";
import { currentProjection } from "../src/lib/engine/publish";
import { consumerMayTrust } from "../src/lib/engine/projection";
import { buildFindingCard } from "../src/lib/engine/card";
import { verifyChain } from "../src/lib/engine/ledger";
import type { Evaluator, EvaluatorInput } from "../src/lib/agent/evaluator.types";
import { DANA_22, DANA_REASON, harness } from "./helpers";

const ATTEST = "I attest the cited evidence meets the requirement.";
const mockEval = (h: ReturnType<typeof harness>) =>
  new MockEvaluator({ modelId: h.config.modelId, inferenceProfile: h.config.inferenceProfile, promptVersion: h.config.promptVersion, promptHash: h.config.mockPromptHash, timeScale: 0 });

describe("acceptance 4 (Critical): unchanged quote, evidencing file changed", () => {
  it("SEC-ARCH-07 reads Acknowledge: evidencing file changed; High controls with unchanged sections hold", async () => {
    const h = harness();
    const v2 = fixture.text("architecture-v2.md");
    h.box.uploadVersion("architecture.md", v2.replace("Agent training material on reviewing drafts.", "Agent training material on reviewing drafts, updated."), { comment: "Open items table" });
    const r = await h.run();
    expect(r.outcome).toBe("complete");
    const row = h.row("SEC-ARCH-07");
    expect([row.machine_assessment, row.change_classification, row.status.label, row.status.severity]).toEqual(["evidence_found", "unchanged", "Acknowledge: evidencing file changed", "Critical"]);
    expect(h.eventsOf("verification_requires_acknowledgment", "S4").map((e) => e.control_id)).toEqual(["SEC-ARCH-07"]);
    for (const c of ["SEC-ARCH-02", "SEC-ARCH-05", "SEC-ARCH-17", "SEC-ARCH-22"]) expect(h.row(c).status.label, c).toBe("Verified, holds");
    expect(h.countLine()).toBe("8 controls on snapshot S4: 7 Verified holds, 1 Acknowledge (Critical)");
  });
});

describe("acceptance 5 and 14: contradiction", () => {
  it("a retained quote plus a contradicting sub-processor clause is evidence_contradicted, and Verify is blocked", async () => {
    const h = harness();
    await h.run("architecture_v3");
    const r = await h.run("contradiction");
    expect(r.snapshot_id).toBe("S5");
    const row = h.row("SEC-ARCH-20");
    expect([row.machine_assessment, row.change_classification, row.status.label]).toEqual(["evidence_contradicted", "contradicted", "Needs review: conflicting evidence"]);
    expect(row.state.clause_support.every((c) => c.support === "supported")).toBe(true); // full support, still contradicted
    const ev = row.state.evaluation_event!;
    expect((ev.conflicting_quote as { quote: string }).quote).toBe(Q["20halcyon"]);
    const card = buildFindingCard(h.store, h.profile, h.config, h.store.data.findings[row.finding_id!]);
    expect(card.actions.verify.enabled).toBe(false);
    expect(card.actions.verify.reason).toMatch(/conflicts/);
    // Acceptance 14: even an approved response with the attestation phrase does not verify.
    const res = await h.respond("SEC-ARCH-20", "approved", `Looks fine. ${ATTEST}`);
    expect(res.result).toBe("rejected");
    expect(res.explanation).toMatch(/evidence_contradicted/);
    expect(h.eventsOf("human_disposition_recorded", "S5")).toHaveLength(0);
    expect(h.row("SEC-ARCH-20").status.label).toBe("Needs review: conflicting evidence");
  });
});

describe("acceptance 6: faithful paraphrase", () => {
  it("evidence_found and no loss alarm", async () => {
    const h = harness();
    const paraphrase = "All customer data at rest is encrypted with AWS KMS customer-managed keys that are rotated annually, and the Card Servicing Platform leads are the key custodians.";
    h.box.uploadVersion("architecture.md", fixture.text("architecture-v2.md").replace(Q["07"], paraphrase), { comment: "Wording" });
    const inner = mockEval(h);
    const paraphraser: Evaluator = {
      kind: "mock",
      async evaluate(input: EvaluatorInput, tools, onStep) {
        const r = await inner.evaluate(input, tools, onStep);
        const arch = input.files.find((f) => f.file.fileName === "architecture.md")!;
        const loc = findQuote(paraphrase, arch.text)!;
        const f = r.output.findings.find((x) => x.control_id === "SEC-ARCH-07")!;
        f.clause_support = f.clause_support.map((c) =>
          c.clause_id === "SEC-ARCH-07.2" ? c : { clause_id: c.clause_id, support: "supported", quote: { fileName: "architecture.md", versionId: arch.file.versionId, section: loc.section, paragraph: loc.paragraph, page: loc.page, quote: paraphrase } },
        );
        return r;
      },
    };
    await h.run(undefined, paraphraser);
    const row = h.row("SEC-ARCH-07");
    expect(row.machine_assessment).toBe("evidence_found");
    expect(["needs_review_weakened", "needs_review_absent"]).not.toContain(row.status.kind);
    expect(row.state.clause_support.every((c) => c.support === "supported")).toBe(true);
  });
});

describe("acceptance 7 and 15: unreadable file and fabricated quote", () => {
  it("an unreadable evidence location makes the dependent control not_evaluated with the read reason; coverage shows it", async () => {
    const h = harness();
    await h.run("unreadable");
    const row = h.row("SEC-ARCH-01");
    expect(row.machine_assessment).toBe("not_evaluated");
    expect(row.status.projection_code).toBe("NOT_EVALUATED");
    expect(row.state.not_evaluated_reason?.code).toBe("TEXT_REPRESENTATION_NOT_READY");
    expect(row.status.label).toBe("Not evaluated: file unreadable");
    expect(row.status.detail).toMatch(/^approved-services-and-exceptions\.md v2 could not be read/);
    const tf = h.eventsOf("texts_fetched", "S4")[0];
    expect(tf.coverage).toEqual({ readable: 4, total: 5 });
    expect((tf.files as { readable: boolean }[]).filter((f) => !f.readable)).toHaveLength(1);
    // No positive applied anywhere else either: the other seven hold.
    expect(h.countLine()).toBe("8 controls on snapshot S4: 7 Verified holds, 1 Not evaluated");
    expect(h.box.metadata()!.keel_status_SEC_ARCH_01).toBe("NOT_EVALUATED");
  });

  it("a fabricated quote sets that finding to not_evaluated with a quote-validation reason distinct from the read reason", async () => {
    const h = harness();
    const r = await h.run("fabricated_quote");
    expect(r.outcome).toBe("complete");
    const row = h.row("SEC-ARCH-07");
    expect(row.machine_assessment).toBe("not_evaluated");
    expect(row.state.not_evaluated_reason?.code).toBe("QUOTE_NOT_IN_PINNED_TEXT");
    expect(row.state.not_evaluated_reason?.message).toMatch(/SEC-ARCH-07\.3: quote not found in architecture\.md v3/);
    expect(row.state.not_evaluated_reason?.code).not.toBe("TEXT_REPRESENTATION_NOT_READY");
    expect(h.row("SEC-ARCH-22").status.label).toBe("Needs review: evidence binding changed");
  });
});

describe("acceptance 8: a newer snapshot lands before the reviewer responds", () => {
  it("binding unchanged: the action is re-applied to the new snapshot with notice", async () => {
    const h = harness();
    await h.run("architecture_v3");
    const taskA = h.openTask("SEC-ARCH-07")!;
    h.box.uploadVersion("vendor-contract-summary.md", fixture.text("vendor-contract-summary.md") + "\n", { comment: "whitespace" });
    const r5 = await h.run();
    expect(r5.snapshot_id).toBe("S5");
    expect(r5.tasks.map((t) => t.control_id)).not.toContain("SEC-ARCH-07"); // carried over, not duplicated
    const res = await h.respond("SEC-ARCH-07", "rejected", DANA_REASON, { taskId: taskA.task_id, decision_snapshot_id: "S4" });
    expect(res.result).toBe("reapplied");
    expect(res.events.map((e) => e.event_type)).toContain("action_reapplied");
    const d = res.events.find((e) => e.event_type === "human_disposition_recorded")!;
    expect(d.snapshot_id).toBe("S5");
    expect(h.row("SEC-ARCH-07").status.label).toBe("Returned to author, open");
  });

  it("binding changed: the action is rejected with what changed", async () => {
    const h = harness();
    await h.run("architecture_v3");
    const taskA = h.openTask("SEC-ARCH-07")!;
    h.box.uploadVersion("architecture.md", fixture.text("architecture-v3.md").replace(Q["07w"], "All customer data is protected with strong encryption."), { comment: "v4" });
    await h.run();
    const res = await h.respond("SEC-ARCH-07", "rejected", DANA_REASON, { taskId: taskA.task_id, decision_snapshot_id: "S4" });
    expect(res.result).toBe("rejected");
    expect(res.explanation).toMatch(/binding changed since the decision: architecture\.md v3 §4\.3 on S4 is now/);
    expect(res.events.map((e) => e.event_type)).toEqual(["box_task_response_ingested", "action_rejected_stale"]);
    expect(h.eventsOf("human_disposition_recorded", "S5")).toHaveLength(0);
  });
});

describe("acceptance 9: late results", () => {
  it("an evaluation that finishes after a newer snapshot became current is recorded as history only", async () => {
    const h = harness();
    const inner = mockEval(h);
    const slow: Evaluator = {
      kind: "mock",
      async evaluate(input, tools, onStep) {
        const r = await inner.evaluate(input, tools, onStep);
        // Meanwhile a newer snapshot became the authoritative current snapshot.
        h.store.data.snapshots.push({ ...h.store.snapshot("S3")!, snapshot_id: "S5" });
        h.store.data.current_snapshot_id = "S5";
        return r;
      },
    };
    const before = h.store.events.filter((e) => e.event_type === "box_metadata_written").length;
    const r = await h.run("architecture_v3", slow);
    expect(r.outcome).toBe("late_result");
    expect(h.eventsOf("late_result_recorded", "S4")).toHaveLength(1);
    expect(h.eventsOf("control_evaluated", "S4")).toHaveLength(0);
    expect(h.store.events.filter((e) => e.event_type === "box_metadata_written")).toHaveLength(before);
    expect(h.store.data.current_snapshot_id).toBe("S5");
  });

  it("a response for an older snapshot after a newer human decision is recorded as history; display unchanged", async () => {
    const h = harness();
    await h.run("architecture_v3");
    // A second, older review task for SEC-ARCH-07 on S4 (e.g. a delayed duplicate request).
    const { task_id } = await h.box.createTask("1650233401", "late", "review");
    const asg = await h.box.assignTask(task_id, { id: h.config.reviewer.box_user_id });
    h.store.data.tasks.push({ task_id, assignment_id: asg.assignment_id, action: "review", fileId: "1650233401", assignee: "Dana Okafor", assignee_box_user_id: "30118804", finding_id: "KEEL-2026-0405", control_id: "SEC-ARCH-07", snapshot_id: "S4", message: "late", kind: "reviewer", status: "open", created_at: "" });
    h.store.data.task_mappings[asg.assignment_id] = { task_id, assignment_id: asg.assignment_id, finding_id: "KEEL-2026-0405", control_id: "SEC-ARCH-07", snapshot_id: "S4", immutable: true };
    h.box.uploadVersion("vendor-contract-summary.md", fixture.text("vendor-contract-summary.md") + "\n", { comment: "whitespace" });
    await h.run(); // S5; task A carried over
    const a = h.store.data.tasks.find((t) => t.task_id === "box-task-77120931")!;
    await h.respond("SEC-ARCH-07", "rejected", DANA_REASON, { taskId: a.task_id, decision_snapshot_id: "S4", completed_at: "2026-10-17T15:40:00Z" });
    expect(h.row("SEC-ARCH-07").status.label).toBe("Returned to author, open");
    const late = await h.respond("SEC-ARCH-07", "approved", ATTEST, { taskId: task_id, decision_snapshot_id: "S4", completed_at: "2026-10-17T15:35:00Z" });
    expect(late.result).toBe("recorded");
    expect(late.events.map((e) => e.event_type)).toEqual(["box_task_response_ingested", "late_result_recorded"]);
    expect(h.row("SEC-ARCH-07").status.label).toBe("Returned to author, open");
  });
});

describe("acceptance 10: model output with an unknown control id or a disposition field", () => {
  it("the strict schema rejects a disposition key", () => {
    const ok = { snapshot_id: "S4", findings: [{ control_id: "SEC-ARCH-07", clause_support: [{ clause_id: "SEC-ARCH-07.1", support: "unsupported", quote: null }], basis: ["b"] }] };
    expect(FindingSet.safeParse(ok).success).toBe(true);
    const bad = structuredClone(ok) as { findings: Record<string, unknown>[] };
    bad.findings[0].disposition = "verified";
    expect(FindingSet.safeParse(bad).success).toBe(false);
  });
  it.each([
    ["unknown_control", "UNKNOWN_CONTROL"],
    ["disposition_field", "SCHEMA_REJECTED"],
  ])("%s: evaluation rejected, every control Not evaluated, nothing applied", async (scenario, code) => {
    const h = harness();
    const r = await h.run(scenario);
    expect(r.outcome).toBe("error");
    expect(r.error?.code).toBe(code);
    expect(h.eventsOf("control_evaluated", "S4")).toHaveLength(0);
    for (const row of h.rows()) expect(row.status.projection_code).toBe("NOT_EVALUATED");
    expect(h.countLine()).toBe("8 controls on snapshot S4: 8 Not evaluated");
  });
});

describe("acceptance 11 and 17: Box metadata write failure", () => {
  it("records box_metadata_write_failed with last_projected_snapshot; Box keeps its previous values; the consumer rule catches it", async () => {
    const h = harness();
    h.box.failNextMetadataWrite();
    await h.run("architecture_v3");
    const failed = h.eventsOf("box_metadata_write_failed", "S4");
    expect(failed).toHaveLength(1);
    expect(failed[0].last_projected_snapshot).toBe("S3");
    expect(failed[0].projection.box_metadata).toBe("failed");
    const proj = currentProjection(h.store, h.profile)!;
    expect(proj.result).toBe("failed");
    expect(proj.last_projected_snapshot).toBe("S3");
    const inBox = h.box.metadata();
    expect(inBox!.keel_snapshot_id).toBe("S3");
    expect(consumerMayTrust(inBox, "S4")).toBe(false);
    // Evaluation is a separate outcome: the rows still show S4's displayed statuses.
    expect(h.countLine()).toBe(fixture.expected().expected_count_line_before);
  });
});

describe("acceptance 12: the same task response delivered twice", () => {
  it("one disposition, one author task, two attempt records", async () => {
    const h = harness();
    await h.run("architecture_v3");
    const first = await h.respond("SEC-ARCH-07", "rejected", DANA_REASON, { completed_at: "2026-10-17T15:33:40Z" });
    const second = await h.respond("SEC-ARCH-07", "rejected", DANA_REASON, { replay: true, taskId: "box-task-77120931" });
    expect(first.result).toBe("applied");
    expect(second.result).toBe("duplicate");
    const ingested = h.store.events.filter((e) => e.event_type === "box_task_response_ingested" && (e.response as { assignment_id: string }).assignment_id === "box-asgn-88120931");
    expect(ingested).toHaveLength(2);
    expect(ingested[1].duplicate).toBe(true);
    expect(h.eventsOf("human_disposition_recorded", "S4")).toHaveLength(1);
    expect(h.store.data.tasks.filter((t) => t.kind === "author")).toHaveLength(1);
  });
});

describe("acceptance 16: missing finding", () => {
  it("evaluation state error, Not evaluated everywhere, no partial application", async () => {
    const h = harness();
    const r = await h.run("missing_finding");
    expect(r.error).toMatchObject({ code: "MISSING_FINDING" });
    expect(h.eventsOf("evaluation_completed", "S4")[0].evaluation_state).toBe("error");
    expect(h.rows().every((x) => x.status.rule === 2)).toBe(true);
    expect(h.rows()[0].status.label).toBe("Not evaluated: evaluation error");
    expect(h.rows()[0].status.detail).toMatch(/^no finding for SEC-ARCH-20/);
    expect(h.store.data.tasks).toHaveLength(0);
  });
});

describe("acceptance 18: Confirm-finding fallback", () => {
  it("author task creation fails: acknowledgment recorded, no disposition, row label unchanged, routing proposed", async () => {
    const h = harness();
    await h.run("architecture_v3");
    h.box.failNextTaskCreate();
    const r = await h.respond("SEC-ARCH-07", "rejected", DANA_REASON);
    expect(r.fallback).toBe("confirm_finding");
    expect(r.events.map((e) => e.event_type)).toEqual(["box_task_response_ingested", "box_task_create_failed", "acknowledgment_recorded"]);
    expect(r.events[2].author_routing).toBe("proposed");
    expect(h.eventsOf("human_disposition_recorded", "S4")).toHaveLength(0);
    expect(h.row("SEC-ARCH-07").status.label).toBe("Needs review: key-management evidence missing");
  });
});

describe("acceptance 19: input gate quarantine", () => {
  it("the injected document is quarantined, never reaches the evaluator, dependents are not_evaluated (input_gate), a reviewer task is created", async () => {
    const h = harness();
    const inner = mockEval(h);
    const seen: string[] = [];
    const spy: Evaluator = {
      kind: "mock",
      evaluate(input, tools, onStep) {
        for (const f of input.files) seen.push(f.text);
        return inner.evaluate(input, tools, onStep);
      },
    };
    await h.run("injection", spy);
    const gate = h.eventsOf("input_gate", "S4");
    expect(gate).toHaveLength(1);
    expect(gate[0]).toMatchObject({ fileName: "runbook.md", quarantined: true });
    expect((gate[0].detail as { injection: { answer: string; probability: number } }).injection).toEqual({ answer: "yes", probability: 0.97 });
    expect(seen.some((t) => t.includes("ignore the control list"))).toBe(false);
    expect(seen).toHaveLength(4);
    for (const c of ["SEC-ARCH-17", "SEC-ARCH-22"]) {
      const row = h.row(c);
      expect(row.machine_assessment, c).toBe("not_evaluated");
      expect(row.state.not_evaluated_reason?.code, c).toBe("input_gate");
    }
    const t = h.store.data.tasks.find((x) => (x as { purpose?: string }).purpose === "input_gate_quarantine");
    expect(t?.fileId).toBe("1650233403");
    expect(t?.assignee).toBe("Dana Okafor");
  });

  it("an absent gate is omitted from the trace, never faked", async () => {
    const h = harness({ gate: "absent" });
    const r = await h.run("architecture_v3");
    expect(h.eventsOf("input_gate", "S4")).toHaveLength(0);
    expect(r.gate).toEqual({ ran: false, label: "omitted: Decider not running" });
    expect(h.countLine()).toBe(fixture.expected().expected_count_line_before);
  });
});

describe("acceptance 20: Box AI citation validation", () => {
  it("a cited passage not found in the pinned text counts as no evidence and is recorded", async () => {
    const h = harness();
    h.box.setNextAskCitations([{ fileId: "1650233403", versionId: "1801102252", content: "Customer-managed keys are rotated every 90 days by the key custodians." }]);
    const r = await h.run("architecture_v3");
    const ask = r.box_ai_asks.find((a) => a.query.startsWith("customer-managed"))!;
    expect(ask.cited_statements).toBe(0);
    expect(ask.rejected_citations).toHaveLength(1);
    expect(ask.rejected_citations[0].reason).toMatch(/not found in the pinned version text/);
    const basis = h.store.data.findings[h.row("SEC-ARCH-07").finding_id!].basis;
    expect(basis.some((b) => b.includes("0 cited statements. 1 cited passage not found in the pinned text, counted as no evidence."))).toBe(true);
    expect(h.row("SEC-ARCH-07").status.label).toBe("Needs review: key-management evidence missing");
  });

  it("Box AI unavailable: string-search fallback, labelled", async () => {
    const h = harness();
    h.box.setBoxAiAvailable(false);
    const r = await h.run("architecture_v3");
    expect(r.search_tool).toEqual({ label: "string search (Box AI unavailable)", fallback: true });
    expect(h.row("SEC-ARCH-22").status.label).toBe("Needs review: evidence binding changed");
  });
});

describe("identity checks (spec 4, rules enforced by code)", () => {
  it("rejects a response from the configured author and from someone not on the reviewer list", async () => {
    const h = harness();
    await h.run("architecture_v3");
    const author = await h.respond("SEC-ARCH-22", "approved", DANA_22, { as: h.box.directoryLookup("30118811") });
    expect(author.result).toBe("rejected");
    expect(author.explanation).toMatch(/not on the configured reviewer list|configured author/);
    const h2 = harness();
    await h2.run("architecture_v3");
    const chair = await h2.respond("SEC-ARCH-22", "approved", DANA_22, { as: h2.box.directoryLookup("30118801") });
    expect(chair.result).toBe("rejected");
    expect(chair.explanation).toMatch(/R\. Alvarez .* is not on the configured reviewer list/);
    expect(h2.eventsOf("human_disposition_recorded", "S4")).toHaveLength(0);
    expect(verifyChain(h2.store.events).ok).toBe(true);
  });

  it("completed (acknowledge only) records an acknowledgment and no disposition", async () => {
    const h = harness();
    await h.run("architecture_v3");
    const r = await h.respond("SEC-ARCH-05", "completed", "Seen; §4.2 still supports the control.");
    expect(r.mapped_action).toBe("acknowledged");
    expect(h.eventsOf("acknowledgment_recorded", "S4")).toHaveLength(1);
    expect(h.eventsOf("human_disposition_recorded", "S4")).toHaveLength(0);
  });

  it("approved without the attestation phrase is an acknowledgment, not a verification", async () => {
    const h = harness();
    await h.run("architecture_v3");
    const r = await h.respond("SEC-ARCH-22", "approved", "Looks right.");
    expect(r.mapped_action).toBe("acknowledged");
    expect(h.row("SEC-ARCH-22").status.label).toBe("Needs review: evidence binding changed");
  });
});

describe("acceptance 20 (live chunk format): Box AI cites passages, validated sentence by sentence", () => {
  it("keeps the supporting sentence of a markdown chunk and rejects a chunk with no pinned sentence", async () => {
    const { validatedStatements } = await import("../src/lib/engine/pipeline");
    const rb = fixture.text("runbook.md");
    const chunk = "## 3. Deployment and rollback\n\n**Rollback plan.** Deployments roll back to the previous published Lambda version within 15 minutes; RTO 4 hours and RPO 15 minutes per BIA Tier 1.\n\n1. Trigger: any Sev 2 alarm during or within 2 hours of a deployment.";
    const terms = ["RTO", "RPO", "roll back"];
    expect(validatedStatements(chunk, rb, terms)).toEqual([Q["22"]]);
    expect(validatedStatements("RTO is 1 hour. RPO is zero for every store.", rb, terms)).toEqual([]);
    expect(validatedStatements(Q["22"], rb, terms)).toEqual([Q["22"]]);
  });
});
