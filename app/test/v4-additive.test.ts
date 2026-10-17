/** UI v4 additive read-model fields (app/.review/v4/contract.md, lane E). */
import { describe, expect, it, vi } from "vitest";
import * as svc from "../src/lib/service";
import { fixture } from "../src/lib/fixture";
import { bubbleFor, withBubble, BUBBLE_MAX_WORDS } from "../src/lib/engine/bubble";
import { shortStatus, SHORT_MAX_WORDS, RULES, capWords } from "../src/lib/engine/display";
import { SUMMARY_MAX_WORDS } from "../src/lib/engine/summary";
import { bannedWords } from "../src/lib/engine/wording";
import type { DisplayKind, PackageView, TraceStep } from "../src/lib/types";
import { DANA_REASON } from "./helpers";

const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
const clean = (s: string) => expect(bannedWords(s), s).toEqual([]);

/** Every generated string on the package view: summary, short lines, bubbles of the latest run. */
function checkView(pv: PackageView) {
  expect(words(pv.decision_summary!)).toBeLessThanOrEqual(SUMMARY_MAX_WORDS);
  clean(pv.decision_summary!);
  for (const r of pv.rows) {
    expect(r.status.short, r.control_id).toBeTruthy();
    expect(words(r.status.short!)).toBeLessThanOrEqual(SHORT_MAX_WORDS);
    clean(r.status.short!);
  }
  if (pv.trace_run_id) {
    for (const s of svc.getRun(pv.trace_run_id).steps) {
      expect(s.bubble, s.kind).toBeTruthy();
      expect(words(s.bubble!)).toBeLessThanOrEqual(BUBBLE_MAX_WORDS);
      clean(s.bubble!);
    }
  }
}

function checkCard(controlId: string) {
  const c = svc.getFindingCard(controlId);
  expect(c.verdict_line).toBeTruthy();
  clean(c.verdict_line!);
  for (const l of c.receipt ? [c.receipt.line1, c.receipt.line2, c.receipt.line3] : []) clean(l);
  return c;
}

async function runV3() {
  svc.reset();
  const sub = await svc.submit({ scenario: "architecture_v3" });
  await sub.done!;
  return sub;
}

describe("PackageView.files[] (Box file table)", () => {
  it("S3 baseline: five files at their pinned versions, sizes from the pinned text, no open decision", () => {
    svc.reset();
    const pv = svc.getPackageView();
    expect(pv.files!.map((f) => [f.file_name, f.version_label])).toEqual([
      ["architecture.md", "v2"],
      ["data-flow-and-classification.md", "v1"],
      ["runbook.md", "v2"],
      ["vendor-contract-summary.md", "v1"],
      ["approved-services-and-exceptions.md", "v1"],
    ]);
    const arch = pv.files![0];
    expect(arch.size_bytes).toBe(Buffer.byteLength(fixture.text("architecture-v2.md"), "utf8"));
    expect(arch.updated_at).toMatch(/^2026-10-07T/);
    expect(arch.uploader).toBeTruthy();
    expect(arch.control_ids).toHaveLength(7);
    expect(pv.files!.reduce((a, f) => a + f.control_ids.length, 0)).toBe(8);
    expect(pv.files!.every((f) => f.open_decisions === 0 && f.recorded_decisions === 0)).toBe(true);
    expect(pv.open_decisions).toBe(0);
    expect(pv.decision_summary).toBe("8 verifications hold.");
    checkView(pv);
  });

  it("after the architecture_v3 run: architecture.md v3 carries 07 and 05, runbook.md carries the moved 22", async () => {
    await runV3();
    const pv = svc.getPackageView();
    const f = Object.fromEntries(pv.files!.map((x) => [x.file_name, x]));
    expect(f["architecture.md"].version_label).toBe("v3");
    expect(f["architecture.md"].version_id).toBe("1801102233");
    expect(f["architecture.md"].size_bytes).toBe(Buffer.byteLength(fixture.text("architecture-v3.md"), "utf8"));
    expect(f["architecture.md"].uploader).toBe("svc-confluence-export");
    expect(f["architecture.md"].control_ids).not.toContain("SEC-ARCH-22");
    expect(f["architecture.md"].open_decisions).toBe(2);
    expect(f["runbook.md"].control_ids).toEqual(["SEC-ARCH-22"]);
    expect(f["runbook.md"].open_decisions).toBe(1);
    expect(pv.open_decisions).toBe(3);
    expect(pv.files!.reduce((a, x) => a + x.open_decisions, 0)).toBe(pv.open_decisions);
    expect(pv.decision_summary).toBe("1 Critical needs your decision. 2 more to look at.");
    checkView(pv);
  });
});

describe("decision_summary for each state", () => {
  it("pending, mixed, partially recorded, all recorded", async () => {
    svc.reset();
    const sub = await svc.submit({ scenario: "architecture_v3" });
    // Pending: the snapshot is captured and its evaluation has not completed.
    const pending = svc.getPackageView();
    if (pending.evaluation_state === "pending") {
      expect(pending.decision_summary).toBe("Re-checking 8 controls on S4…");
      expect(pending.open_decisions).toBe(0);
    }
    await sub.done!;
    expect(svc.getPackageView().decision_summary).toBe("1 Critical needs your decision. 2 more to look at.");

    const c7 = svc.getFindingCard("SEC-ARCH-07");
    const d = await svc.draftAuthorMessage(c7.finding.finding_id, DANA_REASON);
    await svc.act({ finding_id: c7.finding.finding_id, control_id: "SEC-ARCH-07", decision_snapshot_id: "S4", action: "return_to_author", reason: DANA_REASON, author_message: d.text });
    await svc.act({ finding_id: "KEEL-2026-0408", control_id: "SEC-ARCH-22", decision_snapshot_id: "S4", action: "verify", reason: "Recovery targets present in runbook §3; binding updated." });
    let pv = svc.getPackageView();
    expect(pv.open_decisions).toBe(1);
    expect(pv.decision_summary).toBe("1 High needs your decision.");
    expect(pv.files!.find((f) => f.file_name === "runbook.md")!.recorded_decisions).toBe(1);
    checkView(pv);

    const c5 = svc.getFindingCard("SEC-ARCH-05");
    await svc.act({ finding_id: c5.finding.finding_id, control_id: "SEC-ARCH-05", decision_snapshot_id: "S4", action: "acknowledge" });
    pv = svc.getPackageView();
    expect(pv.open_decisions).toBe(0);
    expect(pv.decision_summary).toBe("All 8 recorded on S4.");
    expect(pv.files!.find((f) => f.file_name === "architecture.md")!.recorded_decisions).toBe(2);
    // Judge A1: the acknowledged rule-11 row reads rule 10, Verified, holds, with the acknowledgment named.
    expect(pv.rows.find((r) => r.control_id === "SEC-ARCH-05")!.status.kind).toBe("verified_holds");
    checkView(pv);
  });

  it("pending is computed from the evaluation state", async () => {
    const { decisionSummary } = await import("../src/lib/engine/summary");
    svc.reset();
    const s = svc.internals.store();
    const rows = (await import("../src/lib/engine/state")).buildRows(s, fixture.profile(), "S3");
    expect(decisionSummary(s, rows, "S4", "pending")).toBe("Re-checking 8 controls on S4…");
  });

  it("quarantine: names the file the gate withheld", async () => {
    svc.reset();
    await (await svc.submit({ scenario: "injection" })).done!;
    const pv = svc.getPackageView();
    expect(pv.decision_summary).toBe("I did not read runbook.md v3. It carried instructions.");
    expect(pv.open_decisions).toBe(2);
    const rb = pv.files!.find((f) => f.file_name === "runbook.md")!;
    expect(rb.version_label).toBe("v3");
    expect(rb.open_decisions).toBe(2);
    expect(pv.rows.filter((r) => r.status.kind === "not_evaluated").map((r) => r.status.short)).toEqual(["Input quarantined", "Input quarantined"]);
    const steps = svc.getRun(pv.trace_run_id!).steps;
    expect(steps.find((s) => s.kind === "input_gate")!.bubble).toBe("Decider quarantined runbook.md. It carried instructions.");
    checkView(pv);
    checkCard("SEC-ARCH-22");
  });

  it("not evaluated (unreadable file): the unreadable file carries the control", async () => {
    svc.reset();
    await (await svc.submit({ scenario: "unreadable" })).done!;
    const pv = svc.getPackageView();
    expect(pv.decision_summary).toBe("1 control was not evaluated. It needs you.");
    expect(pv.files!.find((f) => f.file_name === "approved-services-and-exceptions.md")!.control_ids).toEqual(["SEC-ARCH-01"]);
    checkView(pv);
    expect(checkCard("SEC-ARCH-01").verdict_line).toBe("Not evaluated: file unreadable on S4. No clause was checked.");
    svc.reset();
  });
});

