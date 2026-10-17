import { handle } from "@/lib/http";
import { getAppConfig } from "@/lib/service";

/** GET /api/config -> AppConfig */
export async function GET() {
  return handle(() => getAppConfig());
}
