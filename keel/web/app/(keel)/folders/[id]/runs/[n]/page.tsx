import { notFound } from "next/navigation";
import { RunView } from "@/components/RunView";
import { getResults, getRun, inProgress, listRuns, queuedCount } from "@/lib/keel/data";

export const dynamic = "force-dynamic";

export default async function RunPage({ params }: { params: Promise<{ id: string; n: string }> }) {
  const { id, n } = await params;
  const run = getRun(id, Number(n));
  if (!run) notFound();
  const latest = listRuns(id, 1)[0];
  return <RunView folderId={id} run={run} results={getResults(run.run_id)} live={inProgress(id)} queued={queuedCount(id)} latestNumber={latest?.number} />;
}
