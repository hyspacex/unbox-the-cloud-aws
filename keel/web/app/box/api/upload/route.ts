import * as box from "@/lib/fakebox/core";
import { boxError } from "@/lib/fakebox/http";
import { actingUser } from "@/lib/session";

// The Fake Box web UI's upload: like Box's web app, dropping a file whose name already exists in
// the folder uploads it as a new version of that file.
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const { me } = await actingUser();
    if (!me) throw new box.BoxError(401, "unauthorized", "No user");
    const form = await req.formData();
    const folderId = String(form.get("folder_id"));
    const out = [];
    for (const f of form.getAll("file")) {
      if (typeof f === "string") continue;
      const content = Buffer.from(await f.arrayBuffer());
      try {
        out.push(box.uploadFile(me.id, folderId, f.name, content));
      } catch (e) {
        if (e instanceof box.BoxError && e.status === 409) {
          const conflict = (e.context as { conflicts: { id: string } }).conflicts;
          out.push(box.uploadVersion(me.id, conflict.id, content));
        } else throw e;
      }
    }
    return Response.json({ entries: out });
  } catch (e) {
    return boxError(e);
  }
}
