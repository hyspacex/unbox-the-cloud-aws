import { handle } from "@/lib/http";
import { exportCsv, exportManifest } from "@/lib/service";

/** GET /api/export?part=csv | ?part=manifest, optional &phase=live (scope "run"); default scope "ledger". */
export async function GET(req: Request) {
  return handle(() => {
    const q = new URL(req.url).searchParams;
    const part = q.get("part") ?? "manifest";
    const phase = q.get("phase") ?? undefined; // e.g. phase=live: this app's runs only, without the seed fixture
    if (part === "csv") {
      return new Response(exportCsv(phase), {
        headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="keel-export.csv"', "Cache-Control": "no-store" },
      });
    }
    return exportManifest(phase);
  });
}
