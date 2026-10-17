import Link from "next/link";
import { Ago } from "@/components/Ago";
import { DecisionActions } from "@/components/DecisionActions";
import { Glyph } from "@/components/Glyph";
import { AlertIcon, CheckIcon, KindMark } from "@/components/Marks";
import { getDecisions, getFolder, getResults, latestCompleted, listRuns } from "@/lib/keel/data";
import { decisionHref, ruleHref, summaryHref, triggerText } from "@/lib/keel/describe";
import { actingUser } from "@/lib/session";

export const dynamic = "force-dynamic";

const ArrowIcon = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h13M13 6l6 6-6 6" /></svg>;

export default async function Overview({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const run = latestCompleted(id);
  const folder = getFolder(id)!;
  const { me } = await actingUser();
  if (!run) {
    return (
      <div className="empty">
        <Glyph status="running" size="lg" />
        <h2 style={{ fontSize: 20, margin: "16px 0 4px" }}>Reading the folder…</h2>
        <p className="muted">Keel is finding the project’s decisions and running its checks.</p>
      </div>
    );
  }
  const decisions = getDecisions(run.run_id);
  const results = getResults(run.run_id);
  const proposed = decisions.filter((d) => d.status === "drifted");
  const unstated = decisions.filter((d) => d.status === "unstated");
  const failing = results.filter((r) => r.status === "fail");
  const own = results.filter((r) => !r.pack);
  const ownPassing = own.filter((r) => r.status === "pass").length;
  const packs = run.packs_summary ?? [];
  const activity = listRuns(id, 6).filter((r) => r.status === "completed" && r.summary).slice(0, 4);
  const isOwner = me?.id === folder.owner?.id;
  const toDecide = proposed.filter((d) => d.decision_state !== "revert_requested");
  const reverting = proposed.filter((d) => d.decision_state === "revert_requested");
  const tone = failing.length ? "alert" : proposed.length || unstated.length ? "blue" : "ok";
  const title = failing.length
    ? `${failing.length} check${failing.length > 1 ? "s" : ""} failing`
    : toDecide.length ? `${toDecide.length} proposed change${toDecide.length > 1 ? "s" : ""} to review`
    : reverting.length ? `Waiting for ${reverting[0].drift?.by?.user?.name ?? "the author"} to revert ${reverting.length > 1 ? `${reverting.length} changes` : "a change"}`
    : unstated.length ? `${unstated.length} decision${unstated.length > 1 ? "s" : ""} no longer stated` : "All clear";

  return (
    <>
      <section className={`status ${tone}`} data-testid="overview-status" data-tone={tone}>
        <div className={`mark ${tone}`}>{tone === "ok" ? <CheckIcon /> : tone === "blue" ? <ArrowIcon /> : <AlertIcon />}</div>
        <div>
          <h2>{title}</h2>
          <p>{decisions.length - proposed.length - unstated.length} of {decisions.length} decisions agreed · {ownPassing} of {own.length} security &amp; privacy checks passing
            {packs.length ? ` · ${packs.filter((p) => p.passing === p.total).length} of ${packs.length} certifications ready` : ""}</p>
        </div>
      </section>

      {(proposed.length > 0 || failing.length > 0 || unstated.length > 0) && (
        <div className="attn" data-testid="attention">
          {proposed.map((d) => (
            <div key={d.topic} data-testid={`attention-${d.topic}`}>
              <Glyph status="change" />
              <div>
                <Link href={decisionHref(id, d.topic)} className="what">{d.label} <span className="pill blue">{d.decision_state === "revert_requested" ? "Revert requested" : "Proposed change"}</span></Link>
                <div className="change"><b>{d.agreed_value}</b> → <b className="new">{d.drift?.value}</b> in {d.drift?.statements[0]?.file_name}</div>
                <div className="meta">{d.drift?.by?.user?.name} · {d.drift?.by?.file?.name} v{d.drift?.by?.file?.version_number} · <Link className="linkish" href={decisionHref(id, d.topic)}>Compare</Link></div>
              </div>
              <DecisionActions folderId={id} topic={d.topic} current={d.agreed_value ?? ""} proposed={d.drift?.value ?? ""}
                canDecide={isOwner} owner={folder.owner?.name ?? "the decision owner"} state={d.decision_state} />
            </div>
          ))}
          {unstated.map((d) => (
            <div key={d.topic}>
              <Glyph status="change" />
              <div><Link href={decisionHref(id, d.topic)} className="what">{d.label}</Link><div className="change">No document states this any more (was {d.agreed_value}).</div></div>
              <Link className="btn ghost small" href={decisionHref(id, d.topic)}>Review</Link>
            </div>
          ))}
          {failing.map((r) => (
            <div key={r.rule_id} data-testid={`attention-${r.rule_id}`}>
              <Glyph status="fail" />
              <div>
                <Link href={ruleHref(id, run.number, r.rule_id)} className="what">{r.title}{r.pack && <span className="packtag">{r.pack.name}</span>}</Link>
                <div className="change">{r.reason}</div>
                {r.blame?.user && <div className="meta">{r.blame.user.name}{r.blame.file ? ` · ${r.blame.file.name}` : ""}{r.task_id ? " · Box task sent" : ""}</div>}
              </div>
              <Link className="btn ghost small" href={ruleHref(id, run.number, r.rule_id)}>Review</Link>
            </div>
          ))}
        </div>
      )}

      <div className="pillars">
        <Link href={`/folders/${id}/decisions`} className="pillar" data-testid="pillar-decisions">
          <div className="ph">Decisions <Glyph status={proposed.length || unstated.length ? "change" : "pass"} /></div>
          <div className="num">{decisions.length - proposed.length - unstated.length}<small>of {decisions.length} agreed</small></div>
          <div className="foot">{proposed.length ? <b>{proposed.length} proposed change</b> : "Read from the documents"} · single source of truth</div>
        </Link>
        <Link href={`/folders/${id}/checks`} className="pillar" data-testid="pillar-checks">
          <div className="ph">Security &amp; privacy <Glyph status={own.some((r) => r.status === "fail") ? "fail" : "pass"} /></div>
          <div className="num">{ownPassing}<small>of {own.length} passing</small></div>
          <div className="foot">{own.length - ownPassing ? <b className="bad">{own.length - ownPassing} failing</b> : "Review checklist complete"} · keel-rules.md</div>
        </Link>
        <Link href={`/folders/${id}/packs`} className="pillar" data-testid="pillar-certifications">
          <div className="ph">Certifications {!packs.length && <span className="linkish" style={{ fontWeight: 400 }}>Add a standard</span>}</div>
          {packs.length ? (
            <div className="badges">
              {packs.map((p) => (
                <span key={p.id} className="badge" data-testid={`badge-${p.id}`}>
                  <Glyph status={p.passing === p.total ? "pass" : "fail"} />{p.name}<span className="muted" style={{ fontWeight: 400 }}>{p.passing}/{p.total}</span>
                </span>
              ))}
            </div>
          ) : <div className="muted" style={{ fontSize: 13 }}>No standards installed yet.</div>}
          <div className="foot">GDPR · NIST CSF · OWASP ASVS · ISO 27001</div>
        </Link>
      </div>

      <h2 className="section">Recent activity</h2>
      <div className="feed">
        {activity.map((r) => (
          <Link key={r.number} href={summaryHref(id, r)}>
            <KindMark kind={r.summary!.kind} />
            <div>
              <span className="t">{r.summary!.title}</span>{r.summary!.text && <span className="s"> · {r.summary!.text}</span>}
              <div className="s" style={{ fontSize: 12.5 }}>{triggerText(r)}</div>
            </div>
            <span className="s" style={{ fontSize: 12.5 }}><Ago iso={r.finished_at} /></span>
          </Link>
        ))}
      </div>
    </>
  );
}
