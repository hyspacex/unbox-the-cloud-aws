import Link from "next/link";
import { notFound } from "next/navigation";
import { Ago } from "@/components/Ago";
import { Glyph, initials } from "@/components/Glyph";
import { getResult, getRun, ruleHistory } from "@/lib/keel/data";
import { fileHref, ruleHref, triggerText } from "@/lib/keel/describe";

export const dynamic = "force-dynamic";

const WORD = { pass: "Passing", fail: "Failing", unknown: "Couldn’t evaluate" } as const;

export default async function RulePage({ params }: { params: Promise<{ id: string; n: string; rule: string[] }> }) {
  const { id, n, rule } = await params;
  const ruleId = rule.map(decodeURIComponent).join("/");
  const run = getRun(id, Number(n));
  if (!run) notFound();
  const r = getResult(run.run_id, ruleId);
  if (!r) notFound();
  const history = ruleHistory(id, ruleId);
  const file = (fid: string) => run.snapshot.files.find((f) => f.id === fid);
  const task = r.task_id ? run.tasks?.find((t) => t.task_id === r.task_id) : null;
  const blame = r.blame;
  const brokeRun = r.change === "broke" ? run : null;

  return (
    <div style={{ marginTop: 34 }}>
      <div className="crumbs">
        <Link href={`/folders/${id}/checks`}>Checks</Link><span className="sep">/</span>
        <span className="mono">{r.rule_id}</span>
      </div>
      <div className="split" style={{ marginTop: 6 }}>
        <div>
          <h1 className="title">{r.title}</h1>
          <div className="statusline" data-testid="rule-status" data-status={r.status}>
            <Glyph status={r.status} size="lg" />
            <span className="word">{WORD[r.status]}</span>
            {r.change === "broke" && <span className="pill alert">Broke in run #{run.number}</span>}
            {r.change === "fixed" && <span className="pill ok">Fixed in run #{run.number}</span>}
            {r.change === "added" && <span className="pill soft">New rule</span>}
          </div>
          <p className="reason" data-testid="rule-reason">{r.reason}</p>

          {r.missing?.length > 0 && r.status === "fail" && (
            <>
              <h2 className="section">Missing</h2>
              <div className="chips">{r.missing.map((m) => <span key={m} className="pill">{m}</span>)}</div>
            </>
          )}

          <h2 className="section">{r.status === "fail" ? "What the documents say" : "Evidence"}</h2>
          {r.citations.length === 0 ? (
            <p className="muted" style={{ fontSize: 15 }}>No document states this. There is nothing to cite.</p>
          ) : (
            <div className="card" data-testid="citations">
              {r.citations.map((c, i) => {
                const f = file(c.file_id);
                return (
                  <div key={i} className="cite">
                    <div className="src">
                      <b>{c.file_name}</b>
                      <span>v{f?.version_number ?? "?"}</span>
                      {c.section && <span>§ {c.section}</span>}
                      {c.timestamp && <span>at {c.timestamp}</span>}
                      {c.line && <span>line {c.line}</span>}
                      {f?.changed && <span className="pill solid" style={{ padding: "2px 8px" }}>changed in this run</span>}
                      <span className="spacer" />
                      <a className="linkish" href={fileHref(c.file_id, c.version_id, c.line)} target="_blank" rel="noreferrer">Open in Box ↗</a>
                    </div>
                    <blockquote className="quote">{c.quote}</blockquote>
                  </div>
                );
              })}
            </div>
          )}
          {r.problems?.length > 0 && (
            <div className="error" style={{ marginTop: 18 }}>
              <b>Why this wasn’t used:</b> {r.problems.join(" · ")}
            </div>
          )}

          <h2 className="section">Rule</h2>
          <div className="card panel">
            <div className="requirement">{r.text}</div>
            <div className="muted" style={{ fontSize: 12.5, marginTop: 14 }}>
              {r.pack ? <>From rule pack <b style={{ color: "var(--ink)" }}>{r.pack.name}</b> {r.pack.version} · {r.pack.publisher}</> : <>Defined in keel-rules.md v{run.rules?.file.version_number}</>}
            </div>
          </div>

          <h2 className="section">History</h2>
          <div className="strip" data-testid="rule-history">
            {history.map(({ run: hr, result }) => (
              <Link key={hr.number} href={result ? ruleHref(id, hr.number, ruleId) : `/folders/${id}/runs/${hr.number}`} className={hr.number === run.number ? "on" : ""}>
                <Glyph status={hr.status === "running" ? "running" : result ? result.status : "unknown"} />
                <span>#{hr.number}</span>
              </Link>
            ))}
          </div>
        </div>

        <aside style={{ display: "grid", gap: 18, position: "sticky", top: 80 }}>
          {blame && r.status === "fail" && (
            <div className="card" data-testid="blame">
              <div className="eyebrow">Broke after</div>
              <div className="row" style={{ marginTop: 14 }}>
                <span className="avatar">{initials(blame.user?.name)}</span>
                <div>
                  <div style={{ fontWeight: 600, color: "var(--ink)" }}>{blame.user?.name ?? "Unknown"}</div>
                  <div className="muted" style={{ fontSize: 13 }}>
                    {blame.file ? (blame.file.removed ? <>deleted {blame.file.name}</> : <>uploaded {blame.file.name} v{blame.file.version_number}</>) : "changed the folder"}
                  </div>
                </div>
              </div>
              {brokeRun ? null : <div className="muted" style={{ fontSize: 12.5, marginTop: 12 }}>Still failing since {r.failing_since ? `run #${r.failing_since.split("-").pop()}` : "earlier"}.</div>}
            </div>
          )}
          {r.fixed_by && r.status === "pass" && (
            <div className="card">
              <div className="eyebrow">Fixed by</div>
              <div className="row" style={{ marginTop: 14 }}>
                <span className="avatar light">{initials(r.fixed_by.user?.name)}</span>
                <div>
                  <div style={{ fontWeight: 600, color: "var(--ink)" }}>{r.fixed_by.user?.name}</div>
                  <div className="muted" style={{ fontSize: 13 }}>{r.fixed_by.file ? `uploaded ${r.fixed_by.file.name}${r.fixed_by.file.version_number ? ` v${r.fixed_by.file.version_number}` : ""}` : ""}</div>
                </div>
              </div>
            </div>
          )}
          {r.task_id && r.status === "fail" && (
            <div className="card" data-testid="task-card">
              <div className="eyebrow">Notified in Box</div>
              <div style={{ fontSize: 14, marginTop: 12, color: "var(--ink-3)" }}>
                Task <span className="mono">{r.task_id}</span>{task?.assignee ? <> assigned to <b style={{ color: "var(--ink)" }}>{task.assignee.name}</b></> : null}
              </div>
              <a className="btn ghost small" style={{ marginTop: 14 }} href={`/box/tasks?task=${r.task_id}`} target="_blank" rel="noreferrer">View task in Box ↗</a>
            </div>
          )}
          <div className="card panel">
            <dl className="kv">
              <dt>Run</dt><dd>#{run.number}</dd>
              <dt>Trigger</dt><dd>{triggerText(run)}</dd>
              <dt>Checked</dt><dd><Ago iso={run.finished_at} /></dd>
              <dt>Judge</dt><dd className="mono">{run.judge.model_id}</dd>
              <dt>Snapshot</dt><dd className="mono">{run.snapshot.hash.slice(0, 10)}</dd>
            </dl>
            <p className="muted" style={{ fontSize: 12, marginTop: 16, marginBottom: 0 }}>
              Every quote above was matched against the exact file version that was checked. A check that passes means the documents state it consistently — not that it was built.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
