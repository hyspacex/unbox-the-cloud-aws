/**
 * Codex engine review fix round: one test per finding, each reproducing the reviewer's probe first.
 * Findings are numbered as in app/.review/codex-engine-review.md.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { fixture } from "../src/lib/fixture";
import { Q } from "../src/lib/agent/mock-evaluator";
import { MockEvaluator } from "../src/lib/agent/mock-evaluator";
import { FindingSet } from "../src/lib/agent/schema";
import { canonicalJSON, verifyChain } from "../src/lib/engine/ledger";
import { displayStatus } from "../src/lib/engine/display";
import { findQuote } from "../src/lib/engine/normalize";
import { approveDraft, awaitingDrafts, draftAuthorMessage, ingestTaskResponse, pollAssignments } from "../src/lib/engine/disposition";
import { runReview, needsRetry } from "../src/lib/engine/pipeline";
import { buildRows } from "../src/lib/engine/state";
import { bannedWords } from "../src/lib/engine/wording";
import { boxAssignee, loadConfig, toAppConfig } from "../src/lib/config";
import { getStore, forgetStore, StoreLoadError, recoverInterruptedRuns } from "../src/lib/store";
import type { Evaluator, EvaluatorInput } from "../src/lib/agent/evaluator.types";
import type { DisplayInputs } from "../src/lib/types";
import { DANA_22, DANA_REASON, harness } from "./helpers";

const ATTEST = "I attest the cited evidence meets the requirement.";
const mockEval = (h: ReturnType<typeof harness>) =>
  new MockEvaluator({ modelId: h.config.modelId, inferenceProfile: h.config.inferenceProfile, promptVersion: h.config.promptVersion, promptHash: h.config.mockPromptHash, timeScale: 0 });
const whitespaceUpload = (h: ReturnType<typeof harness>) => h.box.uploadVersion("vendor-contract-summary.md", fixture.text("vendor-contract-summary.md") + "\n", { comment: "whitespace" });

/** Wrap the mock evaluator and rewrite one control's clause support with a given quote in architecture.md. */
function citing(h: ReturnType<typeof harness>, controlId: string, quote: string, keep: string[] = []): Evaluator {
  const inner = mockEval(h);
  return {
    kind: "mock",
    async evaluate(input: EvaluatorInput, tools, onStep) {
      const r = await inner.evaluate(input, tools, onStep);
      const arch = input.files.find((f) => f.file.fileName === "architecture.md")!;
      const loc = findQuote(quote, arch.text);
      if (!loc) return r;
      const f = r.output.findings.find((x) => x.control_id === controlId)!;
      f.clause_support = f.clause_support.map((c) =>
        keep.includes(c.clause_id) ? c : { clause_id: c.clause_id, support: "supported", quote: { fileName: "architecture.md", versionId: arch.file.versionId, section: loc.section, paragraph: loc.paragraph, page: loc.page, quote } },
      );
      return r;
    },
  };
}

describe("finding 1: an unreviewed quote never regains Verified, holds", () => {
  it("SEC-ARCH-04's changed quote stays Needs review across an unrelated upload", async () => {
    const h = harness();
    const newQ = "All human access to Lantern authenticates through the Meridian enterprise IdP with phishing-resistant MFA, and Lantern keeps no local user accounts.";
    h.box.uploadVersion("architecture.md", fixture.text("architecture-v2.md").replace(Q["04"], newQ), { comment: "reword 4.1" });
    const ev = citing(h, "SEC-ARCH-04", newQ);
    await h.run(undefined, ev);
    expect(h.row("SEC-ARCH-04").status.label).toBe("Needs review: evidence binding changed");
    whitespaceUpload(h);
    await h.run(undefined, ev); // S5: nothing about 04 changed since S4, but the new quote was never verified
    const r = h.row("SEC-ARCH-04");
    expect(r.state.snapshot_id).toBe("S5");
    expect(r.status.label).toBe("Needs review: evidence binding changed");
    expect(r.change_classification).toBe("moved");
    expect(h.eventsOf("verification_holds", "S5").map((e) => e.control_id)).not.toContain("SEC-ARCH-04");
  });
});

