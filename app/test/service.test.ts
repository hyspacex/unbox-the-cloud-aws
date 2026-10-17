/** The service facade end to end in mock mode (the same calls the API routes make). */
import { describe, expect, it } from "vitest";
import * as svc from "../src/lib/service";
import { fixture } from "../src/lib/fixture";
import { DANA_REASON } from "./helpers";

describe("service facade, mock state machine (CONTRACTS.md)", () => {
  it("reset -> package S3 -> submit -> before line -> return to author -> verify -> after line -> ledger/export", async () => {
    const r0 = svc.reset();
    expect(r0.count_line).toBe("8 controls on snapshot S3: 8 Verified holds");
    const sub = await svc.submit({ scenario: "architecture_v3" });
    expect(sub).toMatchObject({ snapshot_id: "S4", evaluation_state: "pending" });
    await expect(svc.submit({ scenario: "architecture_v3" })).rejects.toMatchObject({ code: "RUN_ACTIVE" });
    const run = await sub.done!;
    expect(run.done).toBe(true);
    expect(run.status).toBe("done");
    expect(run.mode_label).toBe("Mock");
    expect(run.steps.map((s) => s.source)).toEqual(expect.arrayContaining(["box", "app", "decider", "agent", "boxai"]));
    const pv = svc.getPackageView();
    expect(pv.count_line).toBe(fixture.expected().expected_count_line_before);
    expect(pv.gate.ran).toBe(true);
    expect(pv.projection?.keel_snapshot_id).toBe("S4");

    const card = svc.getFindingCard("SEC-ARCH-07");
    expect(card.finding.finding_id).toBe("KEEL-2026-0405");
    const draft = await svc.draftAuthorMessage(card.finding.finding_id, DANA_REASON);
    expect(draft.drafted_by).toBe("box_ai_text_gen");
    const a = await svc.act({ finding_id: card.finding.finding_id, control_id: "SEC-ARCH-07", decision_snapshot_id: "S4", action: "return_to_author", reason: DANA_REASON, author_message: draft.text });
    expect(a.result).toBe("applied");
    expect(a.row.status.label).toBe("Returned to author, open");
    expect(a.author_task?.message).toBe(draft.text);
    const v = await svc.act({ finding_id: "KEEL-2026-0408", control_id: "SEC-ARCH-22", decision_snapshot_id: "S4", action: "verify", reason: "Recovery targets present in runbook §3; binding updated." });
    expect(v.result).toBe("applied");
    expect(v.count_line).toBe(fixture.expected().expected_count_line_after);
    await expect(svc.act({ finding_id: "", control_id: "SEC-ARCH-01", decision_snapshot_id: "S4", action: "verify" })).rejects.toMatchObject({ code: "NO_OPEN_TASK" });

    const ledger = svc.getLedger();
    expect(ledger.chain_verification.ok).toBe(true);
    expect(svc.getLedger({ control: "SEC-ARCH-07" }).events.every((e) => e.control_id === "SEC-ARCH-07")).toBe(true);
    const m = svc.exportManifest();
    expect(m.limitation).toBe(svc.EXPORT_LIMITATION);
    expect(m.run_ids).toEqual([sub.run_id]);
    expect(m.snapshot_ids).toEqual(["S1", "S2", "S3", "S4"]);
    expect(m.event_count).toBe(ledger.events.length);
    expect(m.chain_head).toBe(ledger.chain.head);
    const csv = svc.exportCsv();
    expect(csv.split("\n")[0]).toBe(svc.CSV_COLUMNS.join(","));
    expect(csv.trim().split("\n")).toHaveLength(ledger.events.length + 1);
    const tasks = await svc.getTasks();
    expect(tasks.tasks.map((t) => [t.control_id, t.kind, t.status])).toEqual([
      ["SEC-ARCH-07", "author", "open"],
      ["SEC-ARCH-05", "reviewer", "open"],
      ["SEC-ARCH-22", "reviewer", "completed"],
      ["SEC-ARCH-07", "reviewer", "completed"],
    ]);
    expect(svc.reset().count_line).toBe("8 controls on snapshot S3: 8 Verified holds");
  });
});
