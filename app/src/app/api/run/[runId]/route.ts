import { handle } from "@/lib/http";
import { getRun } from "@/lib/service";

/** GET /api/run/[runId] -> Trace with the steps so far plus { done } */
export async function GET(_req: Request, ctx: { params: Promise<{ runId: string }> }) {
  const { runId } = await ctx.params;
  return handle(() => getRun(runId));
}
