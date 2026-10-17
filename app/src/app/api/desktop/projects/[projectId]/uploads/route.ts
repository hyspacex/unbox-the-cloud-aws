import { handle } from "@/lib/http";
import { uploadForm, uploadAndSubmit } from "@/lib/desktop";
import { projectId, requireSession } from "@/lib/auth";
import { ServiceError } from "@/lib/service";

export async function POST(req: Request, ctx: { params: Promise<{ projectId: string }> }) {
  return handle(async () => {
    if ((await ctx.params).projectId !== projectId()) throw new ServiceError("NOT_FOUND", "Unknown project.", 404);
    return uploadAndSubmit(await uploadForm(req), await requireSession());
  }, 202);
}
