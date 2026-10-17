import { handle } from "@/lib/http";
import { getLedger } from "@/lib/service";

/** GET /api/ledger?control=SEC-ARCH-07 -> Ledger (events filtered) */
export async function GET(req: Request) {
  return handle(() => {
    const control = new URL(req.url).searchParams.get("control") ?? undefined;
    return getLedger({ control });
  });
}
