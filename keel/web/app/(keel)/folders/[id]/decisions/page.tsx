import Link from "next/link";
import { Glyph } from "@/components/Glyph";
import { getDecisions, latestCompleted } from "@/lib/keel/data";
import { decisionHref } from "@/lib/keel/describe";

export const dynamic = "force-dynamic";

export default async function Decisions({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const run = latestCompleted(id);
  const decisions = run ? getDecisions(run.run_id) : [];
  decisions.sort((a, b) => (a.status === "holding" ? 1 : 0) - (b.status === "holding" ? 1 : 0) || a.label.localeCompare(b.label));
  return (
    <>
      <p className="lede" style={{ marginTop: 30 }}>
        What this project has decided, read from its documents on every upload. When a new version disagrees, it shows up here.
      </p>
      <h2 className="section">{decisions.length} decisions</h2>
      <div className="dlist" data-testid="decisions">
        {decisions.map((d) => {
          const agreeing = d.statements.filter((s) => s.value === d.agreed_value).map((s) => s.file_name);
          return (
            <Link key={d.topic} href={decisionHref(id, d.topic)} className={`drow${d.status !== "holding" ? " drifted" : ""}`} data-testid={`decision-${d.topic}`} data-status={d.status}>
              <Glyph status={d.status === "holding" ? "pass" : "fail"} />
              <span className="l">{d.label}</span>
              <span className="v">
                {d.drift ? <><span className="from">{d.agreed_value}</span><span className="to">{d.drift.value}</span></> : d.agreed_value ?? "—"}
              </span>
              <span className="src">
                {d.status === "drifted" ? `${d.drift?.statements[0]?.file_name} disagrees` : d.status === "unstated" ? "no longer stated" :
                  agreeing.length > 1 ? `${agreeing.length} documents agree` : `stated in ${agreeing[0]}`}
              </span>
              <span className="chev" style={{ color: "var(--line-2)" }}>›</span>
            </Link>
          );
        })}
      </div>
    </>
  );
}
