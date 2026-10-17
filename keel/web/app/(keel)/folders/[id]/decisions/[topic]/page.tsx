import Link from "next/link";
import { notFound } from "next/navigation";
import { Ago } from "@/components/Ago";
import { DecisionActions } from "@/components/DecisionActions";
import { Glyph, initials } from "@/components/Glyph";
import { getDecision, getFolder, latestCompleted, type Statement } from "@/lib/keel/data";
import { fileHref } from "@/lib/keel/describe";
import { actingUser } from "@/lib/session";

export const dynamic = "force-dynamic";

function Quote({ s, old }: { s: Statement; old?: boolean }) {
  return (
    <>
      <div className={`q${old ? " old" : ""}`}>{s.quote}</div>
      <div className="qs">
        <a href={fileHref(s.file_id, s.version_id, s.line)} target="_blank" rel="noreferrer">{s.file_name}</a>
        {s.section ? ` · § ${s.section}` : ""}{s.timestamp ? ` · at ${s.timestamp}` : ""}{old ? " · superseded" : ""}
      </div>
    </>
  );
}

export default async function DecisionPage({ params }: { params: Promise<{ id: string; topic: string }> }) {
  const { id, topic } = await params;
  const run = latestCompleted(id);
  const d = run ? getDecision(run.run_id, topic) : null;
  if (!run || !d) notFound();
  const folder = getFolder(id)!;
  const { me } = await actingUser();
  const agreed = d.statements.filter((s) => s.value === d.agreed_value);
  const files = (s: Statement[]) => [...new Set(s.map((x) => x.file_name))];
  const proposed = d.status === "drifted" && d.drift;

  return (
    <div style={{ marginTop: 18 }}>
      <div className="crumbs"><Link href={`/folders/${id}/decisions`}>Decisions</Link><span className="sep">›</span><span>{d.label}</span></div>
      <h1 className="title">{d.label}</h1>
      <div className="statusline" data-testid="decision-status" data-status={d.status}>
        <Glyph status={d.status === "holding" ? "pass" : "change"} />
        <span className="word">{d.status === "holding" ? "Agreed" : d.status === "drifted" ? (d.decision_state === "revert_requested" ? "Kept · revert requested" : "Proposed change") : "No longer stated"}</span>
        {d.status === "holding" && <span className="muted">{files(agreed).length > 1 ? `${files(agreed).length} documents agree` : `stated in ${files(agreed)[0]}`}</span>}
      </div>

      {proposed ? (
        <>
          <div className="compare" data-testid="compare">
            <div className="side">
              <div className="k">Current decision</div>
              <div className="val">{d.agreed_value}</div>
              <div className="muted" style={{ fontSize: 13 }}>in {files(agreed).join(", ")}</div>
              {agreed.slice(0, 2).map((s, i) => <Quote key={i} s={s} />)}
            </div>
            <div className="side now">
              <div className="k" style={{ color: "var(--blue)" }}>Proposed</div>
              <div className="val">{d.drift!.value}</div>
              <div className="muted" style={{ fontSize: 13 }}>in {files(d.drift!.statements).join(", ")} · {d.drift!.by?.user?.name}</div>
              {d.drift!.statements.slice(0, 2).map((s, i) => <Quote key={i} s={s} />)}
            </div>
          </div>
          <div className="decide" data-testid="decide">
            <span className="avatar">{initials(folder.owner?.name)}</span>
            <div style={{ flex: 1, fontSize: 13.5 }}>
              <b>{folder.owner?.name}</b> decides. Adopting makes {d.drift!.value} the decision and asks the authors of documents that still say {d.agreed_value} to update them; meeting records are kept as history. Keeping asks {d.drift!.by?.user?.name ?? "the author"} to revert.
            </div>
            <DecisionActions folderId={id} topic={d.topic} current={d.agreed_value ?? ""} proposed={d.drift!.value} canDecide={me?.id === folder.owner?.id}
              owner={folder.owner?.name ?? "the decision owner"} state={d.decision_state} size="big" />
          </div>
        </>
      ) : (
        <div className="compare" style={{ gridTemplateColumns: "1fr" }}>
          <div className="side">
            <div className="k">Decision</div>
            <div className="val">{d.agreed_value ?? "—"}</div>
            {agreed.map((s, i) => <Quote key={i} s={s} />)}
            {(d.superseded ?? []).map((s, i) => <Quote key={`s${i}`} s={s} old />)}
          </div>
        </div>
      )}

      <h2 className="section">History</h2>
      <div className="timeline" data-testid="history">
        <div className="ok"><b>{d.history.find((h) => h.from)?.from ?? d.agreed_value}</b> first recorded · run #{d.first_seen_run} · <Ago iso={d.first_seen_at} /></div>
        {d.history.map((h, i) => (
          h.adopted ? <div key={i} className="blue"><b>Adopted {h.to}</b> (was {h.from}) by {h.by?.user?.name} · proposed in {h.by?.file?.name} · <Ago iso={h.at} /></div>
          : h.kept ? <div key={i}><b>Kept {h.kept}</b> (declined {h.declined}) by {h.by?.user?.name} · <Ago iso={h.at} /></div>
          : <div key={i} className="ok"><b>Changed {h.from} → {h.to}</b> when every document agreed · run #{h.run} · <Ago iso={h.at} /></div>
        ))}
        {proposed && <div className="blue"><b>{d.drift!.value} proposed</b> by {d.drift!.by?.user?.name} in {d.drift!.by?.file?.name} v{d.drift!.by?.file?.version_number}</div>}
      </div>
    </div>
  );
}
