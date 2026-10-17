/**
 * Upload a new version of a named file in the package folder (live mode). Shared by
 * scripts/upload-v3.ts (the demo's v3 beat) and POST /api/upload-version.
 *
 * Safety: a box-map.json for another folder is discarded; a mapped file id is used only after Box
 * confirms its parent is the folder, otherwise the file is resolved by name in the folder.
 * Refuses to upload when the current version's text already equals the new text (no accidental extra version).
 * Box has no version comment field; the note is posted as a file comment prefixed "Version note: ",
 * which RealBoxAdapter.listFileVersions reads back as the version's comment.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { BoxMap, RealBoxAdapter } from "./real";

export type UploadBox = Pick<RealBoxAdapter, "fileInfo" | "findFileByName" | "listFileVersions" | "downloadVersionText" | "uploadFileVersion">;

export interface UploadVersionResult {
  uploaded: boolean;
  fileId: string;
  versionId?: string;
  map: BoxMap | null;
}

export async function uploadNewVersion(
  box: UploadBox,
  folderId: string,
  fileName: string,
  previous: BoxMap | null,
  opts: { text: string; note: string; saveMap: (m: BoxMap) => void; log?: (s: string) => void; fixtureVersionId?: string; fileId?: string },
): Promise<UploadVersionResult> {
  const log = opts.log ?? (() => undefined);
  let map = previous;
  if (map && map.folderId !== folderId) {
    log(`box-map.json is for folder ${map.folderId}, not BOX_FOLDER_ID ${folderId}; ignoring it.`);
    map = null;
  }
  let fileId = opts.fileId ?? map?.files[fileName]?.fileId;
  if (fileId) {
    const info = await box.fileInfo(fileId);
    if (info.parentId !== folderId) {
      log(`mapped ${fileName} (${fileId}) is in folder ${info.parentId}, not ${folderId}; resolving by name.`);
      fileId = undefined;
    }
  }
  if (!fileId) {
    fileId = (await box.findFileByName(folderId, fileName))?.fileId;
    if (!fileId) throw new Error(`${fileName} not found in folder ${folderId}; run scripts/seed-box-folder.ts --write first`);
    const info = await box.fileInfo(fileId);
    if (info.parentId !== folderId) throw new Error(`${fileName} (${fileId}) reports parent ${info.parentId}, not ${folderId}; refusing to upload`);
  }

  const versions = await box.listFileVersions(fileId);
  const current = versions[versions.length - 1];
  const cur = await box.downloadVersionText(fileId, current.versionId);
  const h = "sha256:" + createHash("sha256").update(opts.text, "utf8").digest("hex");
  if (cur.ok && cur.sha256 === h) {
    log(`Current version ${current.label} (${current.versionId}) already equals the new text; nothing uploaded.`);
    return { uploaded: false, fileId, map };
  }
  const up = await box.uploadFileVersion(fileId, fileName, opts.text, opts.note);
  log(`Uploaded ${fileName} -> version ${up.versionId} (was ${current.label} ${current.versionId}).`);
  const e = map?.files[fileName];
  if (map && e && e.fileId === fileId) {
    if (opts.fixtureVersionId) e.versions[opts.fixtureVersionId] = up.versionId;
    e.labels[`v${versions.length + 1}`] = up.versionId;
    opts.saveMap(map);
    if (opts.fixtureVersionId) log(`box-map.json: fixture ${opts.fixtureVersionId} -> ${up.versionId}`);
  }
  return { uploaded: true, fileId, versionId: up.versionId, map };
}

/** app/data/box-map.json, resolved from the app directory (process cwd for the dev server). */
export function boxMapPath(appDir = process.cwd()): string {
  return join(appDir, "data", "box-map.json");
}

export function readBoxMapFile(path = boxMapPath()): BoxMap | null {
  return existsSync(path) ? (JSON.parse(readFileSync(path, "utf8")) as BoxMap) : null;
}

export function writeBoxMapFile(map: BoxMap, path = boxMapPath()): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(map, null, 2) + "\n");
}
