import { attention, latestCompleted, listFolders, listRuns } from "@/lib/keel/data";
import { summaryHref } from "@/lib/keel/describe";

export const dynamic = "force-dynamic";

export async function GET() {
  const folders = listFolders();
  let count = 0;
  const items = [];
  for (const f of folders) {
    count += attention(latestCompleted(f.folder_id));
    for (const run of listRuns(f.folder_id, 12)) {
      if (run.status !== "completed" || !run.summary) continue;
      items.push({
        id: run.run_id, kind: run.summary.kind, title: run.summary.title, text: run.summary.text, by: run.summary.by ?? null,
        at: run.finished_at, href: summaryHref(f.folder_id, run), folder: f.name,
      });
    }
  }
  items.sort((a, b) => String(b.at).localeCompare(String(a.at)));
  return Response.json({ count, items: items.slice(0, 8) });
}
