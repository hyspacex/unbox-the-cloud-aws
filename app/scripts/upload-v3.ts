/**
 * The demo's 0:40 beat: upload architecture-v3.md as a new version of architecture.md in
 * BOX_FOLDER_ID with the version note "Section 4 rewrite for clarity", then record it in
 * app/data/box-map.json as v3 (fixture version 1801102233).
 *
 *   cd app && npx tsx scripts/upload-v3.ts            # dry run
 *   cd app && npx tsx scripts/upload-v3.ts --write    # uploads
 *
 * Safety: a box-map.json for another folder is discarded; a mapped file id is used only after Box
 * confirms its parent is BOX_FOLDER_ID, otherwise the file is resolved by name in BOX_FOLDER_ID.
 * Refuses to upload when the current version's text already equals v3 (no accidental v4).
 * Box has no version comment field; the note is posted as a file comment prefixed "Version note: ",
 * which RealBoxAdapter.listFileVersions reads back as the version's comment.
 */
import { createHash } from "node:crypto";
import { flag, fixtureText, loadEnv, readBoxMap, writeBoxMap } from "./_shared";
import { RealBoxAdapter, missingBoxEnv, type BoxMap } from "../src/lib/box/real";

export const NOTE = "Section 4 rewrite for clarity";
const FIXTURE_V3 = "1801102233";

export type UploadBox = Pick<RealBoxAdapter, "fileInfo" | "findFileByName" | "listFileVersions" | "downloadVersionText" | "uploadFileVersion">;

export async function uploadV3(
  box: UploadBox,
  folderId: string,
  previous: BoxMap | null,
  opts: { text: string; saveMap: (m: BoxMap) => void; log?: (s: string) => void },
): Promise<{ uploaded: boolean; fileId: string; versionId?: string; map: BoxMap | null }> {
  const log = opts.log ?? (() => undefined);
  let map = previous;
  if (map && map.folderId !== folderId) {
    log(`box-map.json is for folder ${map.folderId}, not BOX_FOLDER_ID ${folderId}; ignoring it.`);
    map = null;
  }
  let fileId = map?.files["architecture.md"]?.fileId;
  if (fileId) {
    const info = await box.fileInfo(fileId);
    if (info.parentId !== folderId) {
      log(`mapped architecture.md (${fileId}) is in folder ${info.parentId}, not ${folderId}; resolving by name.`);
      fileId = undefined;
    }
  }
  if (!fileId) {
    fileId = (await box.findFileByName(folderId, "architecture.md"))?.fileId;
    if (!fileId) throw new Error(`architecture.md not found in folder ${folderId}; run scripts/seed-box-folder.ts --write first`);
    const info = await box.fileInfo(fileId);
    if (info.parentId !== folderId) throw new Error(`architecture.md (${fileId}) reports parent ${info.parentId}, not ${folderId}; refusing to upload`);
  }

  const versions = await box.listFileVersions(fileId);
  const current = versions[versions.length - 1];
  const cur = await box.downloadVersionText(fileId, current.versionId);
  const h = "sha256:" + createHash("sha256").update(opts.text, "utf8").digest("hex");
  if (cur.ok && cur.sha256 === h) {
    log(`Current version ${current.label} (${current.versionId}) already equals architecture-v3.md; nothing uploaded.`);
    return { uploaded: false, fileId, map };
  }
  const up = await box.uploadFileVersion(fileId, "architecture.md", opts.text, NOTE);
  log(`Uploaded architecture.md -> version ${up.versionId} (was ${current.label} ${current.versionId}).`);
  const e = map?.files["architecture.md"];
  if (map && e && e.fileId === fileId) {
    e.versions[FIXTURE_V3] = up.versionId;
    e.labels[`v${versions.length + 1}`] = up.versionId;
    opts.saveMap(map);
    log(`box-map.json: fixture ${FIXTURE_V3} -> ${up.versionId}`);
  }
  return { uploaded: true, fileId, versionId: up.versionId, map };
}

async function main() {
  loadEnv();
  const folderId = process.env.BOX_FOLDER_ID?.trim();
  const missing = [...missingBoxEnv(), ...(folderId ? [] : ["BOX_FOLDER_ID"])];
  console.log(`Upload demo-data/lantern/architecture-v3.md as a new version of architecture.md, note "${NOTE}".`);
  if (missing.length) return console.log(`SKIP: needs ${missing.join(", ")} in app/.env.local.`);
  if (!flag("write")) return console.log("Dry run. Pass --write to upload.");
  const t = Date.now();
  const r = await uploadV3(new RealBoxAdapter(), folderId!, readBoxMap(), { text: fixtureText("architecture-v3.md"), saveMap: writeBoxMap, log: console.log });
  if (r.uploaded) console.log(`Done in ${Date.now() - t} ms. Now submit in the app (live mode) or let the poller pick it up.`);
}

if (process.argv[1] && /upload-v3\.ts$/.test(process.argv[1]))
  main().catch((e) => {
    console.error(`${(e as { code?: string }).code ?? "ERROR"}: ${e instanceof Error ? e.message : String(e)}`);
    process.exitCode = 1;
  });
