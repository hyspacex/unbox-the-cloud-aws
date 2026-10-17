/**
 * Typed loader for the Lantern fixture (demo-data/lantern). Read from disk once and cached.
 * Documents are addressed by Box (fileName, versionId) using the mapping in
 * demo-data/lantern/README.md ("Which file evidences which control") and snapshots.json.
 * Expected values (expected-findings.json) are test oracles; the app never reads them for state.
 */
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fixtureDir } from "./config";
import type { ControlProfile, Ledger, LedgerEvent, Snapshot, Trace, PackageHeader } from "./types";

export interface FixtureDocument {
  fileId: string;
  fileName: string;
  versionId: string;
  versionLabel: string;
  /** Path relative to demo-data/lantern. */
  path: string;
  /** True when the version exists before the demo (S1 to S3); v3 is uploaded on stage. */
  seed: boolean;
}

/** Box file ids and version ids of the fixture documents (README table + snapshots.json). */
export const FIXTURE_DOCUMENTS: FixtureDocument[] = [
  { fileId: "1650233401", fileName: "architecture.md", versionId: "1801102231", versionLabel: "v1", path: "architecture-v1.md", seed: true },
  { fileId: "1650233401", fileName: "architecture.md", versionId: "1801102232", versionLabel: "v2", path: "architecture-v2.md", seed: true },
  { fileId: "1650233401", fileName: "architecture.md", versionId: "1801102233", versionLabel: "v3", path: "architecture-v3.md", seed: false },
  { fileId: "1650233402", fileName: "data-flow-and-classification.md", versionId: "1801102241", versionLabel: "v1", path: "data-flow-and-classification.md", seed: true },
  { fileId: "1650233403", fileName: "runbook.md", versionId: "1801102251", versionLabel: "v1", path: "runbook-v1.md", seed: true },
  { fileId: "1650233403", fileName: "runbook.md", versionId: "1801102252", versionLabel: "v2", path: "runbook.md", seed: true },
  { fileId: "1650233404", fileName: "vendor-contract-summary.md", versionId: "1801102261", versionLabel: "v1", path: "vendor-contract-summary.md", seed: true },
  { fileId: "1650233405", fileName: "approved-services-and-exceptions.md", versionId: "1801102271", versionLabel: "v1", path: "approved-services-and-exceptions.md", seed: true },
];

/** Acceptance-only documents (not in the main ledger). */
export const FIXTURE_EXTRA = {
  vendorContradiction: "fixtures/vendor-contract-summary-contradiction.md",
  architectureV3: "architecture-v3.md",
};

export interface SnapshotsFile extends Omit<PackageHeader, "folderName"> {
  folderId: string;
  snapshots: Snapshot[];
}

export interface ExpectedFindingsFile {
  expected_count_line_before: string;
  expected_count_line_after: string;
  snapshot_id: string;
  prior_snapshot_id: string;
  manifest_hash: string;
  trigger: Record<string, string>;
  summary: Record<string, unknown>;
  prior_quote_diff_hints: unknown[];
  removed_from_v2: string[];
  box_tasks: Record<string, string>;
  human_actions_expected: Record<string, string>[];
  findings: (import("./types").Finding & { open_review_task?: unknown })[];
}

const cache = new Map<string, unknown>();

function readText(rel: string): string {
  const key = "text:" + rel;
  if (!cache.has(key)) cache.set(key, fs.readFileSync(path.join(fixtureDir(), rel), "utf8"));
  return cache.get(key) as string;
}
function readJson<T>(rel: string): T {
  const key = "json:" + rel;
  if (!cache.has(key)) cache.set(key, JSON.parse(readText(rel)));
  return cache.get(key) as T;
}

export const fixture = {
  profile: () => readJson<ControlProfile>("profile-us-bank.json"),
  profileEu: () => readJson<ControlProfile>("profile-eu.json"),
  snapshots: () => readJson<SnapshotsFile>("snapshots.json"),
  ledger: () => readJson<Ledger>("ledger.json"),
  expected: () => readJson<ExpectedFindingsFile>("expected-findings.json"),
  trace: () => readJson<Trace>("agent-trace.json"),
  text: (rel: string) => readText(rel),
  /** Ledger events of the seed phase (EVT-0001..EVT-0067): S1 to S3, ARB decision, verifications. */
  seedEvents: (): LedgerEvent[] => fixture.ledger().events.filter((e) => e.phase === "seed"),
  header: (): PackageHeader => {
    const s = fixture.snapshots();
    const l = fixture.ledger();
    return {
      folderId: s.folderId,
      folderName: l.folderName,
      project: s.project,
      application_id: s.application_id,
      application_tier: s.application_tier,
      regulatory_scope: s.regulatory_scope,
      arb_decision: s.arb_decision,
    };
  },
};

export function documentByVersion(versionId: string): FixtureDocument | undefined {
  return FIXTURE_DOCUMENTS.find((d) => d.versionId === versionId);
}
export function documentText(fileName: string, versionId: string): string | null {
  const d = FIXTURE_DOCUMENTS.find((x) => x.fileName === fileName && x.versionId === versionId);
  return d ? readText(d.path) : null;
}

/** "sha256:<hex>" over the UTF-8 text, exactly as gen.py `sha(t)`. */
export function contentHash(text: string): string {
  return "sha256:" + createHash("sha256").update(text, "utf8").digest("hex");
}

export interface IntegrityReport {
  ok: boolean;
  documents: { fileName: string; versionId: string; path: string; expected: string | null; actual: string; ok: boolean }[];
}

/** Every snapshot file's contentHash in snapshots.json must equal sha256 of the document text. */
export function fixtureIntegrity(): IntegrityReport {
  const expected = new Map<string, string>();
  for (const s of fixture.snapshots().snapshots) for (const f of s.files) expected.set(f.versionId, f.contentHash);
  const documents = FIXTURE_DOCUMENTS.map((d) => {
    const actual = contentHash(readText(d.path));
    const exp = expected.get(d.versionId) ?? null;
    return { fileName: d.fileName, versionId: d.versionId, path: d.path, expected: exp, actual, ok: exp === null ? true : exp === actual };
  });
  return { ok: documents.every((d) => d.ok), documents };
}
