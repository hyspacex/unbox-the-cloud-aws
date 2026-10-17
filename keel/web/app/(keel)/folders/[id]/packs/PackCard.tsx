"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setPack } from "@/app/actions";

export type CatalogPack = {
  id: string; version: string; versions: string[]; name: string; publisher: string; summary: string; license: string;
  verified: boolean; private: boolean; license_required: boolean; tags: string[]; rules: { id: string; title: string }[];
};

export function PackCard({ folderId, pack, installedVersion }: { folderId: string; pack: CatalogPack; installedVersion: string | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const act = (version: string | null) => start(async () => {
    const r = await setPack(folderId, pack.id, version);
    if (!r.ok) setError(r.error);
    else router.push(`/folders/${folderId}`);
  });
  const badge = pack.private ? "Org library" : pack.verified ? "Verified publisher" : pack.license_required ? "Licence required" : "Community";
  return (
    <div className={`card pack${installedVersion ? " installed" : ""}${pack.license_required ? " locked" : ""}`} data-testid={`pack-${pack.id}`}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <span className="pill soft">{badge}</span>
        <span className="mono muted">{pack.license_required ? pack.version : `v${pack.version}`}</span>
      </div>
      <div>
        <div className="name">{pack.name}</div>
        <div className="pub">{pack.publisher}</div>
      </div>
      <div className="sum">{pack.summary}</div>
      {open && pack.rules.length > 0 && (
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13.5, color: "var(--ink-3)", display: "grid", gap: 4 }}>
          {pack.rules.map((r) => <li key={r.id}><span className="mono muted">{r.id}</span> {r.title}</li>)}
        </ul>
      )}
      <div className="muted" style={{ fontSize: 12 }}>{pack.license}</div>
      <div className="foot">
        {pack.rules.length > 0
          ? <button className="linkish" style={{ background: "none", border: 0, padding: 0, cursor: "pointer" }} onClick={() => setOpen(!open)}>{pack.rules.length} rules {open ? "▴" : "▾"}</button>
          : <span className="muted" style={{ fontSize: 13 }}>Bring your organisation’s licensed text</span>}
        {pack.license_required ? (
          <button className="btn ghost small" disabled>Unavailable</button>
        ) : installedVersion ? (
          <div className="row">
            <span className="pill solid">Installed · {installedVersion}</span>
            <button className="btn ghost small" disabled={pending} onClick={() => act(null)}>Remove</button>
          </div>
        ) : (
          <button className="btn small" disabled={pending} onClick={() => act(pack.version)} data-testid={`install-${pack.id}`}>{pending ? "Installing…" : "Install"}</button>
        )}
      </div>
      {error && <div className="error">{error}</div>}
    </div>
  );
}
