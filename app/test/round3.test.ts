/** Judge pass 2 (app/.review/judge2/verdict.md): engine items A1, A2, B6 to B11. */
import { describe, expect, it } from "vitest";
import { fixture } from "../src/lib/fixture";
import { buildFindingCard, suggestedReason } from "../src/lib/engine/card";
import { attestationPresent } from "../src/lib/engine/wording";
import { DANA_REASON, harness } from "./helpers";

const PHRASE = "I attest the cited evidence meets the requirement.";

describe("A1: a moved binding's card describes the new binding", () => {
  it("SEC-ARCH-22: new_version is runbook.md v2 §3 with the quote; old_location says what became of architecture.md v3 §4.6", async () => {
    const h = harness();
    await h.run("architecture_v3");
    const card = buildFindingCard(h.store, h.profile, h.config, h.store.data.findings["KEEL-2026-0408"]);
    const nv = card.new_version!;
    expect(nv.file).toMatchObject({ fileName: "runbook.md", versionId: "1801102252", versionLabel: "v2", contentHash: "sha256:a32ca4d883048fba03241a6f0ed1d1300d0154d7af3370336bd63ebcc76476ca" });
    expect(nv.section).toBe("§3 Deployment and rollback");
    expect(nv.quote).toBe("Deployments roll back to the previous published Lambda version within 15 minutes; RTO 4 hours and RPO 15 minutes per BIA Tier 1.");
    expect(nv.deep_link).toBe("https://app.box.com/file/1650233403?version=1801102252");
    expect(nv.uploader).toBe("Kevin Lindqvist");
    expect(nv.text).toContain("Revert to last good");
    expect(card.old_location).toMatchObject({ section: "§4.6 Resilience and recovery", note: "architecture.md v3 §4.6 no longer contains the quote" });
    expect(card.old_location!.file).toMatchObject({ fileName: "architecture.md", versionLabel: "v3" });
    expect(card.old_location!.text).toContain("designed for resilience");
    // Weakened keeps today's behaviour: the same file, word diff, no old_location.
    const hero = buildFindingCard(h.store, h.profile, h.config, h.store.data.findings["KEEL-2026-0405"]);
    expect(hero.new_version!.file.fileName).toBe("architecture.md");
    expect(hero.old_location).toBeNull();
  });
});

describe("A2: reset keeps recorded runs", () => {
  it("submit, reset: /api/runs still lists the run and its trace replays", async () => {
    const svc = await import("../src/lib/service");
    svc.reset();
    const sub = await svc.submit({ scenario: "architecture_v3" }, { wait: true });
    svc.reset();
    expect(svc.listRuns().runs.map((r) => r.run_id)).toContain(sub.run_id);
    expect(svc.getRun(sub.run_id).steps.length).toBeGreaterThan(10);
    expect(svc.getPackageView().count_line).toBe("8 controls on snapshot S3: 8 Verified holds");
    expect(() => svc.getRun("run-does-not-exist")).toThrow(expect.objectContaining({ code: "NOT_FOUND", status: 404 }));
    const next = await svc.submit({ scenario: "architecture_v3" }, { wait: true });
    expect(next.run_id).not.toBe(sub.run_id); // run ids keep counting after a reset
    svc.reset();
  });
});

describe("B6: attestation matching", () => {
  it("is case-insensitive and ignores trailing punctuation and whitespace; the message is stored verbatim", async () => {
    expect(attestationPresent("Looks right. i attest the cited evidence meets the requirement", PHRASE)).toBe(true);
    expect(attestationPresent("I ATTEST the cited   evidence meets the requirement!  ", PHRASE)).toBe(true);
    expect(attestationPresent("I attest the evidence meets the requirement.", PHRASE)).toBe(false);
    const h = harness();
    await h.run("architecture_v3");
    const msg = "Recovery targets present in runbook §3. i attest the cited evidence meets the requirement";
    const r = await h.respond("SEC-ARCH-22", "approved", msg);
    expect(r.mapped_action).toBe("verified");
    expect(h.eventsOf("human_disposition_recorded", "S4").at(-1)!.comment).toBe(msg);
  });
});

describe("B7: suggested reason", () => {
  it("renders the hero sentence exactly and never says 'no longer supported'", async () => {
    const h = harness();
    await h.run("architecture_v3");
    const card = buildFindingCard(h.store, h.profile, h.config, h.store.data.findings["KEEL-2026-0405"]);
    expect(card.actions.return_to_author.suggested_reason).toBe(
      "architecture.md v3 §4.3 no longer states the KMS customer-managed key model, annual rotation or the key custodians; no other file in the package does either. IS-STD-014 §5.1 requires all three. Restore them or cite where they are now documented.",
    );
    const st = h.row("SEC-ARCH-07").state;
    expect(suggestedReason(h.store, h.store.data.findings["KEEL-2026-0405"], { standard: "IS-STD-014 Cryptography v4.2 §5.1" }, st)).not.toMatch(/no longer supported/);
  });
});

describe("B8: Box task messages are plain text", () => {
  it("the author draft and the author task carry no backticks; the event says plain_text", async () => {
    const h = harness();
    await h.run("architecture_v3");
    const r = await h.respond("SEC-ARCH-07", "rejected", DANA_REASON);
    expect(r.author_task!.message).toContain("lantern-s3-snapshots, lantern-ddb-state");
    expect(r.author_task!.message).not.toContain("`");
    const created = r.events.find((e) => e.event_type === "box_task_created")!;
    expect(created.plain_text).toBe(true);
    expect(h.box.tasks().every((t) => !t.message.includes("`"))).toBe(true);
  });
});

