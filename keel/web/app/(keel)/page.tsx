import Link from "next/link";
import { Ago } from "@/components/Ago";
import { ConnectFolder } from "./ConnectFolder";
import { listFolders } from "@/lib/keel/data";
import { runnerApi } from "@/lib/keel/runner";

export const dynamic = "force-dynamic";

export default async function Home() {
  const folders = listFolders();
  let available: { id: string; name: string }[] = [];
  let runnerDown = false;
  try {
    available = (await runnerApi<{ folders: { id: string; name: string }[] }>("/box/folders")).folders
      .filter((f) => !folders.some((c) => c.folder_id === f.id));
  } catch {
    runnerDown = true;
  }
  return (
    <main className="page">
      <div className="eyebrow">Folders</div>
      <h1 className="display">Every upload, checked.</h1>
      <p className="lede">Keel reruns a folder&apos;s rules whenever a document is added or changed, and tells the person whose change broke a check.</p>

      {folders.length > 0 && (
        <div className="folders">
          {folders.map((f) => {
            const c = f.latest_run?.counts;
            const failing = c?.failing ?? 0;
            return (
              <Link key={f.folder_id} href={`/folders/${f.folder_id}`} className="foldercard" data-testid="folder-card">
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <span className="fn">{f.name}</span>
                  {c && <span className={`pill ${failing ? "solid" : ""}`}>{failing ? `${failing} failing` : "All passing"}</span>}
                </div>
                <div style={{ fontSize: 44, fontWeight: 650, letterSpacing: "-0.04em", color: "var(--ink)" }}>
                  {c ? <>{c.passing}<span style={{ color: "var(--mute-2)", fontSize: 22, fontWeight: 500 }}> / {c.total} passing</span></> : "—"}
                </div>
                <div className="muted" style={{ fontSize: 13 }}>
                  Run #{f.latest_run?.number ?? 0} · <Ago iso={f.latest_run?.finished_at} /> · Box folder <span className="mono">{f.folder_id}</span>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      <h2 className="section">Connect a Box folder</h2>
      {runnerDown ? (
        <div className="card">The Keel runner is not reachable. Start the local stack with <span className="mono">./dev.sh</span>.</div>
      ) : available.length ? (
        <ConnectFolder folders={available} />
      ) : (
        <p className="muted" style={{ fontSize: 14 }}>
          {folders.length ? "Every folder shared with Keel is connected." : "No folders are shared with Keel yet. In Box, invite Keel’s service account to a folder as an editor."}
        </p>
      )}
    </main>
  );
}
