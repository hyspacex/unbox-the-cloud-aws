import Link from "next/link";
import { Glyph } from "@/components/Glyph";
import { getResults, latestCompleted, type Result } from "@/lib/keel/data";
import { ruleHref } from "@/lib/keel/describe";

export const dynamic = "force-dynamic";

export default async function Checks({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const run = latestCompleted(id);
  const results = run ? getResults(run.run_id) : [];
  const groups = new Map<string, Result[]>();
  for (const r of results) {
    const key = r.pack ? `${r.pack.name} · ${r.pack.version}` : "Security & privacy review · keel-rules.md";
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  const order = (r: Result) => (r.status === "fail" ? 0 : r.status === "unknown" ? 1 : 2);
  return (
    <>
      {[...groups.entries()].map(([name, rs]) => (
        <section key={name}>
          <h2 className="section">{name} <span style={{ color: "var(--mute-2)", marginLeft: 8 }}>{rs.filter((r) => r.status === "pass").length}/{rs.length}</span></h2>
          <div className="list">
            {[...rs].sort((a, b) => order(a) - order(b)).map((r) => (
              <Link key={r.rule_id} href={ruleHref(id, run!.number, r.rule_id)} className="item" data-testid={`rule-${r.rule_id}`} data-status={r.status}>
                <Glyph status={r.status} />
                <span className="rid">{r.rule_id.split("/").pop()}</span>
                <div style={{ minWidth: 0 }}><div className="t">{r.title}</div><div className="r">{r.reason}</div></div>
                {r.change === "broke" ? <span className="pill alert">Broke in #{run!.number}</span> : r.change === "fixed" ? <span className="pill ok">Fixed</span> : <span />}
                <span className="chev">›</span>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </>
  );
}
