/**
 * Seed BOX_FOLDER_ID so the tenant mirrors fixture snapshots S1 to S3:
 *   architecture.md   v1 (architecture-v1.md), then v2 (architecture-v2.md)
 *   runbook.md        v1 (runbook-v1.md), then v2 (runbook.md)
 *   data-flow-and-classification.md, vendor-contract-summary.md, approved-services-and-exceptions.md  v1
 * and write app/data/box-map.json (fixture ids -> tenant ids) for the engine.
 *
 *   cd app && npx tsx scripts/seed-box-folder.ts            # dry run: prints the plan
 *   cd app && npx tsx scripts/seed-box-folder.ts --write    # uploads
 *
 * Resumable and verified:
 *   - Every Box version is downloaded and hashed; a version is mapped to a fixture version only when
 *     its SHA-256 equals the fixture file's (never by position).
 *   - If the file's current version is fixture version k, the remaining planned versions k+1.. are
 *     uploaded; an interrupted run picks up where it stopped.
 *   - If the current version matches no fixture version, nothing is uploaded over it (reported).
 *   - box-map.json is checkpointed after every verified upload, and only for this BOX_FOLDER_ID.
 * The demo's v3 upload is a separate step: scripts/upload-v3.ts.
 */
import { createHash } from "node:crypto";
import { flag, fixtureText, loadEnv, readBoxMap, writeBoxMap, BOX_MAP_PATH } from "./_shared";
import { RealBoxAdapter, missingBoxEnv, type BoxMap } from "../src/lib/box/real";

/** Fixture file name -> ordered versions (fixture version id, local source file). From snapshots.json and ledger.json. */
export const SEED_PLAN: { fileName: string; fixtureFileId: string; versions: { fixtureVersionId: string; label: string; src: string }[] }[] = [
  { fileName: "architecture.md", fixtureFileId: "1650233401", versions: [{ fixtureVersionId: "1801102231", label: "v1", src: "architecture-v1.md" }, { fixtureVersionId: "1801102232", label: "v2", src: "architecture-v2.md" }] },
  { fileName: "data-flow-and-classification.md", fixtureFileId: "1650233402", versions: [{ fixtureVersionId: "1801102241", label: "v1", src: "data-flow-and-classification.md" }] },
  { fileName: "runbook.md", fixtureFileId: "1650233403", versions: [{ fixtureVersionId: "1801102251", label: "v1", src: "runbook-v1.md" }, { fixtureVersionId: "1801102252", label: "v2", src: "runbook.md" }] },
  { fileName: "vendor-contract-summary.md", fixtureFileId: "1650233404", versions: [{ fixtureVersionId: "1801102261", label: "v1", src: "vendor-contract-summary.md" }] },
  { fileName: "approved-services-and-exceptions.md", fixtureFileId: "1650233405", versions: [{ fixtureVersionId: "1801102271", label: "v1", src: "approved-services-and-exceptions.md" }] },
];

export type SeedPlan = typeof SEED_PLAN;
export type SeedBox = Pick<RealBoxAdapter, "listFolderItems" | "listFileVersions" | "downloadVersionText" | "uploadFile" | "uploadFileVersion">;

export interface SeedReport {
  map: BoxMap;
  uploads: { fileName: string; label: string; versionId: string }[];
  problems: string[];
}

const sha = (s: string) => "sha256:" + createHash("sha256").update(s, "utf8").digest("hex");