describe("TraceStep.bubble", () => {
  it("every kind in the fixture trace (and its nested substeps) has a bubble within twelve words", () => {
    const t = fixture.trace();
    const all: TraceStep[] = [];
    const walk = (s: TraceStep) => {
      all.push(s);
      for (const x of (s.substeps ?? []).concat(((s.detail as { substeps?: TraceStep[] } | undefined)?.substeps ?? []))) walk(x);
    };
    t.steps.forEach(walk);
    const kinds = new Set(all.map((s) => s.kind));
    for (const k of ["snapshot_captured", "texts_fetched", "input_gate", "prior_quotes_diffed", "agent_evaluation", "quotes_validated", "findings_applied", "ledger_events_written", "box_folder_metadata_written", "box_task_created"]) expect(kinds).toContain(k);
    for (const s of all) {
      const b = bubbleFor(s);
      expect(b, s.kind).not.toBe("Working…");
      expect(words(b)).toBeLessThanOrEqual(BUBBLE_MAX_WORDS);
      clean(b);
    }
    const by = (k: string) => bubbleFor(t.steps.find((s) => s.kind === k)!);
    expect(by("snapshot_captured")).toBe("Pinning 5 files at their current versions…");
    expect(by("texts_fetched")).toBe("Reading 5 files by version…");
    expect(by("input_gate")).toBe("Decider checked the text. Clean.");
    expect(by("prior_quotes_diffed")).toBe("Comparing with what was verified…");
    expect(by("agent_evaluation")).toBe("Re-checking 8 controls on Bedrock…");
    expect(by("quotes_validated")).toBe("8 of 8 quotes matched.");
    expect(by("findings_applied")).toBe("Applying the status rules…");
    expect(by("ledger_events_written")).toBe("Writing the record…");
    expect(by("box_folder_metadata_written")).toBe("Writing Box metadata…");
    expect(by("box_task_created")).toBe("Creating 3 Box tasks…");
  });

  it("the mock run's steps carry bubbles at emit time, including the Box AI substeps", async () => {
    const sub = await runV3();
    const steps = svc.getRun(sub.run_id).steps;
    const stored = svc.internals.store().data.runs[sub.run_id].steps;
    expect(stored.every((s) => !!s.bubble)).toBe(true);
    const asks = steps.filter((s) => s.kind === "tool_call" && s.tool === "box_ai_ask");
    expect(asks.length).toBe(2);
    expect(asks.every((s) => s.bubble === "Asking Box AI across 4 files…")).toBe(true);
    expect(steps.find((s) => s.kind === "quotes_validated")!.bubble).toBe("23 of 23 quotes matched.");
    expect(steps.find((s) => s.kind === "file_version_observed")!.bubble).toBe("New version seen: architecture.md v3.");
  });

  it("a run recorded without bubbles gets them on read (getRun, the SSE stream source)", async () => {
    const sub = await runV3();
    const s = svc.internals.store();
    for (const st of s.data.runs[sub.run_id].steps) delete st.bubble;
    const steps = svc.getRun(sub.run_id).steps;
    expect(steps.every((x) => !!x.bubble)).toBe(true);
    expect(s.data.runs[sub.run_id].steps.every((x) => !x.bubble)).toBe(true); // read never mutates the record
  });

  it("string-search fallback and unknown kinds stay within the cap", () => {
    const fb = bubbleFor({ source: "boxai", startMs: 0, kind: "tool_call", tool: "string_search", label: "string search over 4 files", args: { agent_tool: "search_snapshot", mode: "string_search" } });
    expect(fb).toBe("Box AI unavailable. Searching 4 files as text…");
    expect(bubbleFor({ source: "app", startMs: 0, kind: "something_new", label: "x" })).toBe("Working…");
    expect(withBubble({ source: "app", startMs: 0, kind: "no_change", label: "" }).bubble).toBe("Nothing changed in the folder since the last check.");
  });
});

describe("DisplayedStatus.short", () => {
  it("every displayed kind yields at most ten words and no reserved wording", () => {
    const kinds = RULES.flatMap((r) => (Array.isArray(r.kind) ? r.kind : [r.kind])) as DisplayKind[];
    for (const kind of kinds) {
      const s = shortStatus({ kind, label: "Needs review: a very long unsupported clause noun phrase that keeps going on and on", secondary: "Verified by Dana Okafor, ARB reviewer, on x v2, t" }, "runbook.md");
      expect(words(s), kind).toBeLessThanOrEqual(SHORT_MAX_WORDS);
      clean(s);
    }
    expect(capWords("one two three four five six seven eight nine ten eleven", 10)).toBe("one two three four five six seven eight nine ten…");
  });

  it("the demo rows", async () => {
    await runV3();
    const pv = svc.getPackageView();
    const short = (id: string) => pv.rows.find((r) => r.control_id === id)!.status.short;
    expect(short("SEC-ARCH-07")).toBe("Key-management evidence missing");
    expect(short("SEC-ARCH-22")).toBe("Same sentence, now in runbook.md");
    expect(short("SEC-ARCH-05")).toBe("Section changed, quote unchanged");
    expect(short("SEC-ARCH-01")).toBe("Verified sentence unchanged");
  });
});

