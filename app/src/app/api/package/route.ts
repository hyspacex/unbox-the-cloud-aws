import { handle } from "@/lib/http";
import { getPackageView } from "@/lib/service";

/** GET /api/package -> PackageView for the current snapshot */
export async function GET() {
  return handle(() => getPackageView());
}
