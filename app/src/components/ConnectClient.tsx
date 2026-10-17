"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useKeel } from "./AppProvider";

type User = { id: string; name: string; login: string };
type Session = { user: User | null; projectId: string; mode: "mock" | "live"; oauthConfigured: boolean };

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...init });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || `HTTP ${response.status}`);
  return data as T;
}

export function ConnectClient() {
  const { refreshConfig } = useKeel();
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [link, setLink] = useState("");
  const [linkExpires, setLinkExpires] = useState(0);
  const refresh = () => request<Session>("/api/auth/session").then(setSession);
  useEffect(() => { void refresh().catch(error => setError(String(error))); }, []);
  useEffect(() => {
    if (!linkExpires) return;
    const timer = setTimeout(() => {
      setLink("");
      setMessage("Connection link expired. Create a fresh link.");
    }, Math.max(0, linkExpires - Date.now()));
    return () => clearTimeout(timer);
  }, [linkExpires]);

  async function signIn(role: "author" | "reviewer") {
    setBusy(true); setError("");
    try {
      await request("/api/auth/demo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role }) });
      await refresh();
      refreshConfig();
    } catch (error) { setError(String(error)); }
    finally { setBusy(false); }
  }
  async function connect() {
    setBusy(true); setError("");
    try {
      const response = await request<{ url: string }>("/api/desktop/link", { method: "POST" });
      setLink(response.url);
      setLinkExpires(Date.now() + 60_000);
      setMessage("Link ready for 60 seconds. Open it on this device after installing Keel.");
    } catch (error) { setError(String(error)); }
    finally { setBusy(false); }
  }
  async function upload(files: FileList | null) {
    if (!files?.length) return;
    if (!session?.user) { setError("Sign in before uploading."); return; }
    setBusy(true); setError(""); setMessage("Uploading and starting the review...");
    try {
      const data = new FormData();
      for (const file of Array.from(files)) data.append("files", file);
      const response = await request<{ runId: string; snapshotId: string; mode: string }>(`/api/desktop/projects/${encodeURIComponent(session.projectId)}/uploads`, { method: "POST", body: data });
      setMessage(`${response.mode === "mock" ? "Mock" : "Live"} upload accepted. ${response.runId} is evaluating ${response.snapshotId}. Open the package to follow the trace.`);
    } catch (error) { setError(String(error)); setMessage(""); }
    finally { setBusy(false); }
  }

  return <section className="mx-auto max-w-2xl px-6 py-12 space-y-6">
    <div><p className="text-sm text-muted">One account. One project. One widget.</p><h1 className="text-3xl font-semibold mt-2">Connect your desktop</h1></div>
    {error && <p role="alert" className="rounded-lg border border-red-line bg-red-bg p-4 text-sm text-red-ink">{error}</p>}
    {!session ? <p>Loading sign-in...</p> : !session.user ? <div className="rounded-xl border hairline bg-panel p-6 space-y-4">
      {session.mode === "mock" ? <>
        <p className="text-sm text-muted">Demo identities only. Box, AWS and reviewer actions are simulated in this mode.</p>
        <div className="flex gap-3"><button disabled={busy} onClick={() => signIn("author")} className="rounded-lg bg-ink text-white px-4 py-2">Demo author</button><button disabled={busy} onClick={() => signIn("reviewer")} className="rounded-lg border hairline px-4 py-2">Demo reviewer</button></div>
      </> : <>
        <p className="text-sm text-muted">Sign in with your own Box identity. The server keeps OAuth tokens; the widget receives only a scoped Keel session.</p>
        <a href="/api/auth/box/start" className="inline-block rounded-lg bg-ink text-white px-4 py-2">Sign in with Box</a>
        {!session.oauthConfigured && <p className="text-sm text-muted">The server operator must first configure Box OAuth credentials and the callback URL.</p>}
      </>}
    </div> : <>
      <div className="rounded-xl border hairline bg-panel p-6 space-y-4">
        <p><strong>{session.user.name}</strong> <span className="text-sm text-muted">/ {session.mode === "mock" ? "demo identity" : session.user.login}</span></p>
        <button disabled={busy} onClick={connect} className="rounded-lg bg-ink text-white px-4 py-2">Create desktop connection</button>
        {link && <a href={link} className="block text-blue-700 underline">Open this project in Keel</a>}
        <button className="block text-sm text-muted underline" onClick={async () => { try { await request("/api/auth/session", { method: "DELETE" }); setLink(""); await refresh(); refreshConfig(); } catch (error) { setError(String(error)); } }}>Sign out</button>
      </div>
      <div className="rounded-xl border hairline bg-panel p-6 space-y-4" onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); if (!busy) void upload(event.dataTransfer.files); }}>
        <h2 className="font-medium">Drop a document to start review</h2>
        <p className="text-sm text-muted">{session.mode === "mock" ? "For the fixture, upload the supplied architecture-v3.md content named architecture.md. The real engine runs against mock adapters." : "Files upload to Box with your user permissions. The server's Box account and AWS credentials run the evaluation."}</p>
        <input aria-label="Upload project documents" type="file" multiple disabled={busy} onChange={event => { void upload(event.target.files); event.target.value = ""; }} />
        <p className="text-xs text-muted">Up to 20 files / 16 MiB. Folder batches use unique flat filenames. Uploading never grants verification.</p>
      </div>
      {message && <p role="status" className="text-sm">{message}</p>}
      <Link href="/" className="inline-block underline">Open project, trace and evidence</Link>
    </>}
  </section>;
}