describe("FindingCard.verdict_line and receipt", () => {
  it("verdict lines for 07, 22, 05 and a hold", async () => {
    await runV3();
    expect(checkCard("SEC-ARCH-07").verdict_line).toBe("4 of 5 clauses unsupported in every file of this snapshot. Box AI found 0 citations across the other 4 files.");
    expect(checkCard("SEC-ARCH-22").verdict_line).toBe("The same sentence is now in runbook.md v2 §3.");
    expect(checkCard("SEC-ARCH-05").verdict_line).toBe("The section around the verified sentence was rewritten. The sentence is unchanged.");
    expect(checkCard("SEC-ARCH-01").verdict_line).toBe("The verified sentence is unchanged.");
    for (const id of ["SEC-ARCH-07", "SEC-ARCH-22", "SEC-ARCH-05", "SEC-ARCH-01"]) expect(svc.getFindingCard(id).receipt).toBeNull();
  });

  it("receipt after verify (green) and after return to author (blue), with the ledger events behind it", async () => {
    await runV3();
    const c7 = svc.getFindingCard("SEC-ARCH-07");
    const d = await svc.draftAuthorMessage(c7.finding.finding_id, DANA_REASON);
    await svc.act({ finding_id: c7.finding.finding_id, control_id: "SEC-ARCH-07", decision_snapshot_id: "S4", action: "return_to_author", reason: DANA_REASON, author_message: d.text });
    await svc.act({ finding_id: "KEEL-2026-0408", control_id: "SEC-ARCH-22", decision_snapshot_id: "S4", action: "verify", reason: "Recovery targets present in runbook §3; binding updated." });
    const events = svc.getLedger().events;
    const type = (id: string) => events.find((e) => e.event_id === id)!.event_type;

    const v = checkCard("SEC-ARCH-22").receipt!;
    expect(v.tone).toBe("green");
    expect(v.line1).toBe("Verified by Dana Okafor");
    expect(v.line2).toBe("on runbook.md v2 §3 · snapshot S4");
    expect(v.line3).toMatch(/^Box task 77120932 approved · \d\d:\d\dZ$/);
    expect(v.event_ids.map(type)).toEqual(["human_disposition_recorded", "box_task_response_ingested", "control_evaluated"]);

    const r = checkCard("SEC-ARCH-07").receipt!;
    expect(r.tone).toBe("blue");
    expect(r.line1).toBe("Returned to author by Dana Okafor");
    expect(r.line2).toMatch(/^Box task 77120934 for J\. Park \(Eng\) · due [A-Z][a-z]{2} \d{1,2}$/);
    expect(r.line3).toBe("on architecture.md v3 · snapshot S4");
    expect(r.event_ids.map(type)).toEqual(["human_disposition_recorded", "box_task_created", "box_task_response_ingested", "control_evaluated"]);
    // The verdict sentence is about the evidence, not the disposition: unchanged by the return.
    expect(svc.getFindingCard("SEC-ARCH-07").verdict_line).toMatch(/^4 of 5 clauses unsupported/);

    const c5 = svc.getFindingCard("SEC-ARCH-05");
    await svc.act({ finding_id: c5.finding.finding_id, control_id: "SEC-ARCH-05", decision_snapshot_id: "S4", action: "acknowledge" });
    const a = checkCard("SEC-ARCH-05").receipt!;
    expect(a).toMatchObject({ line1: "Acknowledged by Dana Okafor", line2: "on architecture.md v3 §4.2 · snapshot S4", tone: "blue" });
    expect(a.event_ids.map(type)).toEqual(["acknowledgment_recorded", "box_task_response_ingested", "control_evaluated"]);
    svc.reset();
  });
});

describe("POST /api/upload-version (mock)", () => {
  it("is submit with architecture_v3, and refuses a second upload of the same version", async () => {
    svc.reset();
    const r = await svc.uploadVersion({ file_name: "architecture.md" });
    expect(r).toMatchObject({ snapshot_id: "S4", evaluation_state: "pending" });
    await r.done!;
    expect(svc.getPackageView().files![0].version_label).toBe("v3");
    await expect(svc.uploadVersion({ file_name: "architecture.md" })).rejects.toMatchObject({ code: "ALREADY_SUBMITTED" });
    await expect(svc.uploadVersion({ file_name: "" })).rejects.toMatchObject({ code: "FILE_NAME_REQUIRED" });
    svc.reset();
  });
});

