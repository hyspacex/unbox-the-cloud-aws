/**
 * The full mock pipeline on scenario architecture_v3 (acceptance 1, 2, 3, 4, 4b, 13) and the two
 * human actions, checked against expected-findings.json (test oracle only) and the fixture ledger.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { fixture } from "../src/lib/fixture";
import { verifyChain, MACHINE_TEXT_BANNED } from "../src/lib/engine/ledger";
import { buildFindingCard } from "../src/lib/engine/card";
import { DANA_22, DANA_REASON, harness } from "./helpers";

const expected = fixture.expected();
const fixtureEvent = (id: string) => fixture.ledger().events.find((e) => e.event_id === id)!;

describe("demo state machine on the mock adapters", () => {
  const h = harness();
  let run: Awaited<ReturnType<typeof h.run>>;

  beforeAll(async () => {
    run = await h.run("architecture_v3");
  });

  it("boots on S3 with eight Verified holds (seed phase of the ledger)", () => {
    const fresh = harness();
    expect(fresh.store.data.current_snapshot_id).toBe("S3");
    expect(fresh.store.events.at(-1)!.event_id).toBe("EVT-0067");
    expect(fresh.countLine()).toBe("8 controls on snapshot S3: 8 Verified holds");
  });

  it("captures S4 with the fixture's file versions and content hashes", () => {
    expect(run.outcome).toBe("complete");
    const s4 = h.store.snapshot("S4")!;
    const fx = fixture.snapshots().snapshots.find((s) => s.snapshot_id === "S4")!;
    expect(s4.files.map((f) => [f.fileId, f.versionId, f.contentHash])).toEqual(fx.files.map((f) => [f.fileId, f.versionId, f.contentHash]));
  });

  it("produces exactly the eight expected displays and projection codes, and the before count line", () => {
    const rows = h.rows();
    for (const f of expected.findings) {
      const r = rows.find((x) => x.control_id === f.control_id)!;
      expect(r.status.label, f.control_id).toBe(f.expected_display);
      expect(r.status.projection_code, f.control_id).toBe(f.expected_projection_code);
      expect(r.machine_assessment, f.control_id).toBe(f.machine_assessment);
      expect(r.change_classification, f.control_id).toBe(f.change_classification);
      expect(r.verification_holds, f.control_id).toBe(f.verification_holds);
      expect(r.acknowledgment_required, f.control_id).toBe(f.acknowledgment_required);
    }
    expect(h.countLine()).toBe(expected.expected_count_line_before);
  });

  it("clause support matches the oracle clause by clause (quote, section, paragraph, page)", () => {
    for (const f of expected.findings) {
      const st = h.row(f.control_id).state;
      const got = st.clause_support.map((c) => [c.clause_id, c.support, c.quote?.quote ?? null, c.quote?.section ?? null, c.quote?.paragraph ?? null, c.quote?.page ?? null]);
      const want = f.clause_support.map((c) => [c.clause_id, c.support, c.quote?.quote ?? null, c.quote?.section ?? null, c.quote?.paragraph ?? null, c.quote?.page ?? null]);
      expect(got, f.control_id).toEqual(want);
      expect(st.binding?.quote, f.control_id).toBe(f.evidence[0].quote);
    }
  });

  it("acceptance 1: the hero is weakened with correct clause marks and Verify disabled with a reason", () => {
    const st = h.row("SEC-ARCH-07").state;
    expect(st.machine_assessment).toBe("evidence_weakened");
    expect(st.clause_support.map((c) => c.support)).toEqual(["supported", "unsupported", "unsupported", "unsupported", "unsupported"]);
    const card = buildFindingCard(h.store, h.profile, h.config, h.store.data.findings[h.row("SEC-ARCH-07").finding_id!]);
    expect(card.finding.finding_id).toBe("KEEL-2026-0405");
    expect(card.actions.verify.enabled).toBe(false);
    expect(card.actions.verify.reason).toBe("Verify is disabled: no document in this package supports the AES-256, key model, rotation period or key custodians clause.");
    expect(card.actions.return_to_author.enabled).toBe(true);
    expect(card.prior_version?.file.versionLabel).toBe("v2");
    expect(card.new_version?.file.versionLabel).toBe("v3");
    expect(card.new_version?.uploader).toBe("svc-confluence-export");
    expect(card.new_version?.version_comment).toBe("Section 4 rewrite for clarity");
    expect(card.prior_version?.text).toContain("customer-managed keys");
    expect(card.new_version?.text).toContain("industry-standard encryption");
    // Basis bullets come from recorded operations, including the exact Box AI query.
    expect(card.finding.basis).toContain("Box AI ask over 4 other files, query 'customer-managed keys OR CipherTrust OR key rotation OR key custodians': 0 cited statements.");
    expect(card.finding.basis).toContain("3 other assertions changed in §4.3.");
    expect(card.trace_steps?.some((s) => s.tool === "box_ai_ask")).toBe(true);
  });

  it("acceptance 2: recovery moved to the runbook, severity Low, no inherited Verified", () => {
    const r = h.row("SEC-ARCH-22");
    expect([r.machine_assessment, r.change_classification, r.status.severity, r.current_disposition]).toEqual(["evidence_found", "moved", "Low", "unreviewed"]);
    expect(r.evidencing).toMatchObject({ fileName: "runbook.md", versionLabel: "v2", section: "§3 Deployment and rollback" });
    const ev = h.eventsOf("binding_changed", "S4");
    expect(ev).toHaveLength(1);
    expect(ev[0].note).toBe(fixtureEvent("EVT-0087").note);
    expect(h.store.data.findings[r.finding_id!].basis).toContain("Box AI ask over 4 other files, query 'RTO OR RPO OR roll back': 1 cited statement in runbook.md §3, validated against pinned text.");
  });

  it("acceptance 3 and 4: holds for unchanged sections, Acknowledge for SEC-ARCH-05's softened §4.2", () => {
    expect(h.eventsOf("verification_holds", "S4").map((e) => e.control_id)).toEqual(["SEC-ARCH-01", "SEC-ARCH-02", "SEC-ARCH-04", "SEC-ARCH-17", "SEC-ARCH-20"]);
    const ack = h.eventsOf("verification_requires_acknowledgment", "S4");
    expect(ack.map((e) => e.control_id)).toEqual(["SEC-ARCH-05"]);
    expect(ack[0].note).toBe(fixtureEvent("EVT-0084").note);
    expect(ack[0].acknowledgment).toEqual(fixtureEvent("EVT-0084").acknowledgment);
    // Staleness notes equal the fixture's for every control.
    for (const e of h.eventsOf("verification_holds", "S4")) {
      const fx = fixture.ledger().events.find((x) => x.snapshot_id === "S4" && x.event_type === "verification_holds" && x.control_id === e.control_id)!;
      expect(e.note, e.control_id!).toBe(fx.note);
    }
  });

  it("acceptance 4b: machine events carry current_disposition and prior_verification, never a human disposition", () => {
    const machine = h.store.events.filter((e) => e.snapshot_id === "S4" && e.actor.type !== "human");
    for (const e of machine) expect(e.human_disposition, e.event_id).toBeUndefined();
    const perControl = machine.filter((e) => e.control_id && ["control_evaluated", "verification_holds", "verification_requires_acknowledgment", "binding_changed"].includes(e.event_type));
    expect(perControl.length).toBe(15);
    for (const e of perControl) {
      expect(e.current_disposition).toBe("unreviewed");
      expect(e.prior_verification?.event_id).toMatch(/^EVT-00(3[7-9]|4[0-4])$/);
    }
  });

  it("writes the ledger in the fixture's order and extends a valid chain", () => {
    const types = run.events.map((e) => e.event_type);
    const fx = fixture.ledger().events.filter((e) => e.snapshot_id === "S4" && e.event_id <= "EVT-0092").map((e) => e.event_type);
    expect(types).toEqual(fx);
    expect(run.events[0].event_id).toBe("EVT-0068");
    expect(verifyChain(h.store.events).ok).toBe(true);
  });

  it("projects folder metadata equal to the fixture's S4 projection (EVT-0089)", () => {
    const w = run.events.find((e) => e.event_type === "box_metadata_written")!;
    expect(w.fields_written).toEqual(fixtureEvent("EVT-0089").fields_written);
    expect(w.pointer_check).toEqual({ current_snapshot_id: "S4", matches: true });
    expect(h.box.metadata()).toEqual(fixtureEvent("EVT-0089").fields_written);
  });

  it("creates review tasks A (SEC-ARCH-07), C (SEC-ARCH-22), D (SEC-ARCH-05) for Dana with immutable mappings", () => {
    expect(run.tasks.map((t) => [t.control_id, t.finding_id, t.assignee, t.fileId])).toEqual([
      ["SEC-ARCH-07", "KEEL-2026-0405", "Dana Okafor", "1650233401"],
      ["SEC-ARCH-22", "KEEL-2026-0408", "Dana Okafor", "1650233403"],
      ["SEC-ARCH-05", "KEEL-2026-0404", "Dana Okafor", "1650233401"],
    ]);
    expect(run.tasks.map((t) => t.task_id)).toEqual(["box-task-77120931", "box-task-77120932", "box-task-77120933"]);
    const m = h.store.data.task_mappings["box-asgn-88120931"];
    expect(m).toEqual({ task_id: "box-task-77120931", assignment_id: "box-asgn-88120931", finding_id: "KEEL-2026-0405", control_id: "SEC-ARCH-07", snapshot_id: "S4", immutable: true });
    expect(Object.isFrozen(m)).toBe(true);
    expect(run.tasks[0].message).toContain("KEEL-2026-0405 (snapshot S4)");
    expect(run.tasks[2].message).toBe(fixtureEvent("EVT-0092").task!.message);
  });

  it("finding ids KEEL-2026-0401..0408 follow profile order", () => {
    expect(run.findings.map((f) => f.finding_id)).toEqual(expected.findings.map((f) => f.finding_id));
  });

  it("the human actions: return to author (author task first), verify SEC-ARCH-22 on runbook.md v2; the after count line", async () => {
    const a = await h.respond("SEC-ARCH-07", "rejected", DANA_REASON, { completed_at: "2026-10-17T15:33:40Z" });
    expect(a.result).toBe("applied");
    expect(a.mapped_action).toBe("returned_to_author");
    expect(a.author_task?.message).toBe(fixtureEvent("EVT-0094").task!.message);
    expect(a.author_task?.due_at).toBe("2026-10-23T17:00:00Z");
    expect(a.author_task?.assignee).toBe("J. Park (Eng)");
    const types = a.events.map((e) => e.event_type);
    expect(types.slice(0, 3)).toEqual(["box_task_response_ingested", "box_task_created", "human_disposition_recorded"]);
    const ingest = a.events[0];
    expect(ingest.response).toMatchObject({ resolution_state: "rejected", message: DANA_REASON, completed_at: "2026-10-17T15:33:40Z", dedup_key: "box-asgn-88120931|2026-10-17T15:33:40Z" });
    expect(ingest.reviewer_identity).toEqual(fixtureEvent("EVT-0093").reviewer_identity);
    const d = a.events[2];
    expect(d.human_disposition).toBe("returned_to_author");
    expect(d.author_task_id).toBe(a.author_task!.task_id);
    expect(d.due_at).toBe("2026-10-23T17:00:00Z");

    const v = await h.respond("SEC-ARCH-22", "approved", DANA_22, { completed_at: "2026-10-17T15:34:10Z" });
    expect(v.result).toBe("applied");
    expect(v.mapped_action).toBe("verified");
    const vd = v.events.find((e) => e.event_type === "human_disposition_recorded")!;
    expect([vd.fileName, vd.versionId, vd.rebinding]).toEqual(["runbook.md", "1801102252", "re-verified on runbook.md v2"]);

    const rows = h.rows();
    for (const f of expected.findings) {
      const r = rows.find((x) => x.control_id === f.control_id)!;
      expect(r.status.label, f.control_id).toBe(f.expected_display_after_human_action);
      expect(r.status.projection_code, f.control_id).toBe(f.expected_projection_code_after_human_action);
    }
    expect(h.countLine()).toBe(expected.expected_count_line_after);
    expect(h.row("SEC-ARCH-22").status.tone).toBe("green");
    const last = h.store.events.filter((e) => e.event_type === "box_metadata_written").at(-1)!;
    const want = { ...fixtureEvent("EVT-0098").fields_written } as Record<string, string>;
    const got = { ...(last.fields_written as Record<string, string>) };
    expect(got.keel_last_human_review.split("|").slice(0, 4)).toEqual(want.keel_last_human_review.split("|").slice(0, 4));
    delete got.keel_last_human_review;
    delete want.keel_last_human_review;
    expect(got).toEqual(want);
    expect(verifyChain(h.store.events).ok).toBe(true);
    // SEC-ARCH-05's task D stays open; the row stays Acknowledge.
    expect(h.openTask("SEC-ARCH-05")?.task_id).toBe("box-task-77120933");
  });

  it("acceptance 13: after the new snapshot the prior verification is history, not the current disposition", () => {
    const r = h.row("SEC-ARCH-01");
    expect(r.current_disposition).toBe("unreviewed");
    expect(r.prior_verification?.event_id).toBe("EVT-0040");
    expect(r.status.secondary).toContain("Verified by Marcus Hale");
  });

  it("no machine-authored string contains satisfied, compliant, passed or regressed", () => {
    const machineText: string[] = [];
    for (const e of h.store.events.filter((x) => x.phase === "live" && x.actor.type !== "human")) {
      machineText.push(...(e.basis ?? []), String(e.note ?? ""), String((e.task as { message?: string } | undefined)?.message ?? ""), String(e.explanation ?? ""));
      if (e.model_basis) machineText.push(...(e.model_basis as string[]));
    }
    for (const r of h.rows()) machineText.push(r.status.label, r.status.secondary ?? "");
    for (const f of Object.values(h.store.data.findings)) machineText.push(...f.basis, f.suggested_action ?? "");
    const card = buildFindingCard(h.store, h.profile, h.config, h.store.data.findings["KEEL-2026-0405"]);
    machineText.push(card.actions.verify.reason ?? "", card.actions.return_to_author.reason ?? "");
    const joined = machineText.join("\n").toLowerCase();
    for (const w of MACHINE_TEXT_BANNED) expect(joined.includes(w), w).toBe(false);
  });
});
