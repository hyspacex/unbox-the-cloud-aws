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

/**
 * The adapter surface the upload needs. `uploadFileVersion` takes raw bytes (Buffer) so binary files are
 * never round-tripped through a string (Codex 1); a string is accepted for the text fixtures and scripts.
 */
export type UploadBox = Pick<RealBoxAdapter, "fileInfo" | "findFileByName" | "listFileVersions" | "downloadVersionText" | "uploadFileVersion">;

export interface UploadVersionResult {
  uploaded: boolean;
  fileId: string;
  versionId?: string;
  map: BoxMap | null;
  /** Codex 14: ancillary steps that failed after the Box upload committed (version note, local map). */
  warnings?: { code: string; message: string }[];
}

export class UploadTargetError extends Error {
  constructor(
    readonly code: "FILE_NOT_FOUND" | "FILE_OUTSIDE_FOLDER" | "FILE_ID_NAME_MISMATCH",
    message: string,
  ) {
    super(message);
  }
}

const sha256 = (b: Buffer) => "sha256:" + createHash("sha256").update(b).digest("hex");
const sha1 = (b: Buffer) => createHash("sha1").update(b).digest("hex");

export async function uploadNewVersion(
  box: UploadBox,
  folderId: string,
  fileName: string,
  previous: BoxMap | null,
  opts: { text?: string; content?: Buffer; note: string; saveMap: (m: BoxMap) => void; log?: (s: string) => void; fixtureVersionId?: string; fileId?: string },
): Promise<UploadVersionResult> {
  const log = opts.log ?? (() => undefined);
  const bytes = opts.content ?? Buffer.from(opts.text ?? "", "utf8");
  const warnings: { code: string; message: string }[] = [];
  let map = previous;
  let mapDirty = false;
  if (map && map.folderId !== folderId) {
    log(`box-map.json is for folder ${map.folderId}, not BOX_FOLDER_ID ${folderId}; ignoring it.`);
    map = null;
  }
  // Codex 12: an id is used only when Box confirms both the parent folder and the exact file name.
  let fileId: string | undefined;
  if (opts.fileId) {
    const info = await box.fileInfo(opts.fileId);
    if (info.parentId !== folderId) throw new UploadTargetError("FILE_OUTSIDE_FOLDER", `file ${opts.fileId} is in folder ${info.parentId}, not ${folderId}; refusing to upload`);
    if (info.name !== fileName) throw new UploadTargetError("FILE_ID_NAME_MISMATCH", `file ${opts.fileId} is named ${info.name} in Box, not ${fileName}; refusing to upload`);
    fileId = opts.fileId;
  } else if (map?.files[fileName]?.fileId) {
    const mapped = map.files[fileName].fileId;
    const info = await box.fileInfo(mapped);
    if (info.parentId !== folderId) {
      log(`mapped ${fileName} (${mapped}) is in folder ${info.parentId}, not ${folderId}; resolving by name.`);
    } else if (info.name !== fileName) {
      log(`mapped ${fileName} (${mapped}) is named ${info.name} in Box; dropping the map entry and resolving by name.`);
      delete map.files[fileName];
      mapDirty = true;
    } else fileId = mapped;
  }
  if (!fileId) {
    fileId = (await box.findFileByName(folderId, fileName))?.fileId;
    if (!fileId) throw new UploadTargetError("FILE_NOT_FOUND", `${fileName} not found in folder ${folderId}; run scripts/seed-box-folder.ts --write first`);
    const info = await box.fileInfo(fileId);
    if (info.parentId !== folderId) throw new UploadTargetError("FILE_OUTSIDE_FOLDER", `${fileName} (${fileId}) reports parent ${info.parentId}, not ${folderId}; refusing to upload`);
    if (info.name !== fileName) throw new UploadTargetError("FILE_ID_NAME_MISMATCH", `${fileName} resolved to ${fileId}, which Box names ${info.name}; refusing to upload`);
  }

  // Refuse an identical upload: compare raw content hashes (Box sha1 of the current version when known, else the downloaded bytes' sha256).
  const versions = await box.listFileVersions(fileId);
  const current = versions[versions.length - 1];
  let same = false;
  if (current?.sha1) same = current.sha1.toLowerCase() === sha1(bytes);
  else if (current) {
    const cur = await box.downloadVersionText(fileId, current.versionId);
    same = cur.ok && cur.sha256 === sha256(bytes);
  }
  const saveMapSafely = (m: BoxMap) => {
    try {
      opts.saveMap(m);
    } catch (err) {
      warnings.push({ code: "MAP_SAVE_FAILED", message: `box-map.json was not updated: ${err instanceof Error ? err.message : String(err)}` });
    }
  };
  if (same) {
    log(`Current version ${current.label} (${current.versionId}) already equals the new content; nothing uploaded.`);
    if (map && mapDirty) saveMapSafely(map);
    return { uploaded: false, fileId, map, ...(warnings.length ? { warnings } : {}) };
  }
  const up = await box.uploadFileVersion(fileId, fileName, bytes, opts.note);
  log(`Uploaded ${fileName} -> version ${up.versionId} (was ${current?.label} ${current?.versionId}).`);
  if (up.note_error) warnings.push({ code: "VERSION_NOTE_FAILED", message: `the version note was not posted: ${up.note_error}` });
  const e = map?.files[fileName];
  if (map && e && e.fileId === fileId) {
    if (opts.fixtureVersionId) e.versions[opts.fixtureVersionId] = up.versionId;
    e.labels[`v${versions.length + 1}`] = up.versionId;
    mapDirty = true;
    if (opts.fixtureVersionId) log(`box-map.json: fixture ${opts.fixtureVersionId} -> ${up.versionId}`);
  }
  if (map && mapDirty) saveMapSafely(map);
  return { uploaded: true, fileId, versionId: up.versionId, map, ...(warnings.length ? { warnings } : {}) };
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