describe("upload-version route handler and the SSE stream", () => {
  it("202 with a SubmitResponse, 400 for a bad scenario; streamed steps carry bubbles", async () => {
    vi.resetModules();
    vi.doMock("next/server", () => ({ connection: async () => undefined }));
    const svc2 = await import("../src/lib/service");
    const { POST } = await import("../src/app/api/upload-version/route");
    const { GET } = await import("../src/app/api/run/[runId]/stream/route");
    svc2.reset();
    const req = (body: unknown) => new Request("http://x/api/upload-version", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    expect((await POST(req({ file_name: "architecture.md", scenario: "bogus" }))).status).toBe(400);
    const ok = await POST(req({ file_name: "architecture.md" }));
    expect(ok.status).toBe(202);
    const body = await ok.json();
    expect(body).toMatchObject({ snapshot_id: "S4", evaluation_state: "pending" });
    const res = await GET(new Request("http://x/stream"), { params: Promise.resolve({ runId: body.run_id }) });
    const text = await res.text();
    const steps = text.split("\n\n").filter((c) => c.startsWith("data: ")).map((c) => JSON.parse(c.slice(6)) as TraceStep);
    expect(steps.length).toBeGreaterThan(5);
    expect(steps.every((st) => typeof st.bubble === "string" && st.bubble.length > 0)).toBe(true);
    svc2.reset();
    vi.doUnmock("next/server");
  });
});

describe("follow-ups from lanes A and B", () => {
  it("ControlRow.needs_decision / decision_recorded track the acknowledgment", async () => {
    await runV3();
    const row = (id: string) => svc.getPackageView().rows.find((r) => r.control_id === id)!;
    expect(row("SEC-ARCH-05")).toMatchObject({ needs_decision: true, decision_recorded: false });
    expect(row("SEC-ARCH-01")).toMatchObject({ needs_decision: false, decision_recorded: false });
    const c5 = svc.getFindingCard("SEC-ARCH-05");
    expect(c5.row.needs_decision).toBe(true);
    const a = await svc.act({ finding_id: c5.finding.finding_id, control_id: "SEC-ARCH-05", decision_snapshot_id: "S4", action: "acknowledge", message: "Section rewrite reviewed." });
    expect(a.row).toMatchObject({ needs_decision: false, decision_recorded: true });
    expect(row("SEC-ARCH-05")).toMatchObject({ needs_decision: false, decision_recorded: true, status: { kind: "verified_holds" } });
    expect(svc.getFindingCard("SEC-ARCH-05").receipt!.tone).toBe("blue");
    svc.reset();
  });

  it("Trace.outcome carries open_decisions and decision_summary; old outcomes get them on read", async () => {
    const sub = await runV3();
    const o = svc.getRun(sub.run_id).outcome!;
    expect(o.open_decisions).toBe(3);
    expect(o.decision_summary).toBe("1 Critical needs your decision. 2 more to look at.");
    expect(o.rows!.filter((r) => r.needs_decision).map((r) => r.control_id)).toEqual(["SEC-ARCH-05", "SEC-ARCH-07", "SEC-ARCH-22"]);
    // A run recorded before Round 5: strip the new fields from the stored record; the read fills them in.
    const stored = svc.internals.store().data.runs[sub.run_id].outcome!;
    delete stored.open_decisions;
    delete stored.decision_summary;
    for (const r of stored.rows!) {
      delete r.needs_decision;
      delete r.decision_recorded;
      delete r.status.short;
    }
    const o2 = svc.getRun(sub.run_id).outcome!;
    expect(o2.open_decisions).toBe(3);
    expect(o2.decision_summary).toBe("1 Critical needs your decision. 2 more to look at.");
    expect(o2.rows!.find((r) => r.control_id === "SEC-ARCH-22")!.status.short).toBe("Same sentence, now in runbook.md");
    expect(svc.listRuns().runs[0].outcome!.open_decisions).toBe(3);
    svc.reset();
  });

  it("upload-version accepts every submit scenario (fabricated_quote on architecture.md)", async () => {
    svc.reset();
    const r = await svc.uploadVersion({ file_name: "architecture.md", scenario: "fabricated_quote" });
    await r.done!;
    const pv = svc.getPackageView();
    expect(pv.files![0].version_label).toBe("v3");
    checkView(pv);
    svc.reset();
  });
});

describe("Trace.outcome.files for replay", () => {
  it("recorded with the run, survives a reset, and is rebuilt on read for older runs", async () => {
    const sub = await runV3();
    const live = svc.getPackageView().files!;
    const o = svc.getRun(sub.run_id).outcome!;
    expect(o.files).toEqual(live);
    expect(o.files!.find((f) => f.file_name === "architecture.md")).toMatchObject({ version_label: "v3", open_decisions: 2 });
    expect(o.files!.find((f) => f.file_name === "runbook.md")).toMatchObject({ open_decisions: 1, control_ids: ["SEC-ARCH-22"] });
    svc.reset(); // back to S3; the recorded outcome is the run's own
    const after = svc.getRun(sub.run_id).outcome!;
    expect(after.files).toEqual(o.files);
    expect(after.open_decisions).toBe(3);
    // A run recorded before outcome.files existed: rebuilt from the recorded rows and snapshot.
    delete svc.internals.store().data.runs[sub.run_id].outcome!.files;
    const rebuilt = svc.getRun(sub.run_id).outcome!.files!;
    expect(rebuilt.map((f) => [f.file_name, f.version_label, f.control_ids.length, f.open_decisions])).toEqual(o.files!.map((f) => [f.file_name, f.version_label, f.control_ids.length, f.open_decisions]));
    svc.reset();
  });
});

describe("judge A1: an acknowledgment ends rule 11", () => {
  it("05 reads Verified, holds (teal, VERIFIED_HOLDS), Box metadata and keel_last_human_review follow, count line updates", async () => {
    await runV3();
    const c7 = svc.getFindingCard("SEC-ARCH-07");
    const d = await svc.draftAuthorMessage(c7.finding.finding_id, DANA_REASON);
    await svc.act({ finding_id: c7.finding.finding_id, control_id: "SEC-ARCH-07", decision_snapshot_id: "S4", action: "return_to_author", reason: DANA_REASON, author_message: d.text });
    await svc.act({ finding_id: "KEEL-2026-0408", control_id: "SEC-ARCH-22", decision_snapshot_id: "S4", action: "verify", reason: "Recovery targets present in runbook §3; binding updated." });
    const before = svc.getPackageView().rows.find((r) => r.control_id === "SEC-ARCH-05")!;
    expect(before.status).toMatchObject({ rule: 11, kind: "acknowledge", projection_code: "ACKNOWLEDGE", tone: "amber" });

    const c5 = svc.getFindingCard("SEC-ARCH-05");
    const a = await svc.act({ finding_id: c5.finding.finding_id, control_id: "SEC-ARCH-05", decision_snapshot_id: "S4", action: "acknowledge" });
    expect(a.result).toBe("applied");
    expect(a.events.some((e) => e.event_type === "box_metadata_written")).toBe(true);
    const pv = svc.getPackageView();
    const r5 = pv.rows.find((r) => r.control_id === "SEC-ARCH-05")!;
    expect(r5.status).toMatchObject({ rule: 10, kind: "verified_holds", label: "Verified, holds", projection_code: "VERIFIED_HOLDS", tone: "teal", short: "Acknowledged by Dana Okafor" });
    expect(r5.status.detail).toMatch(/^Acknowledged by Dana Okafor, 2026-/);
    expect(r5.status.secondary).toMatch(/^Verified by Dana Okafor/); // the original review stays on the secondary line
    expect(pv.count_line).toBe("8 controls on snapshot S4: 6 Verified holds, 1 Verified, 1 Returned to author");
    expect(pv.projection!.statuses["SEC-ARCH-05"]).toBe("VERIFIED_HOLDS");
    const box = (await svc.internals.adapters()).box;
    const md = await box.readFolderMetadata("318840021", "keelReview");
    expect(md!.keel_status_SEC_ARCH_05).toBe("VERIFIED_HOLDS");
    expect(md!.keel_last_human_review).toMatch(/\|SEC-ARCH-05\|S4\|/);
    expect(pv.projection!.keel_last_human_review).toMatch(/^Dana Okafor\|[^|]*\|SEC-ARCH-05\|S4\|2026-/);
    expect(pv.decision_summary).toBe("All 8 recorded on S4.");
    expect(pv.open_decisions).toBe(0);
    const c = svc.getFindingCard("SEC-ARCH-05");
    expect(c.receipt).toMatchObject({ line1: "Acknowledged by Dana Okafor", line2: "on architecture.md v3 §4.2 · snapshot S4", tone: "blue" });
    expect(c.verdict_line).toBe("The section around the verified sentence was rewritten. The sentence is unchanged.");
    expect(c.actions.verify.enabled).toBe(false);
    checkView(pv);
    expect(svc.getLedger().chain_verification.ok).toBe(true);
    svc.reset();
  });

  it("the Confirm-finding fallback (return awaiting a draft) leaves a Needs review row as it is", async () => {
    await runV3();
    const c7 = svc.getFindingCard("SEC-ARCH-07");
    await svc.draftAuthorMessage(c7.finding.finding_id, DANA_REASON);
    // A return without author_message waits for approve_author_draft: an acknowledgment_recorded with fallback confirm_finding.
    svc.internals.store().data.drafts = {};
    const r = await svc.act({ finding_id: c7.finding.finding_id, control_id: "SEC-ARCH-07", decision_snapshot_id: "S4", action: "return_to_author", reason: DANA_REASON });
    expect(svc.getLedger({ control: "SEC-ARCH-07" }).events.some((e) => e.event_type === "acknowledgment_recorded" && e.fallback === "confirm_finding")).toBe(true);
    void r;
    const row = svc.getPackageView().rows.find((x) => x.control_id === "SEC-ARCH-07")!;
    expect(row.status).toMatchObject({ kind: "needs_review_weakened", projection_code: "NEEDS_REVIEW_WEAKENED" });
    expect(row.needs_decision).toBe(true);
    expect(svc.getPackageView().projection!.keel_last_human_review ?? "").not.toMatch(/SEC-ARCH-07\|S4/);
    svc.reset();
  });

  it("an acknowledgment on S4 does not carry to a later snapshot's re-evaluation", async () => {
    await runV3();
    const c5 = svc.getFindingCard("SEC-ARCH-05");
    await svc.act({ finding_id: c5.finding.finding_id, control_id: "SEC-ARCH-05", decision_snapshot_id: "S4", action: "acknowledge" });
    const { displayStatus } = await import("../src/lib/engine/display");
    const base = { current_snapshot_id: "S5", current_disposition: null, prior_verification: { actor: "Dana Okafor", role: "r", snapshot_id: "S2", fileId: "f", fileName: "a.md", versionId: "v", verified_at: "t", event_id: "E" }, verification_holds: false, acknowledgment_required: true, acknowledgment_reason: "evidencing section changed" as const, machine_assessment: "evidence_found" as const, change_classification: "unchanged" as const, unsupported_clauses: [], evaluation_state: "complete" as const, tier: "High" as const };
    expect(displayStatus(base).kind).toBe("acknowledge");
    expect(displayStatus({ ...base, acknowledgment: { actor: "Dana Okafor", role: "r", at: "t" } }).kind).toBe("verified_holds");
    svc.reset();
  });
});

// ------------------------------------------------------------------------------------------------
// Codex round (app/.review/v4/codex-ui-review.md)
// ------------------------------------------------------------------------------------------------

import { uploadNewVersion } from "../src/lib/box/upload";
import { RealBoxAdapter } from "../src/lib/box/real";
import { readByteStream } from "box-typescript-sdk-gen/internal";
import { UploadVersionSchema } from "../src/lib/upload-request";
import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { resetConfigCache } from "../src/lib/config";
import { createMemoryStore, forgetStore } from "../src/lib/store";
import { MockBoxAdapter } from "../src/lib/box/mock";
import { MockEvaluator } from "../src/lib/agent/mock-evaluator";
import { MockInputGate } from "../src/lib/agent/mock-gate";
import { pendingStatus, shortStatus as shortOf, SHORT_FALLBACK } from "../src/lib/engine/display";
import { verdictLine, searchCoverage, quotePairNote } from "../src/lib/engine/card";
import { headerLine } from "../src/lib/engine/summary";

const BINARY = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0xff, 0x80, 0x00, 0xc3, 0x28]);
const sha1 = (b: Buffer) => createHash("sha1").update(b).digest("hex");