describe("finding 2: quarantine persists for the version", () => {
  it("an unrelated upload does not send the quarantined runbook to the evaluator", async () => {
    const h = harness();
    const inner = mockEval(h);
    const seen: string[][] = [];
    const spy: Evaluator = { kind: "mock", evaluate: (i, t, s) => (seen.push(i.files.map((f) => f.text)), inner.evaluate(i, t, s)) };
    await h.run("injection", spy);
    whitespaceUpload(h);
    await h.run(undefined, spy);
    expect(seen).toHaveLength(2);
    expect(seen[1].some((t) => t.includes("ignore the control list"))).toBe(false);
    for (const c of ["SEC-ARCH-17", "SEC-ARCH-22"]) expect(h.row(c).state.not_evaluated_reason?.code, c).toBe("input_gate");
    expect(h.store.data.gate_decisions["1650233403@" + h.store.snapshot("S5")!.files.find((f) => f.fileName === "runbook.md")!.versionId].quarantined).toBe(true);
    expect(h.store.data.tasks.filter((t) => (t as { purpose?: string }).purpose === "input_gate_quarantine")).toHaveLength(1);
  });
});

describe("finding 3: Box responses are ingested by polling", () => {
  it("a response resolved in Box (not through /api/action) is ingested by pollAssignments; failures are reported", async () => {
    const h = harness();
    await h.run("architecture_v3");
    const t = h.openTask("SEC-ARCH-22")!;
    h.box.resolveAssignment(t.assignment_id, { resolution_state: "approved", message: DANA_22, as: h.box.directoryLookup("30118804") });
    const deps = { store: h.store, box: h.box, profile: h.profile, config: h.config };
    const r = await pollAssignments(deps);
    expect(r.errors).toEqual([]);
    expect(r.results.map((x) => x.mapped_action)).toEqual(["verified"]);
    expect(h.row("SEC-ARCH-22").status.label).toBe("Verified");
    const again = await pollAssignments(deps);
    expect(again.results).toHaveLength(0); // the task is completed; nothing to ingest twice
    const failing = { ...h.box, listTaskAssignments: async () => Promise.reject(new Error("Box 503")) } as unknown as typeof h.box;
    const f = await pollAssignments({ ...deps, box: failing });
    expect(f.errors.length).toBeGreaterThan(0);
    expect(f.errors[0].message).toBe("Box 503");
  });
});

describe("finding 4: a fresh baseline can be reviewed", () => {
  it("an empty store captures S1 with Pending review rows, a reviewer task each, and Verify works", async () => {
    const h = harness({ emptyBaseline: true });
    const r = await h.run();
    expect(r.snapshot_id).toBe("S1");
    expect(h.rows().every((x) => x.status.kind === "pending_review")).toBe(true);
    expect(r.tasks).toHaveLength(8);
    const v = await h.respond("SEC-ARCH-07", "approved", ATTEST);
    expect(v.mapped_action).toBe("verified");
    expect(h.row("SEC-ARCH-07").status.label).toBe("Verified");
  });
});

describe("finding 5: client snapshot ids cannot bypass the task mapping", () => {
  it("an S4 task answered with a claimed decision snapshot S5 after the binding changed is rejected", async () => {
    const h = harness();
    await h.run("architecture_v3");
    const taskA = h.openTask("SEC-ARCH-07")!;
    h.box.uploadVersion("architecture.md", fixture.text("architecture-v3.md").replace(Q["07w"], "All customer data is protected with strong encryption."), { comment: "v4" });
    await h.run();
    const res = await h.respond("SEC-ARCH-07", "rejected", DANA_REASON, { taskId: taskA.task_id, decision_snapshot_id: "S5" });
    expect(res.result).toBe("rejected");
    expect(res.explanation).toMatch(/binding changed since the decision: architecture\.md v3 §4\.3 on S4/);
    expect(h.eventsOf("human_disposition_recorded", "S5")).toHaveLength(0);
    const ingest = res.events[0];
    expect((ingest.freshness_check as unknown as { decision_snapshot_id: string; client_snapshot_id: string }).decision_snapshot_id).toBe("S4");
    expect((ingest.freshness_check as unknown as { client_snapshot_id: string }).client_snapshot_id).toBe("S5");
  });
});

