import { createHash } from "node:crypto";
import { getConfig } from "./config";
import { projectId, type UserSession } from "./auth";
import { getPackageView, getFindingCard, internals, listRuns, ServiceError, submit } from "./service";
import { fixture } from "./fixture";
import type { BoxIdentity } from "./types";

const VERIFIED = new Set(["VERIFIED", "VERIFIED_HOLDS"]);
const MAX_BYTES = 16 * 1024 * 1024;
let uploadBusy = false;
interface ProjectionCache { signature: string; sequence: number; beforeVerified: number; verified: number; lastComplete: number }
declare global { var __keelDesktopProjection: ProjectionCache | undefined }

export function desktopView() {
  const view = getPackageView(), store = internals.store();
  const controls = view.rows.map(row => {
    const card = getFindingCard(row.control_id);
    const evidence = card.new_version;
    const reviewed = card.prior_version;
    return {
      id: row.control_id, title: row.title, status: row.status.projection_code,
      reason: row.status.detail || row.status.label,
      source: evidence ? `${evidence.file.fileName} ${evidence.file.versionLabel || evidence.file.versionId}` : "No supporting source recorded",
      ...(evidence?.quote ? { snippet: evidence.quote } : {}),
      ...(evidence?.section ? { section: evidence.section } : {}),
      ...(evidence?.uploader ? { author: evidence.uploader } : {}),
      ...(view.mode === "live" && evidence?.deep_link ? { sourceUrl: evidence.deep_link } : {}),
      ...(VERIFIED.has(row.status.projection_code) ? { verifiedBy: row.status.secondary || reviewed?.verified_by || "Named review recorded in the evidence ledger" } : {}),
    };
  });
  const verified = controls.filter(control => VERIFIED.has(control.status)).length;
  const signature = createHash("sha256").update(JSON.stringify({ snapshot: view.snapshot.snapshot_id, mode: view.mode, controls, evaluation: view.evaluation_state })).digest("hex");
  const old = globalThis.__keelDesktopProjection;
  const complete = view.evaluation_state === "complete";
  const cache = old?.signature === signature ? old : {
    signature, sequence: (old?.sequence ?? 0) + 1, beforeVerified: old?.lastComplete ?? verified, verified,
    lastComplete: complete ? verified : old?.lastComplete ?? verified,
  };
  globalThis.__keelDesktopProjection = cache;
  const latest = store.events.at(-1);
  const human = [...store.events].reverse().find(event => event.snapshot_id === view.snapshot.snapshot_id && event.event_type === "human_disposition_recorded");
  const observed = [...store.events].reverse().find(event => event.snapshot_id === view.snapshot.snapshot_id && event.event_type === "file_version_observed");
  return {
    projectId: projectId(), projectName: "Project Lantern", mode: view.mode,
    snapshotId: view.snapshot.snapshot_id, sequence: cache.sequence,
    observedAt: latest?.ts || view.snapshot.captured_at,
    controls,
    event: {
      id: `${view.snapshot.snapshot_id}-${cache.sequence}`,
      kind: human ? "reviewed" : "changed",
      actor: human?.actor.name || observed?.actor.name || "Project contributor",
      file: human?.fileName || observed?.fileName || "Project package",
      title: `${verified} verified; ${controls.length - verified} need review`,
      note: view.evaluation_state === "pending" ? "Evaluation is running. Prior reviews are not applied to unassessed evidence." : view.count_line,
      beforeVerified: cache.beforeVerified,
      affected: view.rows.filter(row => !VERIFIED.has(row.status.projection_code)).map(row => row.control_id),
    },
  };
}