function fakeUploadBox(o: { name?: string; parent?: string; currentSha1?: string; onUpload?: (b: Buffer | string) => void; noteError?: string } = {}) {
  const uploads: (Buffer | string)[] = [];
  return {
    uploads,
    box: {
      fileInfo: async (id: string) => ({ currentVersionId: "cur", parentId: o.parent ?? "F", name: id === "OTHER" ? "runbook.md" : (o.name ?? "architecture.md") }),
      findFileByName: async (_f: string, n: string) => ({ fileId: n === "architecture.md" ? "ARCH" : "OTHER", fileName: n, currentVersionId: "cur" }),
      listFileVersions: async () => [{ versionId: "cur", createdAt: "", label: "v2", ...(o.currentSha1 ? { sha1: o.currentSha1 } : {}) }],
      downloadVersionText: async () => ({ ok: true as const, text: "v2", sha256: "sha256:" + createHash("sha256").update("v2").digest("hex") }),
      uploadFileVersion: async (fileId: string, _n: string, content: Buffer | string) => {
        uploads.push(content);
        o.onUpload?.(content);
        return { fileId, versionId: "NEW", ...(o.noteError ? { note_error: o.noteError } : {}) };
      },
    },
  };
}

describe("Codex 1: raw bytes reach Box unchanged", () => {
  it("uploadNewVersion passes a Buffer through; identical raw content (sha1) is not re-uploaded", async () => {
    const f = fakeUploadBox();
    const r = await uploadNewVersion(f.box as never, "F", "architecture.md", null, { content: BINARY, note: "n", saveMap: () => undefined });
    expect(r.uploaded).toBe(true);
    expect(Buffer.isBuffer(f.uploads[0])).toBe(true);
    expect((f.uploads[0] as Buffer).equals(BINARY)).toBe(true);
    const same = fakeUploadBox({ currentSha1: sha1(BINARY) });
    expect((await uploadNewVersion(same.box as never, "F", "architecture.md", null, { content: BINARY, note: "n", saveMap: () => undefined })).uploaded).toBe(false);
    expect(same.uploads).toHaveLength(0);
  });

  it("RealBoxAdapter.uploadFileVersion streams the exact bytes (no UTF-8 round trip)", async () => {
    let sent: Buffer | null = null;
    const client = {
      uploads: { uploadFileVersion: async (_id: string, body: { file: never }) => ((sent = await readByteStream(body.file)), { entries: [{ fileVersion: { id: "V9" } }] }) },
      comments: { createComment: async () => { throw new Error("comments down"); } },
    };
    const a = new RealBoxAdapter({ developerToken: "x" }, { client: client as never });
    const r = await a.uploadFileVersion("F1", "a.docx", BINARY, "note");
    expect(sent!.equals(BINARY)).toBe(true);
    expect(r.versionId).toBe("V9");
    expect(r.note_error).toMatch(/comments down/); // Codex 14: the note failure does not fail the committed upload
  });
});

describe("Codex 12: the target file is verified by parent and exact name", () => {
  it("rejects a supplied id whose Box name differs; drops a mismatched map entry and resolves by name", async () => {
    const f = fakeUploadBox();
    await expect(uploadNewVersion(f.box as never, "F", "architecture.md", null, { content: BINARY, note: "n", saveMap: () => undefined, fileId: "OTHER" })).rejects.toMatchObject({ code: "FILE_ID_NAME_MISMATCH" });
    expect(f.uploads).toHaveLength(0);
    const map = { folderId: "F", created_at: "", files: { "architecture.md": { fixtureFileId: "x", fileId: "OTHER", versions: {}, labels: {} } } };
    const saved: unknown[] = [];
    const r = await uploadNewVersion(f.box as never, "F", "architecture.md", map, { content: BINARY, note: "n", saveMap: (m) => saved.push(JSON.parse(JSON.stringify(m))) });
    expect(r.fileId).toBe("ARCH");
    expect(saved.at(-1)).toMatchObject({ files: {} }); // the stale entry is gone
    const wrongName = fakeUploadBox({ name: "renamed.md" });
    await expect(uploadNewVersion(wrongName.box as never, "F", "architecture.md", null, { content: BINARY, note: "n", saveMap: () => undefined })).rejects.toMatchObject({ code: "FILE_ID_NAME_MISMATCH" });
  });
});

describe("Codex 14: ancillary failures after a committed upload are warnings", () => {
  it("map save and version note failures come back as warnings with uploaded: true", async () => {
    const f = fakeUploadBox({ noteError: "429" });
    const map = { folderId: "F", created_at: "", files: { "architecture.md": { fixtureFileId: "x", fileId: "ARCH", versions: {}, labels: {} } } };
    const r = await uploadNewVersion(f.box as never, "F", "architecture.md", map, { content: BINARY, note: "n", saveMap: () => { throw new Error("EACCES"); } });
    expect(r.uploaded).toBe(true);
    expect(r.warnings!.map((w) => w.code).sort()).toEqual(["MAP_SAVE_FAILED", "VERSION_NOTE_FAILED"]);
  });
});

describe("Codex 13: request validation", () => {
  const ok = (b: unknown) => UploadVersionSchema.safeParse(b).success;
  it("strict base64, size limits, no silent empty upload, no unknown keys", () => {
    expect(ok({ file_name: "architecture.md" })).toBe(true);
    expect(ok({ file_name: "architecture.md", content_base64: BINARY.toString("base64") })).toBe(true);
    expect(ok({ file_name: "architecture.md", content_base64: "!!!!" })).toBe(false);
    expect(ok({ file_name: "architecture.md", content_base64: "abc" })).toBe(false);
    expect(ok({ file_name: "architecture.md", content_base64: "" })).toBe(false);
    expect(ok({ file_name: "architecture.md", content_base64: "", allow_empty: true })).toBe(true);
    expect(ok({ file_name: "" })).toBe(false);
    expect(ok({ file_name: "../x.md" })).toBe(false);
    expect(ok({ file_name: "architecture.md", extra: 1 })).toBe(false);
    expect(ok({ file_name: "architecture.md", scenario: "bogus" })).toBe(false);
    expect(ok({ file_name: "architecture.md", content_base64: "A".repeat(16 * 1024 * 1024) })).toBe(false);
  });

  it("the route maps schema errors to 400 codes and oversize bodies to 413", async () => {
    vi.resetModules();
    vi.doMock("next/server", () => ({ connection: async () => undefined }));
    const { POST } = await import("../src/app/api/upload-version/route");
    const post = (body: string, headers: Record<string, string> = {}) => POST(new Request("http://x/api/upload-version", { method: "POST", headers: { "content-type": "application/json", ...headers }, body }));
    const bad = await post(JSON.stringify({ file_name: "architecture.md", content_base64: "!!!!" }));
    expect(bad.status).toBe(400);
    expect((await bad.json()).error.code).toBe("BAD_CONTENT");
    expect((await post("x".repeat(10), { "content-length": String(64 * 1024 * 1024) })).status).toBe(413);
    vi.doUnmock("next/server");
  });
});

