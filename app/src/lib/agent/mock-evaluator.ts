/**
 * Mock evaluator (Evaluator kind "mock"). It plays the model's raw output for the Lantern fixture:
 * per required clause, which quote in which pinned file supports it (the same catalogue gen.py's
 * mock judge uses), and nothing else. Code derives assessment, classification, staleness and the
 * displayed status, exactly as on the live path.
 *
 * The mock is data-driven rather than snapshot-keyed: for each clause it cites the first catalogue
 * quote that is actually present in the pinned text it was given, so the same catalogue produces
 * S4's clause support (expected-findings.json) and any other combination of uploads. It calls the
 * provided search tool for real (Box AI ask against the mock Box, with citations validated by code)
 * and reports trace steps with a compressed but real wall clock.
 *
 * Scenarios that deliberately misbehave, for the acceptance cases: fabricated_quote (cites a
 * sentence that is not in the pinned text), missing_finding (seven findings for eight controls),
 * unknown_control (an extra finding for a control id not in the profile), disposition_field
 * (a finding carrying a disposition key; the strict schema rejects it).
 */
import type { Evaluator, EvaluatorInput, EvaluatorResult, SearchSnapshotTool } from "./evaluator.types";
import type { ControlFindingOut, FindingSet, QuoteRef } from "./schema";
import type { TraceStep } from "../types";
import { findQuote, quoteValid } from "../engine/normalize";

const A = "architecture.md";
const DFC = "data-flow-and-classification.md";
const RB = "runbook.md";
const VEN = "vendor-contract-summary.md";
const ASE = "approved-services-and-exceptions.md";

/** gen.py Q: the quotes a model cites from the Lantern documents. */
export const Q = {
  "01": "This list names every AWS service and third-party component in the Project Lantern design and records whether it is on the Approved Cloud Services Catalog or is used under an approved exception.",
  "01x": "Amazon OpenSearch Serverless is the one service used under an exception (EXC-2026-0117).",
  "02": "The snapshot bucket, the session table and the vector index are classified Confidential / NPI (GLBA), and Lantern is outside PCI DSS scope because full PANs are masked before ingestion.",
  "02dfc": "This document classifies every data store and data flow in Project Lantern under the Meridian Data Classification Standard (IS-STD-003) and records the regulatory scope of each.",
  "04": "All human access to Lantern, for agents and engineers, authenticates through the Meridian enterprise IdP with phishing-resistant MFA; Lantern has no local user accounts.",
  "05": "Privileged access to the Lantern production accounts is brokered through the enterprise PAM vault; there is no shared administrator account, and the named break-glass role is LanternBreakGlass, which requires two-person approval and expires after 4 hours.",
  "05roles": "| `LanternApiRole` | `lantern-api` | Invoke `lantern-orchestrator`; read the session table. |",
  "07": "All customer data at rest is encrypted using AWS KMS customer-managed keys, rotated annually; key custodians are the Card Servicing Platform leads.",
  "07aes": "Each data store has its own AES-256 key: `lantern-s3-snapshots`, `lantern-ddb-state`, `lantern-aoss-index` and `lantern-logs`.",
  "07w": "All customer data is protected with industry-standard encryption, with keys managed through AWS's native key management capabilities.",
  "07v1": "Data at rest is encrypted in all Lantern data stores.",
  "17": "Security events from CloudTrail, VPC Flow Logs, Bedrock model invocation logs and Lantern application audit logs are forwarded to the enterprise SIEM (Splunk) and retained per IS-STD-021; the alert owner is the Security Operations Center, with Card Servicing Platform on-call as secondary.",
  "20": "Third parties are Corvid Systems (ticketing software, self-hosted), TPRM-2026-0412, inherent risk Tier 2, assessment current to 2027-03, and Amazon Web Services (cloud provider), TPRM-2025-0007, inherent risk Tier 1, assessment current to 2026-12.",
  "20halcyon":
    "For Tier 3 escalations, Corvid may transfer Customer Data contained in escalated tickets, including attachments and account information copied into tickets, to Halcyon Support Services, Austin TX, for the purpose of reproducing and resolving the reported defect.",
  "22": "Deployments roll back to the previous published Lambda version within 15 minutes; RTO 4 hours and RPO 15 minutes per BIA Tier 1.",
  "22b": "AWS Backup copies the table and bucket daily to the backup vault in account `mtb-backup-prod`, same Region, with 35-day retention and Vault Lock in compliance mode, so backups cannot be deleted or shortened by anyone in the Lantern accounts.",
  "22arch_b": "Backups are copied daily to a vault-locked AWS Backup vault in the separate account `mtb-backup-prod`.",
} as const;
type QKey = keyof typeof Q;
type Candidate = { file: string; q: QKey };