export async function uploadForm(req: Request): Promise<File[]> {
  const type = req.headers.get("content-type") || "";
  if (!type.startsWith("multipart/form-data;")) throw new ServiceError("BAD_UPLOAD", "Send a multipart file upload.", 400);
  const reader = req.body?.getReader();
  if (!reader) throw new ServiceError("BAD_UPLOAD", "No upload body.", 400);
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    size += part.value.byteLength;
    if (size > MAX_BYTES + 64 * 1024) { await reader.cancel(); throw new ServiceError("UPLOAD_TOO_LARGE", "Limit each batch to 16 MiB.", 413); }
    chunks.push(part.value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const part of chunks) { bytes.set(part, offset); offset += part.length; }
  let data: FormData;
  try { data = await new Response(bytes, { headers: { "Content-Type": type } }).formData(); }
  catch { throw new ServiceError("BAD_UPLOAD", "Invalid multipart upload.", 400); }
  const values = data.getAll("files");
  if (!values.length || values.length > 20 || values.some(value => typeof value === "string")) throw new ServiceError("BAD_UPLOAD", "Choose 1-20 files.", 400);
  const files = values.filter((value): value is File => typeof value !== "string");
  const names = new Set<string>();
  if (files.reduce((total, file) => total + file.size, 0) > MAX_BYTES) throw new ServiceError("UPLOAD_TOO_LARGE", "Limit each batch to 16 MiB.", 413);
  for (const file of files) {
    if (!file.name || file.name.length > 180 || /[\\/\u0000-\u001f]/.test(file.name) || file.name.startsWith(".") || !/\.(md|txt|pdf|docx|xlsx|pptx|json|csv)$/i.test(file.name)) {
      throw new ServiceError("UNSUPPORTED_FILE", "Use named Markdown, text, PDF or Office documents. Hidden files and nested names are rejected.", 400);
    }
    const key = file.name.toLowerCase();
    if (names.has(key)) throw new ServiceError("DUPLICATE_NAME", "Folder batches need unique filenames; the demo package is flat.", 400);
    names.add(key);
  }
  return files;
}

export async function uploadAndSubmit(files: File[], session: UserSession) {
  if (uploadBusy || listRuns().runs.some(run => run.status === "running")) throw new ServiceError("RUN_ACTIVE", "Wait for the current upload or review to finish.", 409);
  uploadBusy = true;
  const uploaded: { name: string; fileId: string; versionId: string }[] = [];
  try {
    const config = getConfig(), adapters = await internals.adapters();
    if (config.mockMode) {
      if (!adapters.mockBox) throw new ServiceError("MOCK_BOX", "Mock Box unavailable.", 503);
      const items = await adapters.box.listFolderItems(config.box.folderId);
      // This fixture models version uploads, not arbitrary AI analysis of new documents.
      for (const file of files) {
        if (!items.some(item => item.fileName === file.name) || !/\.(md|txt)$/i.test(file.name)) {
          throw new ServiceError("MOCK_FILE", "Mock mode accepts version updates to the five named fixture documents. Use architecture.md for the live-slice demonstration.", 400);
        }
      }
      for (const file of files) {
        const text = await file.text();
        const isV3 = file.name === "architecture.md" && createHash("sha256").update(text).digest("hex") === createHash("sha256").update(fixture.text("architecture-v3.md")).digest("hex");
        const uploader: BoxIdentity = { id: session.user.id, name: session.user.name, login: session.user.login };
        const version = adapters.mockBox.uploadVersion(file.name, text, { uploader, comment: "Submitted from Keel upload", ...(isV3 ? { versionId: "1801102233" } : {}) });
        uploaded.push({ name: file.name, fileId: items.find(item => item.fileName === file.name)!.fileId, versionId: version.versionId });
      }
    } else {
      if (!session.boxToken) throw new ServiceError("BOX_USER_SESSION", "Sign in with Box before uploading.", 401);
      const { RealBoxAdapter } = await import("./box/real");
      const userBox = new RealBoxAdapter({ developerToken: session.boxToken, subjectUserId: undefined });
      const items = await userBox.listFolderItems(config.box.folderId);
      for (const file of files) {
        const existing = items.find(item => item.fileName === file.name);
        uploaded.push({ name: file.name, ...await userBox.uploadBytes(config.box.folderId, file.name, await file.arrayBuffer(), existing?.fileId) });
      }
    }
    const result = await submit({ scenario: "none" });
    return { uploaded, runId: result.run_id, snapshotId: result.snapshot_id, mode: config.mode, evaluation: "pending" };
  } catch (error) {
    if (uploaded.length) throw new ServiceError("PARTIAL_UPLOAD", `${uploaded.length} file(s) were uploaded, but evaluation did not start: ${error instanceof Error ? error.message : "unknown failure"}. Inspect the package before retrying.`, 502);
    throw error;
  } finally { uploadBusy = false; }
}
