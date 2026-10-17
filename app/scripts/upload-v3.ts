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
import { flag, fixtureText, loadEnv, readBoxMap, writeBoxMap } from "./_shared";
import { RealBoxAdapter, missingBoxEnv, type BoxMap } from "../src/lib/box/real";
import { uploadNewVersion, type UploadBox as SharedUploadBox } from "../src/lib/box/upload";

export const NOTE = "Section 4 rewrite for clarity";
const FIXTURE_V3 = "1801102233";

export type UploadBox = SharedUploadBox;

/** The shared upload (src/lib/box/upload.ts) for architecture.md, mapped to fixture version v3. */
export async function uploadV3(
  box: UploadBox,
  folderId: string,
  previous: BoxMap | null,
  opts: { text: string; saveMap: (m: BoxMap) => void; log?: (s: string) => void },
): Promise<{ uploaded: boolean; fileId: string; versionId?: string; map: BoxMap | null }> {
  return uploadNewVersion(box, folderId, "architecture.md", previous, { ...opts, note: NOTE, fixtureVersionId: FIXTURE_V3 });
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
