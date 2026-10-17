import Link from "next/link";
import { Ago } from "@/components/Ago";
import { KindMark } from "@/components/Marks";
import { listRuns } from "@/lib/keel/data";
import { triggerText } from "@/lib/keel/describe";

export const dynamic = "force-dynamic";

export default async function Activity({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const runs = listRuns(id);
  return (
    <>
      <p className="lede" style={{ marginTop: 30 }}>Every upload is checked. This is the audit trail: who changed what, and what it did to the project’s decisions and checks.</p>
      <h2 className="section">{runs.length} runs</h2>
      <div className="list" data-testid="activity">
        {runs.map((run) => (
          <Link key={run.number} href={`/folders/${id}/runs/${run.number}`} className="item" style={{ gridTemplateColumns: "22px 1fr auto 14px" }}>
            {run.status === "running" ? <span className="glyph running" /> : <KindMark kind={run.summary?.kind ?? (run.status === "error" ? "attention" : "clear")} />}
            <div>
              <div className="t">{run.status === "running" ? "Checking…" : run.status === "error" ? "Run failed" : run.summary?.title}
                {run.summary?.text ? <span style={{ fontWeight: 400, color: "var(--ink-3)" }}> · {run.summary.text}</span> : null}</div>
              <div className="r">{triggerText(run)}{run.rules?.changed ? " · rules changed" : ""}{run.error ? ` · ${run.error}` : ""}</div>
            </div>
            <span className="muted" style={{ fontSize: 13, textAlign: "right" }}>Run #{run.number}<br /><Ago iso={run.finished_at ?? run.started_at} /></span>
            <span className="chev">›</span>
          </Link>
        ))}
      </div>
    </>
  );
}
