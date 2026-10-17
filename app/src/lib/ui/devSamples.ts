/**
 * Dev-only sample props for /dev/components, assembled by hand from demo-data/lantern.
 * Server-only (reads the fixture with fs). Never used by the product screens: those
 * render what the API returns. Labels here come from expected-findings.json's
 * expected_display, which is a test oracle, so this page is a gallery, not a status source.
 */
import fs from "node:fs";
import path from "node:path";
import type {
  Control,
  ControlProfile,
  ControlRow,
  DisplayKind,
  DisplayedStatus,
  Finding,
  FindingCard,
  Ledger,
  PackageView,
  ProjectionCode,
  Snapshot,
  Trace,
} from "@/lib/types";

const ROOT = path.join(process.cwd(), "..", "demo-data", "lantern");
const readJson = <T,>(f: string): T => JSON.parse(fs.readFileSync(path.join(ROOT, f), "utf8")) as T;
const readText = (f: string) => fs.readFileSync(path.join(ROOT, f), "utf8");

type Expected = {
  project: string;
  application_id: string;
  application_tier: string;
  regulatory_scope: string;
  arb_decision: PackageView["header"]["arb_decision"];
  expected_count_line_before: string;
  expected_count_line_after: string;
  trigger: { versionComment: string; uploadedBy: string };
  findings: Finding[];
};

const KIND: Record<ProjectionCode, DisplayKind> = {
  PENDING: "pending_recheck",
  NOT_EVALUATED: "not_evaluated",
  VERIFIED: "verified",
  VERIFIED_HOLDS: "verified_holds",
  ACKNOWLEDGE: "acknowledge",
  NEEDS_REVIEW_BINDING: "needs_review_binding",
  NEEDS_REVIEW_WEAKENED: "needs_review_weakened",
  NEEDS_REVIEW_ABSENT: "needs_review_absent",
  NEEDS_REVIEW_CONFLICT: "needs_review_conflict",
  RETURNED_TO_AUTHOR: "returned_to_author",
  NOT_APPLICABLE: "not_applicable",
  EXCEPTION: "exception_approved",
};
const RULE: Partial<Record<DisplayKind, number>> = {
  pending_recheck: 1,
  not_evaluated: 2,
  returned_to_author: 8,
  verified: 9,
  verified_holds: 10,
  acknowledge: 11,
  needs_review_binding: 12,
  needs_review_weakened: 13,
};
const TONE: Partial<Record<DisplayKind, DisplayedStatus["tone"]>> = {
  pending_recheck: "grey",
  not_evaluated: "grey",
  returned_to_author: "blue",
  verified: "green",
  verified_holds: "teal",
  acknowledge: "amber",
  needs_review_binding: "amber",
  needs_review_weakened: "amber",
};

function status(label: string, code: ProjectionCode, secondary?: string, severity?: DisplayedStatus["severity"]): DisplayedStatus {
  const kind = KIND[code];
  return { rule: RULE[kind] ?? 16, kind, label, projection_code: code, tone: TONE[kind] ?? "grey", secondary, severity };
}

