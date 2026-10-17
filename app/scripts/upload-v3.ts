/**
 * The demo's 0:40 beat: upload architecture-v3.md as a new version of architecture.md in
 * BOX_FOLDER_ID with the version note "Section 4 rewrite for clarity", then record it in
 * app/data/box-map.json as v3 (fixture version 1801102233).
 *
 *   cd app && npx tsx scripts/upload-v3.ts            # dry run
 *   cd app && npx tsx scripts/upload-v3.ts --write    # uploads
 *
 * Box has no version comment field; the note is posted as a file comment prefixed "Version note: ",
 * which RealBoxAdapter.listFileVersions reads back as the version's comment.
 * Refuses to upload when the current version's text already equals v3 (no accidental v4).
 */
import { createHash } from "node:crypto";
import { flag, fixtureText, loadEnv, readBoxMap, writeBoxMap } from "./_shared";
import { RealBoxAdapter, missingBoxEnv } from "../src/lib/box/real";

const NOTE = "Section 4 rewrite for clarity";
const FIXTURE_V3 = "1801102233";

async function main() {
  loadEnv();
  const folderId = process.env.BOX_FOLDER_ID?.trim();
  const missing = [...missingBoxEnv(), ...(folderId ? [] : ["BOX_FOLDER_ID"])];
  console.log(`Upload demo-data/lantern/architecture-v3.md as a new version of architecture.md, note "${NOTE}".`);
  if (missing.length) return console.log(`SKIP: needs ${missing.join(", ")} in app/.env.local.`);
  if (!flag("write")) return console.log("Dry run. Pass --write to upload.");

  const box = new RealBoxAdapter();
  const map = readBoxMap();
  const fileId = map?.files["architecture.md"]?.fileId ?? (await box.findFileByName(folderId!, "architecture.md"))?.fileId;
  if (!fileId) throw new Error("architecture.md not found in BOX_FOLDER_ID; run scripts/seed-box-folder.ts --write first");

  const text = fixtureText("architecture-v3.md");
  const versions = await box.listFileVersions(fileId);
  const current = versions[versions.length - 1];
  const cur = await box.downloadVersionText(fileId, current.versionId);
  const h = "sha256:" + createHash("sha256").update(text).digest("hex");
  if (cur.ok && cur.sha256 === h) return console.log(`Current version ${current.label} (${current.versionId}) already equals architecture-v3.md; nothing uploaded.`);

  const t = Date.now();
  const up = await box.uploadFileVersion(fileId, "architecture.md", text, NOTE);
  console.log(`Uploaded architecture.md -> version ${up.versionId} in ${Date.now() - t} ms (was ${current.label} ${current.versionId}).`);

  if (map) {
    const e = map.files["architecture.md"];
    if (e) {
      e.versions[FIXTURE_V3] = up.versionId;
      e.labels[`v${versions.length + 1}`] = up.versionId;
      writeBoxMap(map);
      console.log(`box-map.json: fixture ${FIXTURE_V3} -> ${up.versionId}`);
    }
  }
  console.log("Now submit in the app (live mode) or let the poller pick it up.");
}

main().catch((e) => {
  console.error(`${(e as { code?: string }).code ?? "ERROR"}: ${e instanceof Error ? e.message : String(e)}`);
  process.exitCode = 1;
});
