import Link from "next/link";
import { notFound } from "next/navigation";
import { Ago } from "@/components/Ago";
import { Glyph, initials } from "@/components/Glyph";
import { getDecision, latestCompleted, type Statement } from "@/lib/keel/data";
import { fileHref } from "@/lib/keel/describe";

export const dynamic = "force-dynamic";

function Quote({ s }: { s: Statement }) {
  return (
    <>
      <div className="q">{s.quote}</div>
      <div className="qs">
        <a href={fileHref(s.file_id, s.version_id, s.line)} target="_blank" rel="noreferrer" style={{ textDecoration: "underline" }}>{s.file_name}</a>
        {s.section ? ` · § ${s.section}` : ""}{s.timestamp ? ` · at ${s.timestamp}` : ""}
      </div>
    </>
  );
}

export default async function DecisionPage({ params }: { params: Promise<{ id: string; topic: string }> }) {
  const { id, topic } = await params;
  const run = latestCompleted(id);
  const d = run ? getDecision(run.run_id, topic) : null;
  if (!run || !d) notFound();
  const agreed = d.statements.filter((s) => s.value === d.agreed_value);
  const files = (s: Statement[]) => [...new Set(s.map((x) => x.file_name))];

  return (
    <div style={{ marginTop: 30 }}>
      <div className="crumbs"><Link href={`/folders/${id}/decisions`}>Decisions</Link><span className="sep">/</span><span>{d.label}</span></div>
      <h1 className="title">{d.label}</h1>
      <div className="statusline" data-testid="decision-status" data-status={d.status}>
        <Glyph status={d.status === "holding" ? "pass" : "fail"} size="lg" />
        <span className="word">{d.status === "holding" ? "Holding" : d.status === "drifted" ? "Drifted" : "No longer stated"}</span>
        {d.status === "holding" && <span className="muted">{files(agreed).length > 1 ? `${files(agreed).length} documents agree` : `Stated in ${files(agreed)[0]}`}</span>}
      </div>

      {d.drift ? (
        <div className="compare" data-testid="compare">
          <div className="side">
            <div className="k">Agreed</div>
            <div className="val">{d.agreed_value}</div>
            <div className="muted" style={{ fontSize: 14 }}>in {files(agreed).join(", ")}</div>
            {agreed.slice(0, 2).map((s, i) => <Quote key={i} s={s} />)}
          </div>
          <div className="side now">
            <div className="k" style={{ color: "var(--alert)" }}>Now</div>
            <div className="val">{d.drift.value}</div>
            <div className="muted" style={{ fontSize: 14 }}>in {files(d.drift.statements).join(", ")}</div>
            {d.drift.statements.slice(0, 2).map((s, i) => <Quote key={i} s={s} />)}
          </div>
        </div>
      ) : (
        <div className="compare" style={{ gridTemplateColumns: "1fr" }}>
          <div className="side">
            <div className="k">Agreed</div>
            <div className="val" style={{ color: "var(--ok)" }}>{d.agreed_value ?? "—"}</div>
            {agreed.map((s, i) => <Quote key={i} s={s} />)}
          </div>
        </div>
      )}

      {d.drift?.by && (
        <div className="card" style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 14 }} data-testid="drift-by">
          <span className="avatar">{initials(d.drift.by.user?.name)}</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, color: "var(--ink)" }}>{d.drift.by.user?.name} uploaded {d.drift.by.file?.name} v{d.drift.by.file?.version_number}</div>
            <div className="muted" style={{ fontSize: 13.5 }}>{d.task_id ? "Keel sent them a Box task with both quotes." : "Not notified."}</div>
          </div>
          {d.task_id && <a className="btn ghost small" href={`/box/tasks?task=${d.task_id}`} target="_blank" rel="noreferrer">View Box task ↗</a>}
        </div>
      )}

      <h2 className="section">History</h2>
      <div className="timeline">
        <div className="ok"><b>{d.history[0]?.from ?? d.agreed_value}</b> first recorded <Ago iso={d.first_seen_at} /> (run #{d.first_seen_run})</div>
        {d.history.map((h, i) => (
          <div key={i}><b>Changed {h.from} → {h.to}</b> by {h.by?.user?.name ?? "someone"} · run #{h.run} · <Ago iso={h.at} /></div>
        ))}
        {d.drift && <div className="alert"><b>Drifted to {d.drift.value}</b> · {d.drift.by?.user?.name} · {d.drift.by?.file?.name}</div>}
      </div>
      <p className="note" style={{ marginTop: 30 }}>
        Keel reads decisions from the documents themselves, so there is nothing to maintain by hand. If a change is intended, update the other
        documents too: once they all agree, the new value becomes the decision and the change is recorded here.
      </p>
    </div>
  );
}
