import { verifyDownload } from "@/lib/fakebox/core";
import { boxError } from "@/lib/fakebox/http";

// Stand-in for Box's short-lived dl.boxcloud.com download URLs.
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  try {
    const v = verifyDownload((await ctx.params).token);
    return new Response(new Uint8Array(v.content), {
      headers: { "content-type": "application/octet-stream", "content-disposition": `attachment; filename="${v.name}"` },
    });
  } catch (e) {
    return boxError(e);
  }
}
