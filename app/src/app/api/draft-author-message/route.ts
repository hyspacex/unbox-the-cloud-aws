import { handle, readJson } from "@/lib/http";
import { draftAuthorMessage, ServiceError } from "@/lib/service";
import { canReview, requireSession } from "@/lib/auth";

/** POST /api/draft-author-message { finding_id, reason } -> { text, drafted_by } */
export async function POST(req: Request) {
  return handle(async () => {
    if (!canReview(await requireSession())) throw new ServiceError("REVIEWER_REQUIRED", "Only a configured reviewer can draft a remediation task.", 403);
    const body = await readJson<{ finding_id?: string; reason?: string }>(req);
    if (!body.finding_id) throw new ServiceError("BAD_REQUEST", "finding_id is required", 400);
    return draftAuthorMessage(body.finding_id, body.reason ?? "");
  });
}
