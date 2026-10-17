"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { connectFolder } from "@/app/actions";

export function ConnectFolder({ folders }: { folders: { id: string; name: string }[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="grid2">
      {folders.map((f) => (
        <div key={f.id} className="card row" style={{ justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 600, color: "var(--ink)" }}>{f.name}</div>
            <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>Shared with Keel · <span className="mono">{f.id}</span></div>
          </div>
          <button
            className="btn" disabled={pending} data-testid="connect-folder"
            onClick={() => start(async () => {
              const r = await connectFolder(f.id);
              if (!r.ok) setError(r.error); else router.push(`/folders/${f.id}`);
            })}
          >{pending ? "Connecting…" : "Connect"}</button>
        </div>
      ))}
      {error && <div className="error">{error}</div>}
    </div>
  );
}