describe("B9: export scope and per-phase counts", () => {
  it("phase=live exports only this app's events with scope run; the manifest counts each phase", async () => {
    const svc = await import("../src/lib/service");
    svc.reset();
    await svc.submit({ scenario: "architecture_v3" }, { wait: true });
    const all = svc.exportManifest();
    const run = svc.exportManifest("live");
    expect(all.scope).toBe("ledger");
    expect(run.scope).toBe("run");
    expect(all.counts_by_phase!.seed).toEqual({ events: 67, controls_evaluated: 24, verification_holds: 8, human_dispositions: 8 });
    expect(all.counts_by_phase!.live).toMatchObject({ controls_evaluated: 8, verification_holds: 5, human_dispositions: 0 });
    expect(run.event_count).toBe(all.counts_by_phase!.live.events);
    expect(run.limitation).toBe(svc.EXPORT_LIMITATION);
    expect(String(all.export)).toMatch(/in this ledger: seed fixture and run run-/);
    const csv = svc.exportCsv("live").trim().split("\n");
    expect(csv).toHaveLength(run.event_count + 1);
    expect(csv.slice(1).every((l) => l.split(",")[2] === "live")).toBe(true);
    svc.reset();
  });
});

describe("B10: changed_nothing is exact", () => {
  it("true for the five holding controls only, not for SEC-ARCH-05's acknowledgment", async () => {
    const h = harness();
    await h.run("architecture_v3");
    const ev = h.eventsOf("control_evaluated", "S4");
    expect(ev.filter((e) => e.changed_nothing).map((e) => e.control_id)).toEqual(["SEC-ARCH-01", "SEC-ARCH-02", "SEC-ARCH-04", "SEC-ARCH-17", "SEC-ARCH-20"]);
    expect(ev.find((e) => e.control_id === "SEC-ARCH-05")!.changed_nothing).toBe(false);
  });
});

describe("B11: short Not evaluated labels, quarantined evidencing, run summary", () => {
  it("injection: 'Not evaluated: input quarantined', full reason in detail, evidencing names runbook.md v3 (quarantined), summary 6/2", async () => {
    const h = harness();
    const r = await h.run("injection");
    const row = h.row("SEC-ARCH-17");
    expect(row.status.label).toBe("Not evaluated: input quarantined");
    expect(row.status.detail).toMatch(/^runbook\.md v3 quarantined by the input gate/);
    expect(row.evidencing).toEqual({ fileName: "runbook.md", versionLabel: "v3", versionId: row.evidencing!.versionId, quarantined: true });
    expect(r.summary).toEqual({ evaluated: 6, not_evaluated: 2 });
    const h2 = harness();
    await h2.run("fabricated_quote");
    expect(h2.row("SEC-ARCH-07").status.label).toBe("Not evaluated: quote not found");
    expect(fixture.expected().findings).toHaveLength(8);
  });
});

describe("integration round: intake failures, search cancellation, unreadable codes", () => {
  it("a version-history failure is a recorded error, not a crashed run; nothing is captured", async () => {
    const h = harness();
    h.box.uploadVersion("architecture.md", fixture.text("architecture-v3.md"), { versionId: "1801102233" });
    const orig = h.box.listFileVersions.bind(h.box);
    h.box.listFileVersions = async (id: string) => {
      if (id === "1650233403") throw Object.assign(new Error("Box 500 on /files/1650233403/versions"), { code: "BOX_VERSIONS_FAILED" });
      return orig(id);
    };
    const r = await h.run();
    expect(r.outcome).toBe("error");
    expect(r.error).toMatchObject({ code: "BOX_VERSIONS_FAILED" });
    expect(r.error!.message).toMatch(/reading the version history for runbook\.md failed/);
    expect(h.store.data.current_snapshot_id).toBe("S3");
    expect(h.store.events.at(-1)).toMatchObject({ event_type: "evaluation_error", snapshot_id: null });
    expect(h.countLine()).toBe("8 controls on snapshot S3: 8 Verified holds");
    h.box.listFileVersions = orig;
    expect((await h.run()).snapshot_id).toBe("S4"); // the next submit captures normally
  });

  it("the search tool scopes Box AI to the evaluation's abort signal", async () => {
    const h = harness();
    const seen: (AbortSignal | undefined)[] = [];
    (h.box as unknown as { withSignal: (s: AbortSignal) => typeof h.box }).withSignal = (s) => {
      seen.push(s);
      return h.box;
    };
    const ac = new AbortController();
    const { MockEvaluator } = await import("../src/lib/agent/mock-evaluator");
    const inner = new MockEvaluator({ modelId: "m", inferenceProfile: "p", promptVersion: "v3", promptHash: "h", timeScale: 0 });
    await h.run("architecture_v3", {
      kind: "mock",
      evaluate: (i, tools, s) => inner.evaluate(i, { search: { search: (q, ex) => tools.search.search(q, ex, ac.signal) } }, s),
    });
    // First the transaction-deadline signal scopes every Box call; then each search uses the evaluation's own signal.
    expect(seen[0]).toBeInstanceOf(AbortSignal);
    expect(seen[0]).not.toBe(ac.signal);
    expect(seen.slice(1)).toEqual([ac.signal, ac.signal]);
  });

  it("binary-extraction read errors are labelled file unreadable", async () => {
    const { notEvaluatedCategory } = await import("../src/lib/engine/display");
    expect(notEvaluatedCategory("TEXT_REPRESENTATION_CURRENT_ONLY")).toBe("file unreadable");
    expect(notEvaluatedCategory("VERSION_CHANGED_DURING_EXTRACTION")).toBe("file unreadable");
  });
});