describe("finding 6: no freshness race across awaits", () => {
  it("a capture that starts while the author task is being created waits for the response to finish", async () => {
    const h = harness();
    await h.run("architecture_v3");
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const create = h.box.createTask.bind(h.box);
    h.box.createTask = async (...a: Parameters<typeof create>) => {
      if (a[2] === "complete") await gate;
      return create(...a);
    };
    const t = h.openTask("SEC-ARCH-07")!;
    const fid = h.store.data.task_mappings[t.assignment_id].finding_id;
    const d = await draftAuthorMessage({ store: h.store, box: h.box, config: h.config, st: h.row("SEC-ARCH-07").state, reason: DANA_REASON });
    approveDraft(h.store, { finding_id: fid, snapshot_id: "S4", reason: DANA_REASON, text: d.text });
    h.box.resolveAssignment(t.assignment_id, { resolution_state: "rejected", message: DANA_REASON, as: h.box.directoryLookup("30118804") });
    const view = (await h.box.listTaskAssignments(t.task_id))[0];
    const ingest = ingestTaskResponse({ store: h.store, box: h.box, profile: h.profile, config: h.config }, { view, mapping: h.store.data.task_mappings[t.assignment_id] });
    await new Promise((r) => setTimeout(r, 5));
    h.box.uploadVersion("architecture.md", fixture.text("architecture-v3.md").replace(Q["07w"], "All customer data is protected with strong encryption."), { comment: "v4" });
    const capture = h.run();
    await new Promise((r) => setTimeout(r, 5));
    expect(h.store.data.snapshots).toHaveLength(4); // the capture is waiting on the package lock
    release();
    const res = await ingest;
    await capture;
    expect(res.result).toBe("applied");
    const ev = h.store.events;
    const disp = ev.findIndex((e) => e.event_type === "human_disposition_recorded" && e.snapshot_id === "S4");
    const s5 = ev.findIndex((e) => e.event_type === "snapshot_captured" && e.snapshot_id === "S5");
    expect(disp).toBeGreaterThan(0);
    expect(disp).toBeLessThan(s5); // decided on S4 before S5 existed: the order in the ledger proves it
  });
});

describe("finding 7: an interrupted disposition resumes, it is not deduplicated away", () => {
  it("failure before the disposition append, then replay: one author task, one disposition", async () => {
    const h = harness();
    await h.run("architecture_v3");
    const orig = h.store.append.bind(h.store);
    let failOnce = true;
    h.store.append = ((input, opts) => {
      if (failOnce && input.event_type === "human_disposition_recorded") {
        failOnce = false;
        throw new Error("simulated crash");
      }
      return orig(input, opts);
    }) as typeof h.store.append;
    await expect(h.respond("SEC-ARCH-07", "rejected", DANA_REASON)).rejects.toThrow("simulated crash");
    expect(h.store.data.processing[Object.keys(h.store.data.processing)[0]].stage).toBe("author_task_created");
    const replay = await h.respond("SEC-ARCH-07", "rejected", DANA_REASON, { replay: true, taskId: "box-task-77120931" });
    expect(replay.result).toBe("applied");
    expect(replay.mapped_action).toBe("returned_to_author");
    expect(h.eventsOf("human_disposition_recorded", "S4")).toHaveLength(1);
    expect(h.store.data.tasks.filter((t) => t.kind === "author")).toHaveLength(1);
    expect(h.box.tasks().filter((t) => t.action === "complete")).toHaveLength(1);
    expect(h.row("SEC-ARCH-07").status.label).toBe("Returned to author, open");
  });
});

describe("finding 8: a failed evaluation is retried without another upload", () => {
  it("clearing the read failure and submitting again re-runs S4 as attempt 2", async () => {
    const h = harness();
    await h.run("unreadable");
    expect(h.row("SEC-ARCH-01").machine_assessment).toBe("not_evaluated");
    expect(needsRetry(h.store, "S4")).toBe(true);
    h.box.clearReadFailures();
    const r = await h.run();
    expect(r.outcome).toBe("complete");
    expect(r.snapshot_id).toBe("S4");
    expect(h.store.data.snapshots).toHaveLength(4);
    expect(h.eventsOf("evaluation_attempt", "S4").map((e) => e.attempt)).toEqual([1, 2]);
    expect(h.eventsOf("evaluation_attempt", "S4").every((e) => e.evaluation_id === "EVAL-S4")).toBe(true);
    expect(h.row("SEC-ARCH-01").status.label).toBe("Verified, holds");
    expect((await h.run()).outcome).toBe("no_change");
  });
});

