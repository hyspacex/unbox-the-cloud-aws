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
      <p className="lede" style={{ marginTop: 18 }}>
        What this project has decided, read from its documents on every upload. A document that says something different is a proposed change: the decision owner adopts it or keeps the current decision.
      </p>
      <h2 className="section">{decisions.length} decisions</h2>
      <div className="dlist" data-testid="decisions">
        {decisions.map((d) => {
          const agreeing = [...new Set(d.statements.filter((s) => s.value === d.agreed_value).map((s) => s.file_name))];
          const changed = d.history.filter((h) => h.adopted || h.to).length;
          return (
            <Link key={d.topic} href={decisionHref(id, d.topic)} className={`drow${d.status !== "holding" ? " proposed" : ""}`} data-testid={`decision-${d.topic}`} data-status={d.status}>
              <Glyph status={d.status === "holding" ? "pass" : "change"} />
              <span className="l">{d.label}</span>
              <span className="v">
                {d.drift ? <><span className="from">{d.agreed_value}</span><span className="to">{d.drift.value}</span></> : d.agreed_value ?? "—"}
                {d.status === "holding" && changed > 0 && <span className="pill ok" style={{ marginLeft: 8 }}>updated</span>}
              </span>
              <span className="src">
                {d.status === "drifted" ? `proposed in ${d.drift?.statements[0]?.file_name}` : d.status === "unstated" ? "no longer stated" :
                  agreeing.length > 1 ? `${agreeing.length} documents agree` : `stated in ${agreeing[0]}`}
              </span>
              <span style={{ color: "var(--mute-2)" }}>›</span>
            </Link>
          );
        })}
      </div>
    </>
  );
}
