import Link from "next/link";
import { Ago } from "./Ago";
import { Glyph } from "./Glyph";
import type { Result, Run } from "@/lib/keel/data";
import { ruleHref, triggerText } from "@/lib/keel/describe";

function ChangePill({ r, run }: { r: Result; run: Run }) {
  if (r.change === "broke") return <span className="pill alert">Broke in #{run.number}</span>;
  if (r.change === "fixed") return <span className="pill ok">Fixed in #{run.number}</span>;
  if (r.change === "added") return <span className="pill soft">New rule</span>;
  if (r.status === "fail" && r.failing_since && r.failing_since !== r.run_id) return <span className="muted" style={{ fontSize: 12 }}>failing since #{r.failing_since.split("-").pop()}</span>;
  return null;
}

function Rows({ items, run, folderId, dim }: { items: Result[]; run: Run; folderId: string; dim?: boolean }) {
  return (
    <div className="list">
      {items.map((r) => (
        <Link key={r.rule_id} href={ruleHref(folderId, run.number, r.rule_id)} className={`item${dim ? " dim" : ""}`} data-testid={`rule-${r.rule_id}`} data-status={r.status}>
          <Glyph status={r.status} />
          <span className="rid" title={r.rule_id}>{r.rule_id.split("/").pop()}</span>
          <div style={{ minWidth: 0 }}>
            <div className="t">{r.title}{r.pack && <span className="packtag">{r.pack.name}</span>}</div>
            <div className="r">{r.reason}</div>
          </div>
          <ChangePill r={r} run={run} />
          <span className="chev">›</span>
        </Link>
      ))}
    </div>
  );
}

export function RunView({ folderId, run, results, live, queued, latestNumber }: {
  folderId: string; run: Run | null; results: Result[]; live: Run | null; queued: number; latestNumber?: number;
}) {
  const busy = live || queued > 0;
  const banner = busy && (
    <div className="banner" data-testid="run-banner">
      <span className="pulse" />
      <span>
        {live ? <><b>Run #{live.number}</b> in progress · {triggerText(live)}</> : <><b>Run queued</b> · waiting for the runner</>}
      </span>
      <div className="progress" />
    </div>
  );

  if (!run) {
    return (
      <>
        {banner}
        <div className="empty">
          <Glyph status="running" size="lg" />
          <h2 style={{ fontSize: 28, letterSpacing: "-0.03em", margin: "18px 0 6px" }}>First run in progress</h2>
          <p className="muted">Keel is reading the folder and checking every rule.</p>
        </div>
      </>
    );
  }
  if (run.status === "running" || !run.counts && run.status !== "error") {
    return (
      <>
        {banner}
        <div className="empty">
          <Glyph status="running" size="lg" />
          <h2 style={{ fontSize: 28, letterSpacing: "-0.03em", margin: "18px 0 6px" }}>Run #{run.number} in progress</h2>
          <p className="muted">{triggerText(run)}. Results appear here when the run finishes.</p>
        </div>
      </>
    );
  }
  if (run.status === "error") {
    return (
      <>
        {banner}
        <div className="hero"><div><div className="headline">Run #{run.number} could not complete</div><div className="sub">{run.error}</div></div></div>
      </>
    );
  }

  const c = run.counts!;
  const failing = results.filter((r) => r.status !== "pass");
  const passing = results.filter((r) => r.status === "pass");
  const order = (r: Result) => (r.status === "fail" ? 0 : 1);
  failing.sort((a, b) => order(a) - order(b));
  const broke = run.changes?.broke ?? [];
  const fixed = run.changes?.fixed ?? [];
  const historic = latestNumber && latestNumber !== run.number;
  const dark = false;
  const headline = c.failing
    ? `${c.failing} check${c.failing > 1 ? "s" : ""} failing`
    : c.unknown ? `${c.unknown} check${c.unknown > 1 ? "s" : ""} could not be evaluated` : "All checks passing";
  const task = run.tasks?.find((t) => t.task_id);

  return (
    <>
      {historic && (
        <div className="banner">
          <span>Viewing run #{run.number}. The latest is run #{latestNumber}.</span>
          <span className="spacer" />
          <Link className="linkish" href={`/folders/${folderId}`}>Go to latest →</Link>
        </div>
      )}
      {banner}
      <section className={`hero${dark ? " dark" : ""}`} data-testid="status-hero" data-failing={c.failing}>
        <div>
          <div className="big">{c.passing}<small>/ {c.total} checks passing{run.decisions ? ` · ${run.decisions.holding}/${run.decisions.total} decisions holding` : ""}</small></div>
          <div className="headline">{run.summary?.title ?? headline}{run.summary?.text ? <span style={{ fontWeight: 450, color: "var(--mute)" }}> · {run.summary.text}</span> : null}</div>
          <div className="sub">
            Run #{run.number} · <Ago iso={run.finished_at} /> · {triggerText(run)}
            {run.rules?.changed ? " · rules changed" : ""}
          </div>
          <div className="segments">
            {[...results].sort((a, b) => order(a) - order(b)).map((r) => <i key={r.rule_id} className={r.status === "fail" ? "fail" : r.status === "unknown" ? "unknown" : ""} />)}
          </div>
        </div>
        <div className="side">
          {broke.length > 0 && <span className="pill alert">{broke.length} broke in this run</span>}
          {fixed.length > 0 && <span className="pill ok">{fixed.length} fixed in this run</span>}
          {task && <span style={{ fontSize: 13, color: dark ? "#a1a1a6" : "var(--mute)" }}>Box task sent to {task.assignee?.name ?? "assignee"}</span>}
          <span style={{ fontSize: 12, color: dark ? "#8e8e93" : "var(--mute-2)" }}>{run.snapshot.files.length} files · {((run.duration_ms ?? 0) / 1000).toFixed(1)} s · {run.judge.model_id}</span>
        </div>
      </section>

      {failing.length > 0 && (<><h2 className="section">Needs attention</h2><Rows items={failing} run={run} folderId={folderId} /></>)}
      {passing.length > 0 && (<><h2 className="section">Passing</h2><Rows items={passing} run={run} folderId={folderId} /></>)}

      <h2 className="section">Checked files</h2>
      <div className="list">
        {run.snapshot.files.map((f) => {
          const cov = run.coverage?.find((x) => x.file_id === f.id);
          return (
            <a key={f.id} className="item" href={`/box/files/${f.id}?version=${f.version_id}`} target="_blank" rel="noreferrer" style={{ gridTemplateColumns: "22px 1fr auto auto 14px" }}>
              <span className="fileicon" style={{ width: 20, height: 24, fontSize: 0, borderColor: f.changed ? "var(--ink)" : "var(--line-2)" }} />
              <div><div className="t" style={{ fontSize: 15 }}>{f.name}</div><div className="r">v{f.version_number} · {f.modified_by?.name} · <Ago iso={f.modified_at} /></div></div>
              {f.changed ? <span className="pill solid">{f.added ? "Added" : "Changed"}</span> : <span />}
              <span className="muted" style={{ fontSize: 12 }}>{cov ? (cov.status === "read" ? "read" : cov.status) : "rules"}</span>
              <span className="chev">›</span>
            </a>
          );
        })}
      </div>
    </>
  );
}