/** Extract a markdown section's body by its heading prefix, e.g. "### 4.3". */
function section(md: string, heading: string): string {
  const lines = md.split("\n");
  const start = lines.findIndex((l) => l.startsWith(heading));
  if (start < 0) return "";
  const out: string[] = [];
  for (let i = start + 1; i < lines.length; i++) {
    if (/^#{1,3} /.test(lines[i])) break;
    out.push(lines[i]);
  }
  return out.join("\n").trim();
}

export function devSamples() {
  const profile = readJson<ControlProfile>("profile-us-bank.json");
  const snaps = readJson<{ folderId: string; snapshots: Snapshot[] }>("snapshots.json");
  const ledger = readJson<Ledger>("ledger.json");
  const exp = readJson<Expected>("expected-findings.json");
  const trace = readJson<Trace>("agent-trace.json");
  const s4 = snaps.snapshots.find((s) => s.snapshot_id === "S4")!;
  const ctl = (id: string) => profile.controls.find((c) => c.id === id) as Control;

  const rowFor = (f: Finding, after: boolean): ControlRow => {
    const pe = f.prior_evidence[0];
    const label = after ? f.expected_display_after_human_action ?? f.expected_display! : f.expected_display!;
    const code = (after ? f.expected_projection_code_after_human_action ?? f.expected_projection_code : f.expected_projection_code)!;
    const secondary =
      code === "VERIFIED" && f.control_id === "SEC-ARCH-22"
        ? "Verified by Dana Okafor, ARB reviewer, Technology Resilience, on runbook.md v2, 2026-10-17T15:34:23Z"
        : code === "RETURNED_TO_AUTHOR"
          ? "Returned by Dana Okafor, ARB reviewer, Technology Resilience, 2026-10-17T15:33:53Z, due 2026-10-23T17:00:00Z"
          : pe?.verified_by
            ? `Verified by ${pe.verified_by}, ${pe.verified_role}, on ${pe.fileName} ${pe.versionLabel}, ${pe.verified_at}`
            : undefined;
    const sev = code.startsWith("NEEDS_REVIEW") || code === "ACKNOWLEDGE" ? f.severity ?? (f.control_id === "SEC-ARCH-22" ? "Low" : f.tier === "Critical" ? "Critical" : "High") : undefined;
    const ev = f.evidence[0];
    return {
      control_id: f.control_id,
      title: f.control_title,
      tier: f.tier,
      severity: sev as ControlRow["severity"],
      reviewer_role: ctl(f.control_id).reviewer_role,
      status: status(label, code, secondary, sev as DisplayedStatus["severity"]),
      evidencing: ev ? { fileName: ev.fileName, versionLabel: ev.versionLabel, versionId: ev.versionId, section: ev.section } : null,
      finding_id: f.finding_id,
      machine_assessment: f.machine_assessment,
      change_classification: f.change_classification,
      verification_holds: f.verification_holds,
      acknowledgment_required: f.acknowledgment_required,
      current_disposition: after && code === "RETURNED_TO_AUTHOR" ? "returned_to_author" : after && code === "VERIFIED" ? "verified" : "unreviewed",
      prior_verification: pe
        ? {
            actor: pe.verified_by ?? "",
            role: pe.verified_role ?? "",
            snapshot_id: pe.verified_snapshot_id ?? "S2",
            fileId: pe.fileId,
            fileName: pe.fileName,
            versionId: pe.versionId,
            verified_at: pe.verified_at ?? "",
            event_id: "EVT-seed",
          }
        : null,
    };
  };

  const rowsBefore = exp.findings.map((f) => rowFor(f, false));
  const rowsAfter = exp.findings.map((f) => rowFor(f, true));
  const rowsPending = rowsBefore.map((r) => ({
    ...r,
    status: { ...status("Re-check pending", "PENDING"), struck: "Verified, holds" },
  }));

  const lastProjection = [...ledger.events].reverse().find((e) => e.event_type === "box_metadata_written" && e.phase !== "seed");
  const fw = (lastProjection?.fields_written ?? {}) as Record<string, string>;

  const pkg: PackageView = {
    mode: "mock",
    header: {
      folderId: ledger.folderId,
      folderName: ledger.folderName,
      project: exp.project,
      application_id: exp.application_id,
      application_tier: exp.application_tier,
      regulatory_scope: exp.regulatory_scope,
      arb_decision: exp.arb_decision,
    },
    snapshot: s4,
    prior_snapshot_id: "S3",
    profile: { profile_id: profile.profile_id, profile_version: profile.profile_version, name: profile.name },
    evaluation_state: "complete",
    rows: rowsBefore,
    count_line: exp.expected_count_line_before,
    counts: {},
    projection: {
      keel_snapshot_id: fw.keel_snapshot_id ?? "S4",
      keel_last_human_review: fw.keel_last_human_review ?? null,
      keel_record_url: fw.keel_record_url ?? "",
      statuses: Object.fromEntries(
        Object.entries(fw)
          .filter(([k]) => k.startsWith("keel_status_"))
          .map(([k, v]) => [k.replace("keel_status_", "").replace(/_/g, "-"), v as ProjectionCode]),
      ),
      written_at: lastProjection?.ts,
      result: "ok",
      last_projected_snapshot: lastProjection?.last_projected_snapshot,
      pointer_check: lastProjection?.pointer_check,
    },
    trace_run_id: trace.run_id,
    elapsed_ms: trace.total_duration_ms,
    gate: { ran: true, label: "Decider 2B: injection no (0.03), material change: evaluate now (0.91)" },
    search_tool: { label: "Box AI ask", fallback: false },
  };

  const hero = exp.findings.find((f) => f.control_id === "SEC-ARCH-07")!;
  const v2 = readText("architecture-v2.md");
  const v3 = readText("architecture-v3.md");
  const pe = hero.prior_evidence[0];
  const ev = hero.evidence[0];
  const fileOf = (fileId: string, versionId: string, label: string) => {
    const all = snaps.snapshots.flatMap((s) => s.files);
    const f = all.find((x) => x.fileId === fileId && x.versionId === versionId)!;
    return { ...f, versionLabel: label };
  };
  const thread = ledger.events.filter((e) => e.control_id === "SEC-ARCH-07");
  const agentStep = trace.steps.find((s) => s.kind === "agent_evaluation");
  const subs = ((agentStep?.detail as { substeps?: Trace["steps"] })?.substeps ?? []).filter(
    (s) => JSON.stringify(s).includes("SEC-ARCH-07") || JSON.stringify(s).includes("customer-managed"),
  );

  const heroCard: FindingCard = {
    finding: { ...hero, severity: "Critical" },
    control: ctl("SEC-ARCH-07"),
    profile_version: profile.profile_version,
    row: rowsBefore.find((r) => r.control_id === "SEC-ARCH-07")!,
    prior_version: {
      file: fileOf(pe.fileId, pe.versionId, "v2"),
      uploader: "K. Lindqvist",
      verified_by: pe.verified_by,
      verified_role: pe.verified_role,
      verified_at: pe.verified_at,
      section: pe.section,
      page: pe.page,
      quote: pe.quote,
      deep_link: pe.box_deep_link,
      text: section(v2, "### 4.3"),
    },
    new_version: {
      file: fileOf(ev.fileId, ev.versionId, "v3"),
      uploader: exp.trigger.uploadedBy,
      version_comment: exp.trigger.versionComment,
      section: ev.section,
      page: ev.page,
      quote: ev.quote,
      deep_link: ev.box_deep_link,
      text: section(v3, "### 4.3"),
    },
    related: rowsBefore,
    actions: {
      return_to_author: { enabled: true, default_due_at: "2026-10-23T17:00:00Z", author: "J. Park (Eng)" },
      verify: {
        enabled: false,
        reason: "4 of 5 required clauses have no supporting quote in any file of snapshot S4.",
        attestation_phrase: profile.attestation_phrase,
      },
      proposed: ["not_applicable", "compensating_control", "exception_requested", "false_positive"],
    },
    reviewer: { name: "Dana Okafor", role: "ARB reviewer, Technology Resilience", box_user_id: "30118804", source: "identity as returned by Box (fixture)" },
    binding_fresh: true,
    thread: thread.filter((e) => e.phase === "seed" || e.event_type === "control_evaluated" || e.event_type === "box_task_created"),
    trace_steps: subs,
  };

  return { pkg, rowsBefore, rowsAfter, rowsPending, countAfter: exp.expected_count_line_after, trace, heroCard, ledger };
}
