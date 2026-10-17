import { handle } from "@/lib/http";
import { desktopView } from "@/lib/desktop";
import { projectId } from "@/lib/auth";
import { ServiceError } from "@/lib/service";

export async function GET(_req: Request, ctx: { params: Promise<{ projectId: string }> }) {
  return handle(async () => {
    if ((await ctx.params).projectId !== projectId()) throw new ServiceError("NOT_FOUND", "Unknown project.", 404);
    return desktopView();
  });
}