describe("finding 9: login-only live identities are assigned by login", () => {
  it("assigns by login when no tenant id is configured and records the identity Box returns", async () => {
    const cfg = loadConfig();
    expect(boxAssignee({ ...cfg.reviewer, id_explicit: false }, false)).toEqual({ login: cfg.reviewer.login });
    expect(boxAssignee({ ...cfg.reviewer, id_explicit: true }, false)).toEqual({ id: cfg.reviewer.box_user_id });
    expect(boxAssignee({ ...cfg.reviewer, id_explicit: false }, true)).toEqual({ id: cfg.reviewer.box_user_id });
    const h = harness();
    h.config.mockMode = false;
    h.config.reviewer = { ...h.config.reviewer, box_user_id: "99999999", id_explicit: false };
    const assign = vi.spyOn(h.box, "assignTask");
    const r = await h.run("architecture_v3");
    expect(assign.mock.calls[0][1]).toEqual({ login: "dana.okafor@meridiantrust.example" });
    expect(r.tasks[0].assignee_box_user_id).toBe("30118804"); // as returned by Box, not the configured placeholder
  });
});

describe("finding 10: a failed same-snapshot projection update is not mistaken for success", () => {
  it("Box keeps S4's old statuses: the ledger records box_metadata_write_failed", async () => {
    const h = harness();
    await h.run("architecture_v3");
    h.box.failNextMetadataWrite();
    await h.respond("SEC-ARCH-22", "approved", DANA_22);
    const last = h.store.events.filter((e) => e.event_type.startsWith("box_metadata")).at(-1)!;
    expect(last.event_type).toBe("box_metadata_write_failed");
    expect((last.readback as { fields_differing: string[] }).fields_differing).toContain("keel_status_SEC_ARCH_22");
    expect(h.box.metadata()!.keel_status_SEC_ARCH_22).toBe("NEEDS_REVIEW_BINDING");
  });
});

describe("finding 11: removing a file is a change", () => {
  it("removing architecture.md captures a new snapshot and records the removal", async () => {
    const h = harness();
    h.box.removeFile("architecture.md");
    const r = await h.run();
    expect(r.outcome).toBe("complete");
    expect(r.snapshot_id).toBe("S4");
    expect(h.store.snapshot("S4")!.files.map((f) => f.fileName)).not.toContain("architecture.md");
    expect(h.eventsOf("file_version_observed", "S4")[0]).toMatchObject({ fileName: "architecture.md", removed: true });
    expect(h.row("SEC-ARCH-07").status.label).toBe("Needs review: evidence lost");
    expect(h.store.data.findings[h.row("SEC-ARCH-07").finding_id!].basis.at(-1)).toMatch(/architecture\.md is no longer in the package folder/);
    expect(h.countLine()).not.toBe("8 controls on snapshot S4: 8 Verified holds");
  });
});

