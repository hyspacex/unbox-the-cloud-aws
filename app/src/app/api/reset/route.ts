import { handle } from "@/lib/http";
import { reset } from "@/lib/service";

/** POST /api/reset (mock only) -> back to the S3 baseline */
export async function POST() {
  return handle(() => reset());
}