interface CatalogueEntry {
  /** clause suffix ("1", "2", ...) -> candidates in preference order */
  clauses: Record<string, Candidate[]>;
  conflicts?: Candidate[];
  /** The bounded Box AI question the agent asks when the prior quote changed (agent-trace.json). */
  search?: string;
}

const c = (file: string, q: QKey): Candidate => ({ file, q });
const all = (n: number, cand: Candidate[]) => Object.fromEntries(Array.from({ length: n }, (_, i) => [String(i + 1), cand]));

export const Q07_QUERY = "customer-managed keys OR CipherTrust OR key rotation OR key custodians";
export const Q22_QUERY = "RTO OR RPO OR roll back";

export const CATALOGUE: Record<string, CatalogueEntry> = {
  "SEC-ARCH-01": { clauses: { "1": [c(ASE, "01")], "2": [c(A, "01x")] } },
  "SEC-ARCH-02": { clauses: { "1": [c(DFC, "02dfc")], "2": [c(A, "02")], "3": [c(A, "02")] } },
  "SEC-ARCH-04": { clauses: all(3, [c(A, "04")]) },
  "SEC-ARCH-05": { clauses: { "1": [c(A, "05roles")], "2": [c(A, "05")], "3": [c(A, "05")], "4": [c(A, "05")] } },
  "SEC-ARCH-07": {
    clauses: { "1": [c(A, "07"), c(A, "07w"), c(A, "07v1")], "2": [c(A, "07aes")], "3": [c(A, "07")], "4": [c(A, "07")], "5": [c(A, "07")] },
    search: Q07_QUERY,
  },
  "SEC-ARCH-17": { clauses: all(3, [c(A, "17")]) },
  "SEC-ARCH-20": { clauses: all(4, [c(A, "20")]), conflicts: [c(VEN, "20halcyon")] },
  "SEC-ARCH-22": {
    clauses: { "1": [c(A, "22"), c(RB, "22")], "2": [c(A, "22"), c(RB, "22")], "3": [c(A, "22arch_b"), c(RB, "22b")] },
    search: Q22_QUERY,
  },
};

const sleep = (ms: number) => (ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve());

export interface MockEvaluatorOptions {
  modelId: string;
  inferenceProfile: string;
  promptVersion: string;
  promptHash: string;
  /** 1 = compressed real wall clock (about 7 s of agent time), 0 = immediate (tests). */
  timeScale?: number;
}

export class MockEvaluator implements Evaluator {
  readonly kind = "mock" as const;
  constructor(private readonly o: MockEvaluatorOptions) {}

  async evaluate(input: EvaluatorInput, tools: { search: SearchSnapshotTool }, onStep?: (s: TraceStep) => void, opts: { signal?: AbortSignal } = {}): Promise<EvaluatorResult> {
    if (opts.signal?.aborted) throw new Error("evaluation aborted before it started");
    const scale = this.o.timeScale ?? 0;
    const t0 = Date.now();
    const steps: TraceStep[] = [];
    const emit = (s: TraceStep) => {
      steps.push(s);
      onStep?.(s);
    };
    const timed = async <T>(minMs: number, f: () => Promise<T>): Promise<{ v: T; startMs: number; durationMs: number }> => {
      const s = Date.now();
      const v = await f();
      const spent = Date.now() - s;
      if (minMs * scale > spent) await sleep(minMs * scale - spent);
      return { v, startMs: s - t0, durationMs: Date.now() - s };
    };

    // 1. Read the controls, the texts and the hints.
    const read = await timed(2600, async () => undefined);
    emit({
      source: "agent",
      kind: "model_turn",
      label: `Reading requirement, required clauses, applicability and evidence for ${input.controls.length} controls with ${input.files.length} file texts and diff hints`,
      startMs: read.startMs,
      durationMs: read.durationMs,
      ts: new Date(t0 + read.startMs).toISOString(),
    });

    // 2. Look at the prior evidence of every control whose bound quote changed.
    const changed = input.diff_hints.filter((h) => h.status !== "present");
    for (const h of changed) {
      const pe = input.prior_evidence[h.control_id]?.[0];
      const r = await timed(55, async () => pe);
      emit({
        source: "agent",
        kind: "tool_call",
        tool: "get_prior_evidence",
        label: `get_prior_evidence(${h.control_id})`,
        args: { control_id: h.control_id },
        result: pe ? { quote: pe.quote, fileName: pe.fileName, versionId: pe.versionId, verified_by: pe.verified_by, verified_at: pe.verified_at } : null,
        startMs: r.startMs,
        durationMs: r.durationMs,
        ts: new Date(t0 + r.startMs).toISOString(),
      });
    }

    // 3. Ask Box AI across the other files, one bounded question per changed control.
    for (const h of changed) {
      const query = CATALOGUE[h.control_id]?.search;
      if (!query) continue;
      const r = await timed(140, () => tools.search.search(query, h.file));
      emit({
        source: "boxai",
        kind: "tool_call",
        tool: "box_ai_ask",
        label: r.v.label,
        args: { agent_tool: "search_snapshot", query, snapshot_id: input.snapshot.snapshot_id, mode: "multiple_item_qa", include_citations: true, control_id: h.control_id },
        detail: `search_snapshot via ${r.v.fallback ? "string search (Box AI unavailable)" : "Box AI ask (multiple_item_qa, include_citations)"}; citations validated against pinned text by code; query '${query}'`,
        result: { fallback: r.v.fallback, cited_statements: r.v.citations.filter((x) => x.validated_against_pinned_text).length, citations: r.v.citations },
        startMs: r.startMs,
        durationMs: r.durationMs,
        ts: new Date(t0 + r.startMs).toISOString(),
      });
    }

    // 4. Write the typed findings.
    const write = await timed(4300, async () => this.findings(input));
    const output = write.v;
    const outputTokens = Math.round(JSON.stringify(output).length / 4);
    emit({
      source: "agent",
      kind: "model_turn",
      label: `Writing ${output.findings.length} typed findings with per-clause support`,
      startMs: write.startMs,
      durationMs: write.durationMs,
      ts: new Date(t0 + write.startMs).toISOString(),
      detail: { output_tokens: outputTokens, structured_output: "FindingSet (zod)" },
    });

    return {
      output,
      trace: steps,
      model_id: this.o.modelId,
      inference_profile: this.o.inferenceProfile,
      prompt_version: this.o.promptVersion,
      prompt_hash: this.o.promptHash,
      output_tokens: outputTokens,
      elapsed_ms: Date.now() - t0,
    };
  }

