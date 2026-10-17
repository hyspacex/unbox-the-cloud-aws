import { RunView } from "@/components/RunView";
import { getResults, inProgress, latestCompleted, listRuns, queuedCount } from "@/lib/keel/data";

export const dynamic = "force-dynamic";

export default async function FolderChecks({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const latest = listRuns(id, 1)[0] ?? null;
  const shown = latest && latest.status !== "running" ? latest : latestCompleted(id);
  return <RunView folderId={id} run={shown} results={shown ? getResults(shown.run_id) : []} live={inProgress(id)} queued={queuedCount(id)} />;
}
