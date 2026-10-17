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
 * Idempotent: a file already in the folder is not uploaded again; its versions are mapped by order.
 * The demo's v3 upload is a separate step: scripts/upload-v3.ts.
 */
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

async function main() {
  loadEnv();
  const write = flag("write");
  const folderId = process.env.BOX_FOLDER_ID?.trim();
  const missing = [...missingBoxEnv(), ...(folderId ? [] : ["BOX_FOLDER_ID"])];

  console.log(`Seed plan for folder ${folderId ?? "(BOX_FOLDER_ID unset)"}:`);
  for (const p of SEED_PLAN) console.log(`  ${p.fileName}: ${p.versions.map((v) => `${v.label} <- demo-data/lantern/${v.src}`).join(", ")}`);
  if (missing.length) {
    console.log(`\nSKIP: needs ${missing.join(", ")} in app/.env.local (docs/INTEGRATION.md).`);
    return;
  }
  if (!write) {
    console.log("\nDry run. Pass --write to upload.");
    return;
  }

  const box = new RealBoxAdapter();
  const existing = await box.listFolderItems(folderId!);
  const map: BoxMap = { folderId: folderId!, created_at: new Date().toISOString(), files: { ...(readBoxMap()?.folderId === folderId ? readBoxMap()!.files : {}) } };

  for (const p of SEED_PLAN) {
    const found = existing.find((e) => e.fileName === p.fileName);
    let fileId: string;
    if (found) {
      fileId = found.fileId;
      console.log(`exists  ${p.fileName} (${fileId}); not re-uploading`);
    } else {
      const first = await box.uploadFile(folderId!, p.fileName, fixtureText(p.versions[0].src));
      fileId = first.fileId;
      console.log(`upload  ${p.fileName} ${p.versions[0].label} -> file ${fileId} version ${first.versionId}`);
      for (const v of p.versions.slice(1)) {
        await new Promise((r) => setTimeout(r, 1500)); // keep version timestamps ordered
        const up = await box.uploadFileVersion(fileId, p.fileName, fixtureText(v.src));
        console.log(`version ${p.fileName} ${v.label} -> version ${up.versionId}`);
      }
    }
    // Map by order: Box versions oldest first; fixture versions oldest first.
    const versions = await box.listFileVersions(fileId);
    const entry = { fixtureFileId: p.fixtureFileId, fileId, versions: {} as Record<string, string>, labels: {} as Record<string, string> };
    versions.forEach((v, i) => {
      entry.labels[v.label ?? `v${i + 1}`] = v.versionId;
      const fx = p.versions[i];
      if (fx) entry.versions[fx.fixtureVersionId] = v.versionId;
    });
    if (versions.length < p.versions.length)
      console.log(`WARN    ${p.fileName}: Box returned ${versions.length} version(s), fixture has ${p.versions.length}; prior versions are not retained on this tenant (capture the local baseline)`);
    map.files[p.fileName] = entry;
  }

  writeBoxMap(map);
  console.log(`\nWrote ${BOX_MAP_PATH}:`);
  console.log(JSON.stringify(map, null, 2));
}

main().catch((e) => {
  console.error(`${(e as { code?: string }).code ?? "ERROR"}: ${e instanceof Error ? e.message : String(e)}`);
  process.exitCode = 1;
});