describe("Codex 2: admission is serialized", () => {
  it("two concurrent mock submits: exactly one is admitted", async () => {
    svc.reset();
    const rs = await Promise.allSettled([svc.uploadVersion({ file_name: "architecture.md" }), svc.uploadVersion({ file_name: "architecture.md" })]);
    expect(rs.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = rs.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(["RUN_ACTIVE", "ALREADY_SUBMITTED"]).toContain(rejected.reason.code);
    await (rs.find((r) => r.status === "fulfilled") as PromiseFulfilledResult<Awaited<ReturnType<typeof svc.uploadVersion>>>).value.done;
    svc.reset();
  });

  it("live: two concurrent uploads write to Box once; the second sees the admitted run; bytes are unchanged", async () => {
    const G = globalThis as unknown as { __keelLive?: Promise<unknown> };
    const saved = { mock: process.env.MOCK_MODE, path: process.env.KEEL_STORE_PATH, live: G.__keelLive };
    const storePath = path.join(os.tmpdir(), `keel-live-admission-${process.pid}-${Date.now()}.json`);
    process.env.MOCK_MODE = "false";
    process.env.KEEL_STORE_PATH = storePath;
    process.env.KEEL_POLL_INTERVAL_MS = "0";
    resetConfigCache();
    forgetStore();
    try {
      const mem = createMemoryStore("mock");
      const mock = new MockBoxAdapter(() => mem.data.mock_box!, () => {}, 0);
      const writes: Buffer[] = [];
      let gate!: () => void;
      const hold = new Promise<void>((r) => (gate = r));
      const box = Object.assign(mock, {
        fileInfo: async (id: string) => {
          const f = mem.data.mock_box!.files.find((x) => x.fileId === id)!;
          return { currentVersionId: f.versions.at(-1)!.versionId, parentId: "318840021", name: f.fileName };
        },
        findFileByName: async (_f: string, n: string) => {
          const f = mem.data.mock_box!.files.find((x) => x.fileName === n);
          return f ? { fileId: f.fileId, fileName: n, currentVersionId: f.versions.at(-1)!.versionId } : undefined;
        },
        uploadFileVersion: async (fileId: string, name: string, content: Buffer) => {
          await hold; // both requests would be past their checks here without the admission guard
          writes.push(content);
          const v = mock.uploadVersion(name, content.toString("latin1"), { comment: "test" });
          return { fileId, versionId: v.versionId };
        },
      });
      const evaluator = new MockEvaluator({ modelId: "m", inferenceProfile: "p", promptVersion: "v", promptHash: "h", timeScale: 0 });
      G.__keelLive = Promise.resolve({ box, evaluator, gate: new MockInputGate(0.5, 0) });
      const content_base64 = BINARY.toString("base64");
      const a = svc.uploadVersion({ file_name: "architecture.md", content_base64 });
      const b = svc.uploadVersion({ file_name: "architecture.md", content_base64 });
      await new Promise((r) => setTimeout(r, 20));
      gate();
      const rs = await Promise.allSettled([a, b]);
      expect(writes).toHaveLength(1);
      expect(writes[0].equals(BINARY)).toBe(true);
      const rej = rs.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
      expect(rej).toHaveLength(1);
      expect(rej[0].reason.code).toBe("RUN_ACTIVE");
      const okr = (rs.find((r) => r.status === "fulfilled") as PromiseFulfilledResult<Awaited<ReturnType<typeof svc.uploadVersion>>>).value;
      expect(okr.upload).toMatchObject({ uploaded: true });
      await okr.done;
    } finally {
      process.env.MOCK_MODE = saved.mock ?? "true";
      if (saved.path) process.env.KEEL_STORE_PATH = saved.path;
      G.__keelLive = saved.live;
      resetConfigCache();
      forgetStore();
      fs.rmSync(storePath, { force: true });
    }
  });
});

describe("Codex 17: shortStatus passes the wording filter", () => {
  it("an interpolated file or reviewer name with reserved wording falls back to a neutral line", () => {
    expect(shortOf({ kind: "needs_review_binding", label: "Needs review: evidence binding changed" }, "passed-controls.md")).toBe(SHORT_FALLBACK);
    expect(shortOf({ kind: "verified", label: "Verified", secondary: "Verified by Compliant Bot, r, on x v1, t" })).toBe(SHORT_FALLBACK);
    expect(shortOf({ kind: "needs_review_weakened", label: "Needs review: satisfied evidence missing" })).toBe(SHORT_FALLBACK);
    clean(SHORT_FALLBACK);
  });
});

describe("Codex 22: the verdict claims every file only with complete coverage", () => {
  it("complete on the hero; incomplete coverage names the files checked and the files not read", async () => {
    await runV3();
    const s = svc.internals.store();
    expect(searchCoverage(s, "S4", [["data-flow-and-classification.md", "runbook.md", "vendor-contract-summary.md", "approved-services-and-exceptions.md"]]).complete).toBe(true);
    expect(searchCoverage(s, "S4", [["runbook.md"]]).complete).toBe(false);
    const rows = (await import("../src/lib/engine/state")).buildRows(s, fixture.profile(), "S4");
    const row = rows.find((r) => r.control_id === "SEC-ARCH-07")!;
    const card = svc.getFindingCard("SEC-ARCH-07");
    const step = { source: "boxai", startMs: 0, kind: "tool_call", tool: "box_ai_ask", label: "Box AI ask over 2 files, 0 cited statements", result: { cited_statements: 0 } } as TraceStep;
    const line = verdictLine(row, card.finding, [step], null, () => 2, { complete: false, checked: ["architecture.md", "runbook.md"], not_read: ["vendor-contract-summary.md"] });
    expect(line).toBe("4 of 5 clauses unsupported in the files checked: architecture.md and runbook.md. vendor-contract-summary.md was not read. Box AI found 0 citations across the other 2 files.");
    expect(line).not.toMatch(/every file/);
    clean(line);
    svc.reset();
  });

  it("quarantine: the gated file is not read, so no row claims every file", async () => {
    svc.reset();
    await (await svc.submit({ scenario: "injection" })).done!;
    expect(searchCoverage(svc.internals.store(), "S4", [["a"]]).not_read).toEqual(["runbook.md"]);
    for (const r of svc.getPackageView().rows) expect(svc.getFindingCard(r.control_id).verdict_line).not.toMatch(/every file/);
    svc.reset();
  });
});

describe("Codex 23: outcome backfill honours the recorded row flags", () => {
  it("a recorded decision_recorded flag counts as recorded without the live ledger", async () => {
    const sub = await runV3();
    const st = svc.internals.store().data.runs[sub.run_id].outcome!;
    delete st.open_decisions;
    delete st.decision_summary;
    delete st.files;
    for (const r of st.rows!) if (r.control_id !== "SEC-ARCH-07") { r.needs_decision = false; r.decision_recorded = r.control_id === "SEC-ARCH-05" || r.control_id === "SEC-ARCH-22"; }
    // 05 keeps its recorded acknowledge label, but its flag says recorded: it must not count as open.
    const o = svc.getRun(sub.run_id).outcome!;
    expect(o.open_decisions).toBe(1);
    expect(o.decision_summary).toBe("1 Critical needs your decision.");
    expect(o.files!.find((f) => f.file_name === "architecture.md")!.open_decisions).toBe(1);
    svc.reset();
  });
});

describe("Codex 15/16/18: display strings from the API", () => {
  it("header_line, holds_line, changed_files/changed_line, hover_line, pending_status across states", async () => {
    svc.reset();
    let pv = svc.getPackageView();
    expect(pv.header_line).toBe("8 verifications hold");
    expect(pv.holds_line).toBe("8 verifications hold");
    expect(pv.changed_line).toBe("runbook.md v2 · snapshot S3");
    expect(pv.files!.every((f) => f.hover_line === undefined)).toBe(true);
    expect(pv.pending_status).toMatchObject({ rule: 1, kind: "pending_recheck", label: "Re-check pending", projection_code: "PENDING", tone: "grey", short: "Re-checking against the new snapshot" });
    expect(pendingStatus()).toEqual(pv.pending_status);

    const sub = await svc.submit({ scenario: "architecture_v3" });
    await sub.done!;
    pv = svc.getPackageView();
    expect(pv.header_line).toBe("Re-checked 8 controls");
    expect(pv.holds_line).toBe("5 verifications hold");
    expect(pv.changed_files).toEqual(["architecture.md"]);
    expect(pv.changed_line).toBe("architecture.md v3 · snapshot S4");
    const hov = Object.fromEntries(pv.files!.map((f) => [f.file_name, f.hover_line]));
    expect(hov["architecture.md"]).toBe("Keel: 2 controls need your decision");
    expect(hov["runbook.md"]).toBe("Keel: 1 control needs your decision");
    expect(hov["vendor-contract-summary.md"]).toBeUndefined();
    const o = svc.getRun(sub.run_id).outcome!;
    expect(o).toMatchObject({ header_line: "Re-checked 8 controls", holds_line: "5 verifications hold", changed_files: ["architecture.md"], changed_line: "architecture.md v3 · snapshot S4" });

    const c7 = svc.getFindingCard("SEC-ARCH-07");
    const d = await svc.draftAuthorMessage(c7.finding.finding_id, DANA_REASON);
    await svc.act({ finding_id: c7.finding.finding_id, control_id: "SEC-ARCH-07", decision_snapshot_id: "S4", action: "return_to_author", reason: DANA_REASON, author_message: d.text });
    await svc.act({ finding_id: "KEEL-2026-0408", control_id: "SEC-ARCH-22", decision_snapshot_id: "S4", action: "verify", reason: "ok" });
    const c5 = svc.getFindingCard("SEC-ARCH-05");
    await svc.act({ finding_id: c5.finding.finding_id, control_id: "SEC-ARCH-05", decision_snapshot_id: "S4", action: "acknowledge" });
    pv = svc.getPackageView();
    expect(pv.holds_line).toBe("5 verifications hold"); // the acknowledged 05 is in RECORDED, not in the holds list
    expect(pv.files!.find((f) => f.file_name === "runbook.md")!.hover_line).toBe("Keel: every decision recorded");
    expect(pv.files!.find((f) => f.file_name === "architecture.md")!.hover_line).toBe("Keel: every decision recorded");
    for (const t of [pv.header_line!, pv.holds_line!, pv.changed_line!, ...pv.files!.flatMap((f) => (f.hover_line ? [f.hover_line] : []))]) clean(t);

    svc.reset();
    await (await svc.submit({ scenario: "injection" })).done!;
    pv = svc.getPackageView();
    expect(pv.header_line).toBe("Re-checked 6 controls · 2 not evaluated");
    expect(pv.changed_line).toBe("runbook.md v3 · snapshot S4");
    expect(headerLine(pv.rows, "pending", false)).toBe("Re-checking 8 controls…");
    svc.reset();
  });

  it("quote_pair_note: absent for a shown quote; distinguishes quarantine, unreadable, pending and proven absence", async () => {
    await runV3();
    for (const id of ["SEC-ARCH-07", "SEC-ARCH-22", "SEC-ARCH-05"]) expect(svc.getFindingCard(id).quote_pair_note).toBeUndefined();
    svc.reset();
    await (await svc.submit({ scenario: "injection" })).done!;
    expect(svc.getFindingCard("SEC-ARCH-22").quote_pair_note).toBe("The current file was withheld by the input gate, so no sentence was checked.");
    svc.reset();
    await (await svc.submit({ scenario: "unreadable" })).done!;
    expect(svc.getFindingCard("SEC-ARCH-01").quote_pair_note).toBe("The current file could not be read, so no sentence was checked.");
    const rows = (await import("../src/lib/engine/state")).buildRows(svc.internals.store(), fixture.profile(), "S4");
    const r01 = rows.find((r) => r.control_id === "SEC-ARCH-01")!;
    expect(quotePairNote({ ...r01, status: { ...r01.status, kind: "pending_recheck" } })).toBe("The re-check is still running; no current sentence yet.");
    expect(quotePairNote({ ...r01, status: { ...r01.status, kind: "needs_review_absent" }, state: { ...r01.state, machine_assessment: "evidence_absent", evaluation_state: "complete" } })).toBe("No sentence in the current snapshot supports this control.");
    for (const r of rows) clean(quotePairNote(r));
    svc.reset();
  });
});

// ------------------------------------------------------------------------------------------------
// UI v4.1 (docs/research/51-ui-v4-1-team-review.md, "API additions")
// ------------------------------------------------------------------------------------------------

import { labelWords, parseStandard, TIMELINE_DETAIL_MAX_WORDS, TIMELINE_LABEL_MAX_WORDS, RULE_NAME_MAX_WORDS } from "../src/lib/engine/history";
import type { TimelinePoint } from "../src/lib/types";

function checkTimeline(points: TimelinePoint[]) {
  for (const p of points) {
    expect(labelWords(p.label), p.label).toBeLessThanOrEqual(TIMELINE_LABEL_MAX_WORDS);
    expect(words(p.detail), p.detail).toBeLessThanOrEqual(TIMELINE_DETAIL_MAX_WORDS);
    clean(p.label);
    clean(p.detail);
  }
  expect(points.filter((p) => p.current)).toHaveLength(1);
}

async function allThreeActions() {
  const c7 = svc.getFindingCard("SEC-ARCH-07");
  const d = await svc.draftAuthorMessage(c7.finding.finding_id, DANA_REASON);
  await svc.act({ finding_id: c7.finding.finding_id, control_id: "SEC-ARCH-07", decision_snapshot_id: "S4", action: "return_to_author", reason: DANA_REASON, author_message: d.text });
  await svc.act({ finding_id: "KEEL-2026-0408", control_id: "SEC-ARCH-22", decision_snapshot_id: "S4", action: "verify", reason: "ok" });
  await svc.act({ finding_id: svc.getFindingCard("SEC-ARCH-05").finding.finding_id, control_id: "SEC-ARCH-05", decision_snapshot_id: "S4", action: "acknowledge" });
}

describe("v4.1: rule source and rule name", () => {
  it("parses the standard string into standard and clause", () => {
    expect(parseStandard("IS-STD-014 Cryptography v4.2 §5.1")).toEqual({ standard: "IS-STD-014 Cryptography v4.2", clause: "§5.1", id: "IS-STD-014" });
    expect(parseStandard("IS-STD-030 Resilience and Recovery v2.2 §3")).toMatchObject({ clause: "§3", id: "IS-STD-030" });
    expect(parseStandard("Internal rule")).toEqual({ standard: "Internal rule", id: "Internal" });
  });

  it("every row carries rule_name (<= 5 words) and rule_source from the profile", () => {
    svc.reset();
    const rows = svc.getPackageView().rows;
    for (const r of rows) {
      expect(words(r.rule_name!)).toBeLessThanOrEqual(RULE_NAME_MAX_WORDS);
      clean(r.rule_name!);
      expect(r.rule_source!.profile_version).toBe("2026.3");
      expect(r.rule_source!.framework_map_status).toBe("illustrative; not reviewed by a compliance owner");
      for (const t of [r.rule_source!.chip, r.rule_source!.origin_label, r.rule_source!.set_by]) clean(t);
    }
    const by = (id: string) => rows.find((r) => r.control_id === id)!;
    expect(by("SEC-ARCH-07").rule_name).toBe("Encryption and key management");
    expect(by("SEC-ARCH-07").rule_source).toMatchObject({ standard: "IS-STD-014 Cryptography v4.2", clause: "§5.1", chip: "IS-STD-014 §5.1", origin: "team_standard", origin_label: "Bank standard", set_by: "Security Architecture (ARB)" });
    expect(by("SEC-ARCH-07").rule_source!.framework_map).toContain("NIST CSF 2.0 PR.DS-01");
    expect(by("SEC-ARCH-01").rule_source).toMatchObject({ origin: "learned_from_reviews", origin_label: "Learned from reviews", set_by: "ARB review history 2024–2026" });
    expect(by("SEC-ARCH-17").rule_source).toMatchObject({ origin: "international_standard", origin_label: "International standard", reference: "ISO/IEC 27001:2022 A.8.15" });
    expect(svc.getFindingCard("SEC-ARCH-07").row.rule_source!.chip).toBe("IS-STD-014 §5.1");
  });
});

describe("v4.1: dashboard tiles", () => {
  it("Hold / Need you / Recorded at S3, after the run, and after all three actions", async () => {
    svc.reset();
    const tiles = () => svc.getPackageView().dashboard!.tiles.map((t) => [t.key, t.label, t.value, t.tone]);
    expect(tiles()).toEqual([["hold", "Hold", 8, "teal"], ["need_you", "Need you", 0, "grey"], ["recorded", "Recorded", 0, "grey"]]);
    await (await svc.submit({ scenario: "architecture_v3" })).done!;
    expect(tiles()).toEqual([["hold", "Hold", 5, "teal"], ["need_you", "Need you", 3, "amber"], ["recorded", "Recorded", 0, "grey"]]);
    await allThreeActions();
    expect(tiles()).toEqual([["hold", "Hold", 5, "teal"], ["need_you", "Need you", 0, "grey"], ["recorded", "Recorded", 3, "blue"]]);
    const t = svc.getPackageView().dashboard!.tiles;
    expect(t.find((x) => x.key === "need_you")!.value).toBe(svc.getPackageView().open_decisions);
    svc.reset();
  });
});

describe("v4.1: timelines", () => {
  it("package timeline: one point per snapshot, labels and tones", async () => {
    svc.reset();
    let tl = svc.getPackageView().timeline!;
    expect(tl.map((p) => [p.snapshot_id, p.label, p.tone, p.current])).toEqual([
      ["S1", "baseline", "grey", false],
      ["S2", "8 verified", "blue", false],
      ["S3", "runbook v2 · holds", "teal", true],
    ]);
    expect(tl[2]).toMatchObject({ detail: "runbook.md v2 changed. 8 verifications hold.", changed_files: ["runbook.md"] });
    checkTimeline(tl);
    await (await svc.submit({ scenario: "architecture_v3" })).done!;
    tl = svc.getPackageView().timeline!;
    expect(tl[3]).toMatchObject({ snapshot_id: "S4", label: "architecture v3 · 3 need you", detail: "architecture.md v3 changed. 3 need your decision.", tone: "amber", changed_files: ["architecture.md"], current: true });
    checkTimeline(tl);
    await allThreeActions();
    tl = svc.getPackageView().timeline!;
    expect(tl[3]).toMatchObject({ label: "architecture v3 · recorded", tone: "blue" });
    checkTimeline(tl);
    svc.reset();
  });

  it("control timeline: verified, holds, needs review, returned, acknowledged", async () => {
    await runV3();
    const tl = (id: string) => svc.getFindingCard(id).timeline!;
    expect(tl("SEC-ARCH-07").map((p) => p.label)).toEqual(["needs review", "verified by Priya", "holds", "architecture v3 · needs review"]);
    expect(tl("SEC-ARCH-01").map((p) => p.label)).toEqual(["pending review", "verified by Marcus", "holds", "holds"]);
    expect(tl("SEC-ARCH-22").at(-1)).toMatchObject({ label: "architecture v3 · needs review", tone: "amber", changed_files: ["architecture.md"] });
    for (const id of ["SEC-ARCH-07", "SEC-ARCH-22", "SEC-ARCH-05", "SEC-ARCH-01"]) checkTimeline(tl(id));
    expect(tl("SEC-ARCH-07")[1].tone).toBe("blue"); // a Verified on an earlier snapshot is never green
    await allThreeActions();
    expect(tl("SEC-ARCH-07").at(-1)).toMatchObject({ label: "returned to author", detail: "architecture.md v3 changed. Returned by Dana Okafor; due Oct 23.", tone: "blue" });
    expect(tl("SEC-ARCH-05").at(-1)).toMatchObject({ label: "architecture v3 · acknowledged", tone: "teal" });
    expect(tl("SEC-ARCH-22").at(-1)).toMatchObject({ tone: "green", current: true });
    for (const id of ["SEC-ARCH-07", "SEC-ARCH-22", "SEC-ARCH-05"]) checkTimeline(tl(id));
    svc.reset();
  });
});

describe("v4.1: agreed, changed, open_in_document", () => {
  it("07 replaced, 22 moved, 05 section changed, a hold has no changed block", async () => {
    await runV3();
    const c7 = svc.getFindingCard("SEC-ARCH-07");
    expect(c7.agreed).toMatchObject({ file: "architecture.md", version_label: "v2", verified_by: "Priya Natarajan", byline: "Verified by Priya Natarajan · v2 §4.3 · Oct 8" });
    expect(c7.agreed!.quote).toMatch(/customer-managed keys, rotated annually/);
    expect(c7.changed).toMatchObject({ kind: "replaced", heading: "Changed in architecture.md v3 §4.3", file: "architecture.md", version_label: "v3", version_id: "1801102233" });
    expect(c7.changed!.quote).toMatch(/^All customer data is protected/);
    expect(c7.open_in_document).toEqual({ file_id: "1650233401", version_id: "1801102233", sentence: c7.changed!.quote });

    const c22 = svc.getFindingCard("SEC-ARCH-22");
    expect(c22.changed).toMatchObject({ kind: "moved", heading: "Now in runbook.md v2 §3", file: "runbook.md", file_id: "1650233403", version_id: "1801102252" });
    expect(c22.open_in_document).toMatchObject({ file_id: "1650233403", version_id: "1801102252" });

    const c5 = svc.getFindingCard("SEC-ARCH-05");
    expect(c5.changed).toMatchObject({ kind: "section_changed", heading: "Section changed around it · v3 §4.2" });
    expect(c5.changed!.quote).toBe(c5.agreed!.quote);

    const c1 = svc.getFindingCard("SEC-ARCH-01");
    expect(c1.changed).toBeNull();
    expect(c1.agreed!.byline).toBe("Verified by Marcus Hale · v1 §1 · Oct 8");
    expect(c1.open_in_document).toMatchObject({ file_id: "1650233405", version_id: "1801102271" });
    for (const c of [c7, c22, c5, c1]) for (const t of [c.agreed?.byline, c.changed?.heading].filter((x): x is string => !!x)) clean(t);
    svc.reset();
  });

  it("not evaluated (quarantine): changed kind none, no claim about the sentence", async () => {
    svc.reset();
    await (await svc.submit({ scenario: "injection" })).done!;
    const c = svc.getFindingCard("SEC-ARCH-22");
    expect(c.changed).toMatchObject({ kind: "none", heading: "Not checked in runbook.md v3" });
    expect(c.changed!.quote).toBeUndefined();
    svc.reset();
  });
});

describe("v4.1: GET /api/file-text", () => {
  it("returns the pinned text of a snapshot version; 404 for a version no snapshot pinned", async () => {
    svc.reset();
    const v2 = await svc.getFileText("1650233401", "1801102232");
    expect(v2).toMatchObject({ file_id: "1650233401", version_id: "1801102232", version_label: "v2", file_name: "architecture.md", snapshot_ids: ["S2", "S3"] });
    expect(v2.text).toBe(fixture.text("architecture-v2.md"));
    await expect(svc.getFileText("1650233401", "1801102233")).rejects.toMatchObject({ code: "NOT_FOUND", status: 404 }); // v3 not pinned before the run
    await expect(svc.getFileText("", "x")).rejects.toMatchObject({ status: 400 });
    await (await svc.submit({ scenario: "architecture_v3" })).done!;
    const v3 = await svc.getFileText("1650233401", "1801102233");
    expect(v3).toMatchObject({ version_label: "v3", snapshot_ids: ["S4"] });
    expect(v3.text).toContain(svc.getFindingCard("SEC-ARCH-07").changed!.quote!);

    vi.resetModules();
    vi.doMock("next/server", () => ({ connection: async () => undefined }));
    const { GET } = await import("../src/app/api/file-text/route");
    const ok = await GET(new Request("http://x/api/file-text?file_id=1650233401&version_id=1801102233"));
    expect(ok.status).toBe(200);
    expect((await ok.json()).file_name).toBe("architecture.md");
    expect((await GET(new Request("http://x/api/file-text?file_id=1650233401&version_id=999"))).status).toBe(404);
    vi.doUnmock("next/server");
    svc.reset();
  });
});
