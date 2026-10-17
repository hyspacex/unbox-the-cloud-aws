import { handle } from "@/lib/http";
import { exportCsv, exportManifest } from "@/lib/service";

/** GET /api/export?part=csv | ?part=manifest */
export async function GET(req: Request) {
  return handle(() => {
    const part = new URL(req.url).searchParams.get("part") ?? "manifest";
    if (part === "csv") {
      return new Response(exportCsv(), {
        headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="keel-export.csv"', "Cache-Control": "no-store" },
      });
    }
    return exportManifest();
  });
}
