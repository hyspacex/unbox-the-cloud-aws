import { handle } from "@/lib/http";
import { getFileText } from "@/lib/service";

/**
 * GET /api/file-text?file_id=&version_id=[&q=] -> { file_id, file_name, version_id, version_label, created_at, uploader, text,
 * snapshot_ids, versions[], match? }; 404 for an unknown file or a version no snapshot pinned. `q` adds the highlight offsets.
 */
export async function GET(req: Request) {
  const u = new URL(req.url);
  const q = u.searchParams.get("q");
  return handle(() => getFileText(u.searchParams.get("file_id") ?? "", u.searchParams.get("version_id") ?? "", q ?? undefined));
}
