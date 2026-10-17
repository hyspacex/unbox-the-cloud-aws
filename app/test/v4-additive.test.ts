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
    // The acknowledged row keeps its engine label; only the open-decision count changes.
    expect(pv.rows.find((r) => r.control_id === "SEC-ARCH-05")!.status.kind).toBe("acknowledge");
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
