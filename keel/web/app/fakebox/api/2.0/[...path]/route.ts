import type { NextRequest } from "next/server";
import * as box from "@/lib/fakebox/core";
import { boxError, caller } from "@/lib/fakebox/http";

// Fake Box REST API (subset of https://api.box.com/2.0). One catch-all route keeps the
// endpoint table in one place.
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ path: string[] }> };

async function handle(req: NextRequest, ctx: Ctx, method: string): Promise<Response> {
  try {
    const p = (await ctx.params).path;
    const q = req.nextUrl.searchParams;
    const me = caller(req);
    const body = async () => (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const route = `${method} /${p.map((s, i) => (i % 2 === 1 && /^\d+$/.test(s) ? ":id" : s)).join("/")}`;
    const id = p[1];

    switch (route) {
      case "GET /users/me": return Response.json(box.userMini(me));
      case "GET /users": return Response.json({ total_count: box.listUsers().length, entries: box.listUsers().map((u) => box.userMini(u.id)) });
      case "POST /folders": {
        const b = await body() as { name: string; parent: { id: string } };
        return Response.json(box.createFolder(me, b.name, b.parent?.id ?? "0"), { status: 201 });
      }
      case "GET /folders/:id": return Response.json(box.getFolder(me, id));
      case "GET /folders/:id/items":
        return Response.json(box.listFolderItems(me, id, q.get("fields"), Math.min(Number(q.get("limit") ?? 100), 1000), Number(q.get("offset") ?? 0)));
      case "POST /collaborations": {
        const b = await body() as { item: { id: string }; accessible_by: { id: string }; role: string };
        return Response.json(box.addCollaboration(me, b.item.id, b.accessible_by.id, b.role ?? "editor"), { status: 201 });
      }
      case "GET /files/:id": return Response.json(box.getFile(me, id, q.get("fields")));
      case "DELETE /files/:id": box.trashFile(me, id); return new Response(null, { status: 204 });
      case "GET /files/:id/versions": return Response.json(box.listVersions(me, id));
      case "GET /files/:id/content": {
        const { version } = box.versionContent(me, id, q.get("version"));
        // Freshly uploaded content may not be downloadable yet: Box answers 202 + Retry-After.
        if (Date.now() - Date.parse(version.created_at) < 400) return new Response(null, { status: 202, headers: { "retry-after": "1" } });
        const token = box.signDownload(id, version.id);
        return new Response(null, { status: 302, headers: { location: new URL(`/fakebox/dl/${token}`, req.nextUrl.origin).toString() } });
      }
      case "GET /files/:id/tasks": return Response.json(box.listFileTasks(me, id));
      case "POST /metadata_templates/schema": return Response.json(box.createTemplate(me, await body() as never), { status: 201 });
      case "POST /tasks": return Response.json(box.createTask(me, await body()), { status: 201 });
      case "GET /tasks/:id": return Response.json(box.getTask(me, id));
      case "PUT /tasks/:id": return Response.json(box.updateTask(me, id, await body()));
      case "GET /tasks/:id/assignments": return Response.json(box.listTaskAssignments(me, id));
      case "POST /task_assignments": return Response.json(box.assignTask(me, await body()), { status: 201 });
      case "PUT /task_assignments/:id": return Response.json(box.resolveAssignment(me, id, await body()));
      case "POST /comments": return Response.json(box.createComment(me, await body()), { status: 201 });
      case "POST /webhooks": return Response.json(box.createWebhook(me, await body()), { status: 201 });
      case "GET /webhooks": return Response.json(box.listWebhooks(me));
      case "DELETE /webhooks/:id": box.deleteWebhook(me, id); return new Response(null, { status: 204 });
    }

    // /metadata_templates/{scope}/{key}/schema
    if (method === "GET" && p[0] === "metadata_templates" && p[3] === "schema") return Response.json(box.getTemplate(p[1], p[2]));
    // /{files|folders}/{id}/metadata/{scope}/{key}
    if ((p[0] === "folders" || p[0] === "files") && p[2] === "metadata" && p.length === 5) {
      const [itemType, itemId, , scope, key] = p;
      if (method === "GET") return Response.json(box.getInstance(me, itemType, itemId, scope, key));
      if (method === "POST") return Response.json(box.createInstance(me, itemType, itemId, scope, key, await body()), { status: 201 });
      if (method === "PUT") {
        if (!(req.headers.get("content-type") || "").includes("application/json-patch+json")) {
          throw new box.BoxError(400, "bad_request", "Metadata updates must use content-type application/json-patch+json");
        }
        return Response.json(box.updateInstance(me, itemType, itemId, scope, key, (await req.json()) as never));
      }
    }
    throw new box.BoxError(404, "not_found", `No route for ${method} /${p.join("/")}`);
  } catch (e) {
    return boxError(e);
  }
}

export const GET = (r: NextRequest, c: Ctx) => handle(r, c, "GET");
export const POST = (r: NextRequest, c: Ctx) => handle(r, c, "POST");
export const PUT = (r: NextRequest, c: Ctx) => handle(r, c, "PUT");
export const DELETE = (r: NextRequest, c: Ctx) => handle(r, c, "DELETE");
