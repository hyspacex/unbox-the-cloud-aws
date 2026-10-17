import { handle, readJson } from "@/lib/http";
import { draftAuthorMessage, ServiceError } from "@/lib/service";

/** POST /api/draft-author-message { finding_id, reason } -> { text, drafted_by } */
export async function POST(req: Request) {
  return handle(async () => {
    const body = await readJson<{ finding_id?: string; reason?: string }>(req);
    if (!body.finding_id) throw new ServiceError("BAD_REQUEST", "finding_id is required", 400);
    return draftAuthorMessage(body.finding_id, body.reason ?? "");
  });
}