export async function seedFolder(
  box: SeedBox,
  folderId: string,
  plan: SeedPlan,
  opts: { text: (src: string) => string; checkpoint: (map: BoxMap) => void; previous?: BoxMap | null; log?: (s: string) => void; pauseMs?: number },
): Promise<SeedReport> {
  const log = opts.log ?? (() => undefined);
  const map: BoxMap = {
    folderId,
    created_at: new Date().toISOString(),
    files: { ...(opts.previous && opts.previous.folderId === folderId ? opts.previous.files : {}) },
  };
  const uploads: SeedReport["uploads"] = [];
  const problems: string[] = [];
  const existing = await box.listFolderItems(folderId);

  for (const p of plan) {
    const hashes = p.versions.map((v) => sha(opts.text(v.src)));
    let fileId = existing.find((e) => e.fileName === p.fileName)?.fileId;
    if (!fileId) {
      const up = await box.uploadFile(folderId, p.fileName, opts.text(p.versions[0].src));
      fileId = up.fileId;
      uploads.push({ fileName: p.fileName, label: p.versions[0].label, versionId: up.versionId });
      log(`upload  ${p.fileName} ${p.versions[0].label} -> file ${fileId} version ${up.versionId}`);
    } else log(`exists  ${p.fileName} (${fileId}); checking its versions against the fixture`);

    // Verify, then resume: repeat until the current version is the last planned one, or stop on a problem.
    for (let guard = 0; guard <= p.versions.length; guard++) {
      const versions = await box.listFileVersions(fileId); // throws on history failure: no partial map is written
      const entry = { fixtureFileId: p.fixtureFileId, fileId, versions: {} as Record<string, string>, labels: {} as Record<string, string>, unmatched: [] as string[] };
      const matchIdx: (number | undefined)[] = [];
      const used = new Set<number>();
      for (const [i, v] of versions.entries()) {
        entry.labels[v.label ?? `v${i + 1}`] = v.versionId;
        const r = await box.downloadVersionText(fileId, v.versionId);
        const idx = r.ok ? hashes.findIndex((h, k) => h === r.sha256 && !used.has(k)) : -1;
        if (idx >= 0) {
          used.add(idx);
          entry.versions[p.versions[idx].fixtureVersionId] = v.versionId;
          matchIdx.push(idx);
        } else {
          entry.unmatched.push(v.versionId);
          matchIdx.push(undefined);
          if (!r.ok) problems.push(`${p.fileName} ${v.label}: could not download to verify (${r.error.code})`);
        }
      }
      if (!entry.unmatched.length) delete (entry as { unmatched?: string[] }).unmatched;
      map.files[p.fileName] = entry;
      opts.checkpoint(map);

      const currentIdx = matchIdx[matchIdx.length - 1];
      if (currentIdx === undefined) {
        problems.push(`${p.fileName}: current version matches no fixture version; nothing uploaded over it`);
        break;
      }
      const missingEarlier = p.versions.slice(0, currentIdx).filter((v) => !entry.versions[v.fixtureVersionId]);
      if (missingEarlier.length)
        problems.push(`${p.fileName}: ${missingEarlier.map((v) => v.label).join(", ")} not in Box history (not retained or never uploaded); left unmapped`);
      const next = currentIdx + 1;
      if (next >= p.versions.length) break;
      if (opts.pauseMs) await new Promise((r) => setTimeout(r, opts.pauseMs)); // keep version timestamps ordered
      const up = await box.uploadFileVersion(fileId, p.fileName, opts.text(p.versions[next].src));
      uploads.push({ fileName: p.fileName, label: p.versions[next].label, versionId: up.versionId });
      log(`version ${p.fileName} ${p.versions[next].label} -> version ${up.versionId}`);
    }
  }
  return { map, uploads, problems };
}

async function main() {
  loadEnv();
  const write = flag("write");
  const folderId = process.env.BOX_FOLDER_ID?.trim();
  const missing = [...missingBoxEnv(), ...(folderId ? [] : ["BOX_FOLDER_ID"])];

  console.log(`Seed plan for folder ${folderId ?? "(BOX_FOLDER_ID unset)"}:`);
  for (const p of SEED_PLAN) console.log(`  ${p.fileName}: ${p.versions.map((v) => `${v.label} <- demo-data/lantern/${v.src}`).join(", ")}`);
  if (missing.length) return console.log(`\nSKIP: needs ${missing.join(", ")} in app/.env.local (docs/INTEGRATION.md).`);
  if (!write) return console.log("\nDry run. Pass --write to upload.");

  const previous = readBoxMap();
  if (previous && previous.folderId !== folderId) console.log(`box-map.json is for folder ${previous.folderId}, not ${folderId}; starting a new map.`);
  const report = await seedFolder(new RealBoxAdapter(), folderId!, SEED_PLAN, { text: fixtureText, checkpoint: writeBoxMap, previous, log: console.log, pauseMs: 1500 });
  console.log(`\nWrote ${BOX_MAP_PATH} (${report.uploads.length} uploads this run):`);
  console.log(JSON.stringify(report.map, null, 2));
  if (report.problems.length) {
    console.log("\nProblems:\n  " + report.problems.join("\n  "));
    process.exitCode = 1;
  }
}

if (process.argv[1] && /seed-box-folder\.ts$/.test(process.argv[1]))
  main().catch((e) => {
    console.error(`${(e as { code?: string }).code ?? "ERROR"}: ${e instanceof Error ? e.message : String(e)}`);
    process.exitCode = 1;
  });
