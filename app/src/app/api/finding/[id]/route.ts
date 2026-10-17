import { handle } from "@/lib/http";
import { getFindingCard } from "@/lib/service";

/** GET /api/finding/[id] (finding id or control id) -> FindingCard */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return handle(() => getFindingCard(decodeURIComponent(id)));
}