  /** The model's raw output: per clause, the first catalogue quote present in the pinned texts. */
  private findings(input: EvaluatorInput): FindingSet {
    const texts = new Map(input.files.map((f) => [f.file.fileName, f]));
    const cite = (cand: Candidate[]): QuoteRef | null => {
      for (const k of cand) {
        const f = texts.get(k.file);
        if (!f || !quoteValid(Q[k.q], f.text)) continue;
        const loc = findQuote(Q[k.q], f.text)!;
        return { fileName: f.file.fileName, versionId: f.file.versionId, section: loc.section, paragraph: loc.paragraph, page: loc.page, quote: Q[k.q] };
      }
      return null;
    };
    const findings: ControlFindingOut[] = input.controls.map((ctl) => {
      const entry = CATALOGUE[ctl.id];
      const clause_support = ctl.required_clauses.map((rc) => {
        const suffix = rc.clause_id.split(".").pop()!;
        const q = entry ? cite(entry.clauses[suffix] ?? []) : null;
        return { clause_id: rc.clause_id, support: q ? ("supported" as const) : ("unsupported" as const), quote: q };
      });
      const supported = clause_support.filter((x) => x.support === "supported").length;
      const conflicting_quote = supported > 0 && entry?.conflicts ? cite(entry.conflicts) : null;
      const basis = [`${supported} of ${clause_support.length} required clauses cited from the pinned snapshot.`];
      if (conflicting_quote) basis.push(`A statement in ${conflicting_quote.fileName} ${conflicting_quote.section} conflicts with the supporting quote.`);
      return { control_id: ctl.id, clause_support, basis, ...(conflicting_quote ? { conflicting_quote } : {}) };
    });

    switch (input.scenario) {
      case "fabricated_quote": {
        // The model cites the v2 key-management sentence as if it were still in the pinned version.
        const f = findings.find((x) => x.control_id === "SEC-ARCH-07");
        const arch = texts.get(A);
        if (f && arch) {
          f.clause_support = f.clause_support.map((cs) =>
            cs.clause_id === "SEC-ARCH-07.3"
              ? { clause_id: cs.clause_id, support: "supported", quote: { fileName: A, versionId: arch.file.versionId, section: "§4.3 Data protection at rest", paragraph: 2, page: 3, quote: Q["07"] } }
              : cs,
          );
        }
        break;
      }
      case "missing_finding":
        return { snapshot_id: input.snapshot.snapshot_id, findings: findings.filter((x) => x.control_id !== "SEC-ARCH-20") };
      case "unknown_control":
        findings.push({ control_id: "SEC-ARCH-99", clause_support: [{ clause_id: "SEC-ARCH-99.1", support: "unsupported", quote: null }], basis: ["Extra control."] });
        break;
      case "disposition_field":
        (findings[0] as Record<string, unknown>).disposition = "verified";
        break;
    }
    return { snapshot_id: input.snapshot.snapshot_id, findings };
  }
}
