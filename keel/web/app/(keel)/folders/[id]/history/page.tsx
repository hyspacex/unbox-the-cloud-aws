import Link from "next/link";
import { Ago } from "@/components/Ago";
import { Glyph } from "@/components/Glyph";
import { listRuns } from "@/lib/keel/data";
import { ruleHref, triggerText } from "@/lib/keel/describe";

export const dynamic = "force-dynamic";

export default async function History({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const runs = listRuns(id);
  return (
    <>
      <h2 className="section">{runs.length} runs</h2>
      <div className="list" data-testid="history">
        {runs.map((run) => {
          const c = run.counts;
          const status = run.status === "running" ? "running" : run.status === "error" ? "unknown" : c && c.failing ? "fail" : "pass";
          return (
            <div key={run.number} className="run">
              <Link href={`/folders/${id}/runs/${run.number}`} className="row"><Glyph status={status} /><span className="n">#{run.number}</span></Link>
              <Link href={`/folders/${id}/runs/${run.number}`} className="score">
                {c ? <>{c.passing}<small> / {c.total}</small></> : <small>{run.status}</small>}
              </Link>
              <div>
                <div className="what">{triggerText(run)}{run.rules?.changed ? <span className="pill soft" style={{ marginLeft: 10 }}>rules changed</span> : null}</div>
                <div className="changes">
                  {run.changes?.broke.map((r) => <Link key={r} href={ruleHref(id, run.number, r)} className="pill solid">✕ {r.split("/").pop()} broke</Link>)}
                  {run.changes?.fixed.map((r) => <Link key={r} href={ruleHref(id, run.number, r)} className="pill">✓ {r.split("/").pop()} fixed</Link>)}
                  {(run.changes?.added.length ?? 0) > 0 && <span className="pill soft">+{run.changes!.added.length} new rules</span>}
                  {(run.changes?.removed.length ?? 0) > 0 && <span className="pill soft">−{run.changes!.removed.length} rules removed</span>}
                  {run.changes?.first_run && <span className="pill soft">first run</span>}
                  {run.error && <span className="pill">{run.error}</span>}
                </div>
              </div>
              <div className="muted" style={{ fontSize: 13, textAlign: "right" }}>
                <Ago iso={run.finished_at ?? run.started_at} /><br />
                <span style={{ fontSize: 12, color: "var(--mute-2)" }}>{run.duration_ms ? `${(run.duration_ms / 1000).toFixed(1)} s` : ""}</span>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
