import { handle } from "@/lib/http";
import { getFileText } from "@/lib/service";

/** GET /api/file-text?file_id=&version_id= -> { file_id, version_id, version_label, file_name, text, snapshot_ids }; 404 when no snapshot pinned the version. */
export async function GET(req: Request) {
  const u = new URL(req.url);
  return handle(() => getFileText(u.searchParams.get("file_id") ?? "", u.searchParams.get("version_id") ?? ""));
}
