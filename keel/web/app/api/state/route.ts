import type { NextRequest } from "next/server";
import { getFolder, latestCompleted, listRuns, queuedCount } from "@/lib/keel/data";
import { summaryHref } from "@/lib/keel/describe";
import { peekInstance } from "@/lib/fakebox/core";
import { db } from "@/lib/fakebox/db";

// Cheap fingerprint of live state for <LiveRefresh>. Changes whenever a run starts, finishes,
// a file is uploaded, or a task changes.
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const folder = req.nextUrl.searchParams.get("folder");
  const scope = req.nextUrl.searchParams.get("scope");
  const parts: unknown[] = [];
  if (folder) {
    const meta = getFolder(folder);
    const run = listRuns(folder, 1)[0];
    parts.push(meta?.run_count, run?.number, run?.status, queuedCount(folder));
  }
  if (scope === "box") {
    const d = db();
    parts.push(
      d.prepare("SELECT MAX(modified_at) m, COUNT(*) c FROM files WHERE trashed_at IS NULL").get(),
      d.prepare("SELECT COUNT(*) c, MAX(completed_at) m FROM task_assignments").get(),
      d.prepare("SELECT MAX(updated_at) m FROM metadata_instances").get(),
      d.prepare("SELECT MAX(created_at) m FROM tasks").get(),
    );
    if (folder) parts.push(peekInstance("folders", folder, "enterprise", "keelChecks")?.version);
  }
  if (folder && scope !== "box") {
    const done = latestCompleted(folder);
    const run = listRuns(folder, 1)[0];
    return Response.json({
      fp: JSON.stringify(parts), running: run?.status === "running" || queuedCount(folder) > 0,
      latest: done?.number ?? 0, summary: done?.summary ?? null, href: done ? summaryHref(folder, done) : "",
    });
  }
  return Response.json(parts);
}
