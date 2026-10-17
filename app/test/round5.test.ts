/** Judge pass 3 (app/.review/judge3/verdict.md): engine items A1, B2, B5, C12, C13. */
import { describe, expect, it } from "vitest";
import { fixture } from "../src/lib/fixture";
import { buildFindingCard } from "../src/lib/engine/card";
import { draftFromBrief } from "../src/lib/engine/draft";
import { DANA_22, harness } from "./helpers";

describe("A1: the run record keeps its outcome", () => {
  it("rows, count lines and snapshots survive a reset and are listed by /api/runs", async () => {
    const svc = await import("../src/lib/service");
    svc.reset();
    const sub = await svc.submit({ scenario: "architecture_v3" }, { wait: true });
    svc.reset();
    const run = svc.getRun(sub.run_id);
    expect(run.outcome).toMatchObject({
      snapshot_id: "S4",
      prior_snapshot_id: "S3",
      prior_count_line: "8 controls on snapshot S3: 8 Verified holds",
      pending_count_line: "8 controls on snapshot S4: 8 Re-check pending",
      count_line: fixture.expected().expected_count_line_before,
    });
    expect(run.outcome!.rows!.map((r) => r.status.label)).toEqual(fixture.expected().findings.map((f) => f.expected_display));
    expect(svc.getPackageView().count_line).toBe("8 controls on snapshot S3: 8 Verified holds"); // the store itself is the baseline
    expect(svc.listRuns().runs.find((r) => r.run_id === sub.run_id)!.outcome!.count_line).toBe(fixture.expected().expected_count_line_before);
    svc.reset();
  });
});

describe("B2: suggested reason names every unsupported clause; no doubled closing sentence", () => {
  const HERO =
    "architecture.md v3 §4.3 no longer states AES-256 per-store keys, the KMS customer-managed key model, annual rotation or the key custodians; no other file in the package does either. IS-STD-014 §5.1 requires all four. Restore them or cite where they are now documented.";
  it("the hero reads the judge's sentence exactly", async () => {
    const h = harness();
    await h.run("architecture_v3");
    const card = buildFindingCard(h.store, h.profile, h.config, h.store.data.findings["KEEL-2026-0405"]);
    expect(card.actions.return_to_author.suggested_reason).toBe(HERO);
  });
  it("a reason that already asks to restore or cite gets no second closing sentence", () => {
    const brief = { reviewer: "Dana Okafor", reviewer_role_short: "ARB reviewer", reason: HERO, fileName: "architecture.md", section_number: "§4.3", new_version_label: "v3", lost_quotes: ["a", "b"], focus: "key model" };
    const t = draftFromBrief(brief);
    expect(t.match(/Restore them or cite/g)).toHaveLength(1);
    expect(t.endsWith('Lost from architecture.md §4.3 in v3: "a" and "b"')).toBe(true);
    expect(draftFromBrief({ ...brief, reason: "The key model is gone." })).toMatch(/Restore them or cite where the key model is now documented\.$/);
  });
});

describe("B5: the quarantine task names every affected control", () => {
  it("label, message, control and finding lists, and the trace label", async () => {
    const h = harness();
    const r = await h.run("injection");
    const t = h.store.data.tasks.find((x) => (x as { purpose?: string }).purpose === "input_gate_quarantine") as unknown as { label: string; control_ids: string[]; finding_ids: string[]; message: string };
    expect(t.label).toBe("Quarantine review · runbook.md v3 · SEC-ARCH-17, SEC-ARCH-22");
    expect(t.control_ids).toEqual(["SEC-ARCH-17", "SEC-ARCH-22"]);
    expect(t.finding_ids).toEqual([h.row("SEC-ARCH-17").finding_id, h.row("SEC-ARCH-22").finding_id]);
    expect(t.message.startsWith("Quarantine review · runbook.md v3 · SEC-ARCH-17, SEC-ARCH-22.")).toBe(true);
    const step = h.store.data.runs[r.run_id].steps.find((s) => s.kind === "box_task_created")!;
    expect(step.label).toContain("Quarantine review · runbook.md v3 · SEC-ARCH-17, SEC-ARCH-22");
  });
});

describe("C12 and C13: binding sections and removed sentences on the card", () => {
  it("SEC-ARCH-22 lists §3 and §4; the hero lists the removed sentences with the clauses they supported", async () => {
    const h = harness();
    await h.run("architecture_v3");
    const c22 = buildFindingCard(h.store, h.profile, h.config, h.store.data.findings["KEEL-2026-0408"]);
    expect(c22.binding_sections).toEqual(["§3 Deployment and rollback", "§4 Backup"]);
    const hero = buildFindingCard(h.store, h.profile, h.config, h.store.data.findings["KEEL-2026-0405"]);
    const aes = hero.removed_sentences!.find((r) => r.quote.startsWith("Each data store has its own AES-256 key"))!;
    expect(aes).toMatchObject({ section: "§4.3 Encryption at rest and key management", supported_clauses: ["AES-256 stated"] });
    const kms = hero.removed_sentences!.find((r) => r.quote.startsWith("All customer data at rest is encrypted using AWS KMS"))!;
    expect(kms.supported_clauses).toEqual(["encryption at rest stated", "key management model stated (AWS KMS customer-managed keys or CipherTrust)", "rotation period stated (at least annually)", "key custodians named"]);
    expect(hero.removed_sentences).toHaveLength(2);
    await h.respond("SEC-ARCH-22", "approved", DANA_22);
  });
});