describe("finding 12: store load failures fail closed", () => {
  const tmp = () => path.join(os.tmpdir(), `keel-store-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  it("an unparseable file throws and is left untouched", () => {
    forgetStore();
    const p = tmp();
    fs.writeFileSync(p, "{not json");
    expect(() => getStore({ path: p, mode: "mock" })).toThrow(StoreLoadError);
    expect(fs.readFileSync(p, "utf8")).toBe("{not json");
    forgetStore();
  });
  it("a store whose hash chain does not verify throws", () => {
    forgetStore();
    const p = tmp();
    const s = getStore({ path: p, mode: "mock" });
    forgetStore();
    const raw = JSON.parse(fs.readFileSync(p, "utf8"));
    raw.ledger.events[10].quote = "tampered";
    fs.writeFileSync(p, JSON.stringify(raw));
    expect(() => getStore({ path: p, mode: "mock" })).toThrow(/hash chain does not verify at EVT-0011/);
    expect(s).toBeTruthy();
    forgetStore();
  });
});

describe("finding 13: interrupted runs get a terminal outcome and can be retried", () => {
  it("restart recovery records RUN_INTERRUPTED; the next submit runs attempt 2", async () => {
    const h = harness();
    h.box.uploadVersion("architecture.md", fixture.text("architecture-v3.md"), { versionId: "1801102233", uploader: "svc-confluence-export" });
    // A run that captured S4 and then died: its evaluator never returns (until the test ends).
    let kill!: (e: Error) => void;
    const hung = new Promise<never>((_, rej) => (kill = rej));
    const p = runReview({ box: h.box, evaluator: { kind: "mock", evaluate: () => hung }, gate: h.gate, store: h.store, profile: h.profile, config: h.config, runId: "r-dead" });
    await new Promise((r) => setTimeout(r, 20));
    h.store.data.runs["r-dead"] = { run_id: "r-dead", snapshot_id: "S4", done: false } as never;
    expect(buildRows(h.store, h.profile, "S4")[0].status.kind).toBe("pending_recheck");
    recoverInterruptedRuns(h.store, { mrmModelId: h.config.mrmModelId });
    expect(h.eventsOf("evaluation_completed", "S4").at(-1)).toMatchObject({ evaluation_state: "error", error: { code: "RUN_INTERRUPTED" } });
    expect(buildRows(h.store, h.profile, "S4")[0].status.kind).toBe("not_evaluated");
    expect(needsRetry(h.store, "S4")).toBe(true);
    kill(new Error("the old process is gone")); // releases the package lock held by the dead run
    await p;
    const r = await h.run();
    expect(r.snapshot_id).toBe("S4");
    expect(h.eventsOf("evaluation_attempt", "S4").map((e) => e.attempt)).toEqual([1, 2]);
    expect(h.countLine()).toBe(fixture.expected().expected_count_line_before);
  });
});

describe("finding 14: rules 8 and 9 require the complete current binding", () => {
  const base: DisplayInputs = {
    current_snapshot_id: "S4",
    current_disposition: null,
    prior_verification: null,
    verification_holds: false,
    acknowledgment_required: false,
    machine_assessment: "evidence_found",
    change_classification: "none",
    unsupported_clauses: [],
    evaluation_state: "complete",
    tier: "High",
    current_binding: { fileId: "f1", fileName: "a.md", versionId: "v3", quote: "current quote" },
  };
  const disp = (d: "verified" | "returned_to_author", binding: { fileId: string; fileName: string; versionId: string; quote?: string }) => ({
    ...base,
    current_disposition: { disposition: d, actor: { name: "D", role: "R" }, recorded_at: "t", snapshot_id: "S4", binding },
  });
  it("Returned to author on another version, Verified on another quote, or no current binding: not rule 8 or 9", () => {
    expect(displayStatus(disp("returned_to_author", { fileId: "f1", fileName: "a.md", versionId: "v2", quote: "current quote" })).rule).not.toBe(8);
    expect(displayStatus(disp("verified", { fileId: "f1", fileName: "a.md", versionId: "v3", quote: "another quote" })).rule).not.toBe(9);
    expect(displayStatus({ ...disp("verified", { fileId: "f1", fileName: "a.md", versionId: "v3", quote: "current quote" }), current_binding: undefined }).rule).not.toBe(9);
    expect(displayStatus(disp("verified", { fileId: "f1", fileName: "a.md", versionId: "v3", quote: "Current   QUOTE" })).rule).toBe(9);
  });
});

describe("finding 15: human history ordering", () => {
  it("an older-completed response on the same snapshot does not overwrite a newer verification", async () => {
    const h = harness();
    await h.run("architecture_v3");
    await h.respond("SEC-ARCH-22", "approved", DANA_22, { completed_at: "2026-10-17T15:34:10Z" });
    const { task_id } = await h.box.createTask("1650233403", "second request", "review");
    const asg = await h.box.assignTask(task_id, { id: "30118804" });
    h.store.data.tasks.push({ task_id, assignment_id: asg.assignment_id, action: "review", fileId: "1650233403", assignee: "Dana Okafor", assignee_box_user_id: "30118804", finding_id: "KEEL-2026-0408", control_id: "SEC-ARCH-22", snapshot_id: "S4", message: "", kind: "reviewer", status: "open", created_at: "" });
    h.store.data.task_mappings[asg.assignment_id] = { task_id, assignment_id: asg.assignment_id, finding_id: "KEEL-2026-0408", control_id: "SEC-ARCH-22", snapshot_id: "S4", immutable: true };
    const late = await h.respond("SEC-ARCH-22", "rejected", "older objection", { taskId: task_id, completed_at: "2026-10-17T15:30:00Z", noDraft: true });
    expect(late.result).toBe("recorded");
    expect(h.row("SEC-ARCH-22").status.label).toBe("Verified");
  });
  it("a historical snapshot's secondary line names the review that existed then", async () => {
    const h = harness();
    await h.run("architecture_v3");
    await h.respond("SEC-ARCH-22", "approved", DANA_22);
    const s3 = buildRows(h.store, h.profile, "S3").find((r) => r.control_id === "SEC-ARCH-22")!;
    expect(s3.status.secondary).toBe("Verified by Dana Okafor, ARB reviewer, Technology Resilience, on architecture.md v2, 2026-10-07T15:52:08Z");
  });
});

describe("finding 16: live return to author needs a reviewer-approved draft", () => {
  it("without an approved draft: Confirm finding and awaiting; after approval: the approved text is sent", async () => {
    const h = harness();
    await h.run("architecture_v3");
    const r = await h.respond("SEC-ARCH-07", "rejected", DANA_REASON, { noDraft: true, completed_at: "2026-10-17T15:33:40Z" });
    expect(r.awaiting_draft).toMatchObject({ finding_id: "KEEL-2026-0405", reason: DANA_REASON });
    expect(r.events.map((e) => e.event_type)).toEqual(["box_task_response_ingested", "acknowledgment_recorded"]);
    expect(h.row("SEC-ARCH-07").status.label).toBe("Needs review: key-management evidence missing");
    expect(h.box.tasks().filter((t) => t.action === "complete")).toHaveLength(0);
    const deps = { store: h.store, box: h.box, profile: h.profile, config: h.config };
    const before = h.store.events.length;
    await pollAssignments(deps); // the poller does not spam while waiting for the draft
    expect(h.store.events.length).toBe(before);
    expect(awaitingDrafts(h.store)).toHaveLength(1);
    approveDraft(h.store, { finding_id: "KEEL-2026-0405", snapshot_id: "S4", reason: DANA_REASON, text: "Approved text for the author." });
    const p = await pollAssignments(deps);
    expect(p.results[0].mapped_action).toBe("returned_to_author");
    expect(p.results[0].author_task?.message).toBe("Approved text for the author.");
    expect(h.row("SEC-ARCH-07").status.label).toBe("Returned to author, open");
    expect(awaitingDrafts(h.store)).toHaveLength(0);
  });
});

describe("finding 17: untrusted-output holes", () => {
  it("rejects a nested disposition key", () => {
    const out = { snapshot_id: "S4", findings: [{ control_id: "SEC-ARCH-07", clause_support: [{ clause_id: "SEC-ARCH-07.1", support: "supported", quote: { fileName: "a", versionId: "v", section: "s", quote: "long enough quote", disposition: "verified" } }], basis: ["b"] }] };
    expect(FindingSet.safeParse(out).success).toBe(false);
    const out2 = { snapshot_id: "S4", findings: [{ control_id: "SEC-ARCH-07", clause_support: [{ clause_id: "SEC-ARCH-07.1", support: "unsupported", quote: null, status: "ok" }], basis: ["b"] }] };
    expect(FindingSet.safeParse(out2).success).toBe(false);
  });
  it("duplicate clause ids make the finding not_evaluated; a cross-paragraph quote gets no invented location", async () => {
    const h = harness();
    const inner = mockEval(h);
    const v2 = fixture.text("architecture-v2.md");
    const cross = "approved by CRYPTO-OPS. ### 4.4 Encryption in transit All network connections use TLS 1.2 at minimum";
    const ev: Evaluator = {
      kind: "mock",
      async evaluate(i, t, s) {
        const r = await inner.evaluate(i, t, s);
        const arch = i.files.find((f) => f.file.fileName === "architecture.md")!;
        const f7 = r.output.findings.find((x) => x.control_id === "SEC-ARCH-07")!;
        f7.clause_support.push({ clause_id: "SEC-ARCH-07.2", support: "unsupported", quote: null });
        const f2 = r.output.findings.find((x) => x.control_id === "SEC-ARCH-17")!;
        f2.clause_support[0] = { clause_id: f2.clause_support[0].clause_id, support: "supported", quote: { fileName: "architecture.md", versionId: arch.file.versionId, section: "Invented section", paragraph: 1, page: 99, quote: cross } };
        return r;
      },
    };
    h.box.uploadVersion("architecture.md", v2 + "\n", { comment: "x" });
    await h.run(undefined, ev);
    expect(h.row("SEC-ARCH-07").state.not_evaluated_reason?.code).toBe("CLAUSE_DUPLICATE");
    const q = h.row("SEC-ARCH-17").state.clause_support[0].quote!;
    expect(q.section).not.toBe("Invented section");
    expect(q.page).toBeUndefined();
  });
});

describe("finding 18: banned machine wording is filtered before persistence", () => {
  it("model basis and suggestion are withheld; a Box AI draft falls back to the template; quotes and reasons are exempt", async () => {
    const h = harness();
    const inner = mockEval(h);
    const ev: Evaluator = {
      kind: "mock",
      async evaluate(i, t, s) {
        const r = await inner.evaluate(i, t, s);
        r.output.findings[0].basis = ["The control is compliant and passed."];
        r.output.findings[0].suggested_action = "Mark satisfied.";
        return r;
      },
    };
    await h.run("architecture_v3", ev);
    const e = h.eventsOf("control_evaluated", "S4")[0];
    expect((e.model_basis as string[])[0]).toMatch(/withheld/);
    expect(e.wording_filter).toBeTruthy();
    const f = h.store.data.findings[e.finding_id as string];
    expect(f.model_suggested_action).toMatch(/withheld/);
    const gen = h.box.aiTextGen.bind(h.box);
    h.box.aiTextGen = async (ids, prompt) => {
      const r = await gen(ids, prompt);
      return "text" in r ? { text: r.text + " The control is now satisfied." } : r;
    };
    const d = await draftAuthorMessage({ store: h.store, box: h.box, config: h.config, st: h.row("SEC-ARCH-07").state, reason: "Not satisfied: the key model is gone." });
    expect(d.drafted_by).toBe("template");
    expect(bannedWords(d.text, ["Not satisfied: the key model is gone."])).toEqual([]);
    expect(bannedWords('quote "were passed to" here', ["were passed to"])).toEqual([]);
  });
});

describe("finding 19: canonical JSON sorts keys by code point", () => {
  it("orders a BMP key above U+FFFF before an astral key, as Python does", () => {
    expect(canonicalJSON({ "😀": 2, "￿": 1 })).toBe('{"\\uffff": 1, "\\ud83d\\ude00": 2}');
    expect(verifyChain(fixture.ledger().events).head.startsWith("868fefd1")).toBe(true);
  });
});

describe("finding 20: SSE cancellation cleans up", () => {
  it("cancelling the body stops the timer and does not throw later", async () => {
    vi.resetModules();
    vi.doMock("next/server", () => ({ connection: async () => undefined }));
    const svc = await import("../src/lib/service");
    svc.reset();
    const sub = await svc.submit({ scenario: "architecture_v3" });
    const { GET } = await import("../src/app/api/run/[runId]/stream/route");
    const ac = new AbortController();
    const res = await GET(new Request("http://x/stream", { signal: ac.signal }), { params: Promise.resolve({ runId: sub.run_id }) });
    const reader = res.body!.getReader();
    await reader.read();
    const errors: unknown[] = [];
    const onErr = (e: unknown) => errors.push(e);
    process.on("uncaughtException", onErr);
    await reader.cancel();
    await new Promise((r) => setTimeout(r, 400));
    process.off("uncaughtException", onErr);
    expect(errors).toEqual([]);
    await sub.done;
    vi.doUnmock("next/server");
  });
});

describe("also in this round", () => {
  it("pending rows keep the prior evidencing file; AppConfig.decider.kind; one threshold env", async () => {
    const h = harness();
    let release!: () => void;
    const hold = new Promise<void>((r) => (release = r));
    const inner = mockEval(h);
    const slow: Evaluator = { kind: "mock", evaluate: async (i, t, s) => (await hold, inner.evaluate(i, t, s)) };
    const p = h.run("architecture_v3", slow);
    await new Promise((r) => setTimeout(r, 10));
    const row = h.row("SEC-ARCH-07");
    expect(row.status.kind).toBe("pending_recheck");
    expect(row.evidencing).toMatchObject({ fileName: "architecture.md", versionLabel: "v2" });
    release();
    await p;
    expect(toAppConfig(loadConfig()).decider.kind).toBe("mock");
    process.env.DECIDER_INJECTION_THRESHOLD = "0.8";
    process.env.KEEL_GATE_INJECTION_THRESHOLD = "0.4";
    expect(loadConfig().gateInjectionThreshold).toBe(0.8);
    delete process.env.DECIDER_INJECTION_THRESHOLD;
    expect(loadConfig().gateInjectionThreshold).toBe(0.4);
    delete process.env.KEEL_GATE_INJECTION_THRESHOLD;
  });
});

describe("judge A1: no half-applied state is visible to the API during a run", () => {
  it("every package read mid-run is pending with the prior label struck and prior evidencing, header and count line on one snapshot", async () => {
    const { resetConfigCache } = await import("../src/lib/config");
    process.env.KEEL_MOCK_TIME_SCALE = "0.1"; // about 0.8 s of real wall clock through the mock adapters
    resetConfigCache();
    vi.resetModules();
    const svc = await import("../src/lib/service");
    svc.reset();
    const sub = await svc.submit({ scenario: "architecture_v3" });
    const samples: ReturnType<typeof svc.getPackageView>[] = [];
    let finished = false;
    void sub.done!.then(() => (finished = true));
    while (!finished) {
      samples.push(svc.getPackageView());
      await new Promise((r) => setTimeout(r, 15));
    }
    const run = svc.getRun(sub.run_id);
    const applied = run.steps.find((s) => s.kind === "findings_applied")!;
    expect(samples.length).toBeGreaterThan(10);
    for (const pv of samples) {
      // Header snapshot and count line always come from the same read.
      expect(pv.count_line.startsWith(`8 controls on snapshot ${pv.snapshot.snapshot_id}:`)).toBe(true);
      if (pv.snapshot.snapshot_id !== "S4") continue;
      if (pv.evaluation_state === "pending") {
        expect(pv.count_line).toBe("8 controls on snapshot S4: 8 Re-check pending");
        for (const r of pv.rows) {
          expect(r.status.kind).toBe("pending_recheck");
          expect(r.status.struck).toBe("Verified, holds");
          expect(r.evidencing?.versionId).not.toBe("1801102233"); // still the prior evidencing file version
        }
      } else {
        expect(pv.count_line).toBe(fixture.expected().expected_count_line_before);
      }
    }
    const pendingSamples = samples.filter((s) => s.snapshot.snapshot_id === "S4" && s.evaluation_state === "pending").length;
    expect(pendingSamples).toBeGreaterThan(5);
    // Final statuses appear only once the evaluation events and findings are written.
    const completedAt = svc.getLedger().events.find((e) => e.event_type === "evaluation_completed" && e.snapshot_id === "S4");
    expect(completedAt).toBeTruthy();
    expect(applied).toBeTruthy();
    // Machine and human events that do not project carry "n/a"; only metadata events carry ok/failed.
    for (const e of svc.getLedger().events.filter((x) => x.phase === "live")) {
      if (e.event_type.startsWith("box_metadata")) expect(["ok", "failed", "ambiguous", "deferred"]).toContain(e.projection.box_metadata);
      else expect(e.projection.box_metadata, e.event_type).toBe("n/a");
    }
    delete process.env.KEEL_MOCK_TIME_SCALE;
    resetConfigCache();
  });
});
