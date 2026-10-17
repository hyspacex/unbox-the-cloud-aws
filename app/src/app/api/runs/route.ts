import { handle } from "@/lib/http";
import { listRuns } from "@/lib/service";

/**
 * GET /api/runs -> { runs: RunSummary[] } newest first. Stored traces keep their steps and timings
 * and survive restarts (app/data store); replay one read-only with GET /api/run/[id].
 */
export async function GET() {
  return handle(() => listRuns());
}
