import Link from "next/link";
import { Ago } from "@/components/Ago";
import { Glyph } from "@/components/Glyph";
import { AlertIcon, CheckIcon, KindMark } from "@/components/Marks";
import { attention, getDecisions, getResults, latestCompleted, listRuns } from "@/lib/keel/data";
import { decisionHref, ruleHref, summaryHref, triggerText } from "@/lib/keel/describe";

export const dynamic = "force-dynamic";

export default async function Overview({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const run = latestCompleted(id);
  if (!run) {
    return (
      <div className="empty">
        <Glyph status="running" size="lg" />
        <h2 style={{ fontSize: 28, letterSpacing: "-0.03em", margin: "18px 0 6px" }}>Reading the folder…</h2>
        <p className="muted">Keel is extracting decisions and running checks for the first time.</p>
      </div>
    );
  }
  const decisions = getDecisions(run.run_id);
  const results = getResults(run.run_id);
  const n = attention(run);
  const drifted = decisions.filter((d) => d.status !== "holding");
  const failing = results.filter((r) => r.status === "fail");
  const own = results.filter((r) => !r.pack);
  const ownPassing = own.filter((r) => r.status === "pass").length;
  const packs = run.packs_summary ?? [];
  const activity = listRuns(id, 5).filter((r) => r.status === "completed" && r.summary).slice(0, 4);

  return (
    <>
      <section className="status" data-testid="overview-status" data-attention={n}>
        <div className={`mark ${n ? "alert" : "ok"}`}>{n ? <AlertIcon /> : <CheckIcon />}</div>
        <div>
          <h2>{n ? `${n} need${n === 1 ? "s" : ""} attention` : "All clear"}</h2>
          <p>
            {decisions.length - drifted.length} of {decisions.length} decisions holding · {ownPassing} of {own.length} checks passing
            {packs.length ? ` · ${packs.filter((p) => p.passing === p.total).length} of ${packs.length} certifications ready` : ""}
          </p>
        </div>
      </section>

      {n > 0 && (
        <div className="attn" data-testid="attention">
          {drifted.map((d) => (
            <Link key={d.topic} href={decisionHref(id, d.topic)} data-testid={`attention-${d.topic}`}>
              <span className="dot" />
              <div>
                <div className="what">{d.label}</div>
                {d.drift ? (
                  <div className="change">Agreed <b style={{ color: "var(--ink)" }}>{d.agreed_value}</b> → {d.drift.statements[0]?.file_name} now says <b>{d.drift.value}</b></div>
                ) : <div className="change">No longer stated in any document</div>}
                {d.drift?.by && <div className="meta">{d.drift.by.user?.name} · {d.drift.by.file?.name} v{d.drift.by.file?.version_number}{d.task_id ? " · Box task sent" : ""}</div>}
              </div>
              <span className="go">Review →</span>
            </Link>
          ))}
          {failing.map((r) => (
            <Link key={r.rule_id} href={ruleHref(id, run.number, r.rule_id)} data-testid={`attention-${r.rule_id}`}>
              <span className="dot" />
              <div>
                <div className="what">{r.title}{r.pack && <span className="packtag">{r.pack.name}</span>}</div>
                <div className="change">{r.reason}</div>
                {r.blame?.user && <div className="meta">{r.blame.user.name}{r.blame.file ? ` · ${r.blame.file.name}` : ""}{r.task_id ? " · Box task sent" : ""}</div>}
              </div>
              <span className="go">Review →</span>
            </Link>
          ))}
        </div>
      )}

      <div className="pillars">
        <Link href={`/folders/${id}/decisions`} className="pillar" data-testid="pillar-decisions">
          <div className="ph">Decisions <Glyph status={drifted.length ? "fail" : "pass"} /></div>
          <div className="num">{decisions.length - drifted.length}<small>of {decisions.length} holding</small></div>
          <div className="foot">{drifted.length ? <b>{drifted.length} drifted</b> : "Every document agrees"} · single source of truth</div>
        </Link>
        <Link href={`/folders/${id}/checks`} className="pillar" data-testid="pillar-checks">
          <div className="ph">Security &amp; privacy <Glyph status={own.some((r) => r.status === "fail") ? "fail" : "pass"} /></div>
          <div className="num">{ownPassing}<small>of {own.length} passing</small></div>
          <div className="foot">{own.length - ownPassing ? <b>{own.length - ownPassing} failing</b> : "Review checklist complete"} · keel-rules.md</div>
        </Link>
        <Link href={`/folders/${id}/packs`} className="pillar" data-testid="pillar-certifications">
          <div className="ph">Certifications <span className="muted" style={{ fontWeight: 500, fontSize: 13 }}>{packs.length ? "" : "Add a standard →"}</span></div>
          {packs.length ? (
            <div className="badges">
              {packs.map((p) => (
                <span key={p.id} className="badge" data-testid={`badge-${p.id}`}>
                  <Glyph status={p.passing === p.total ? "pass" : "fail"} />{p.name}
                  <span className="muted" style={{ fontWeight: 500 }}>{p.passing}/{p.total}</span>
                </span>
              ))}
            </div>
          ) : <div className="num" style={{ color: "var(--line-2)" }}>—</div>}
          <div className="foot">GDPR · NIST CSF · OWASP ASVS · ISO 27001</div>
        </Link>
      </div>

      <h2 className="section">Recent activity</h2>
      <div className="feed">
        {activity.map((r) => (
          <Link key={r.number} href={summaryHref(id, r)}>
            <KindMark kind={r.summary!.kind} />
            <div>
              <span className="t">{r.summary!.title}</span>
              {r.summary!.text && <span className="s"> · {r.summary!.text}</span>}
              <div className="s" style={{ fontSize: 13 }}>{triggerText(r)}</div>
            </div>
            <span className="s" style={{ fontSize: 13 }}><Ago iso={r.finished_at} /></span>
          </Link>
        ))}
      </div>
    </>
  );
}
