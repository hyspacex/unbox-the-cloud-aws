import { handle } from "@/lib/http";
import { reset, ServiceError } from "@/lib/service";
import { canReview, requireSession } from "@/lib/auth";

/** POST /api/reset (mock only) -> back to the S3 baseline */
export async function POST() {
  return handle(async () => {
    if (!canReview(await requireSession())) throw new ServiceError("REVIEWER_REQUIRED", "A demo reviewer must reset the fixture.", 403);
    return reset();
  });
}
