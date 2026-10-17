import type { NextRequest } from "next/server";
import * as box from "@/lib/fakebox/core";
import { boxError, caller } from "@/lib/fakebox/http";

// Fake of https://upload.box.com/api/2.0 — multipart form with `attributes` (JSON) and `file`.
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ path: string[] }> };

export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const p = (await ctx.params).path;
    const me = caller(req);
    const form = await req.formData();
    const attributes = JSON.parse(String(form.get("attributes") ?? "{}")) as { name?: string; parent?: { id?: string } };
    const f = form.get("file");
    if (!f || typeof f === "string") throw new box.BoxError(400, "bad_request", "file part is required");
    const content = Buffer.from(await f.arrayBuffer());
    if (p.length === 2 && p[0] === "files" && p[1] === "content") {
      const out = box.uploadFile(me, attributes.parent?.id ?? "", attributes.name ?? f.name, content);
      return Response.json({ total_count: 1, entries: [out] }, { status: 201 });
    }
    if (p.length === 3 && p[0] === "files" && p[2] === "content") {
      const out = box.uploadVersion(me, p[1], content, attributes.name);
      return Response.json({ total_count: 1, entries: [out] }, { status: 201 });
    }
    throw new box.BoxError(404, "not_found", "No such upload route");
  } catch (e) {
    return boxError(e);
  }
}
