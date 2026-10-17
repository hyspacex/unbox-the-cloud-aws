"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { KindMark, kindTone } from "./Marks";

type State = { fp: string; running: boolean; latest: number; summary: { kind: string; title: string; text: string; by?: string | null; file?: string | null; more?: number } | null; href: string };

// Polls the folder's live state: refreshes the page when anything changes and pops a notification
// when a new run finishes.
export function FolderLive({ folderId }: { folderId: string }) {
  const router = useRouter();
  const seen = useRef<number | null>(null);
  const fp = useRef<string | null>(null);
  const [running, setRunning] = useState(false);
  const [toast, setToast] = useState<State | null>(null);
  useEffect(() => {
    let alive = true;
    let hide: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      try {
        const s = (await (await fetch(`/api/state?folder=${folderId}`, { cache: "no-store" })).json()) as State;
        setRunning(s.running);
        if (fp.current !== null && s.fp !== fp.current) router.refresh();
        fp.current = s.fp;
        if (seen.current === null) seen.current = s.latest;
        else if (s.latest > seen.current) {
          seen.current = s.latest;
          if (s.summary) {
            setToast(s);
            clearTimeout(hide);
            hide = setTimeout(() => setToast(null), 7000);
          }
        }
      } catch {}
      if (alive) setTimeout(tick, 800);
    };
    tick();
    return () => { alive = false; clearTimeout(hide); };
  }, [folderId, router]);
  const tone = toast?.summary ? kindTone(toast.summary.kind) : "";
  return (
    <>
      {running && <span className="checking" data-testid="checking"><span className="pulse" />Checking the folder…</span>}
      {toast?.summary && (
        <a href={toast.href} className={`ntoast ${tone}`} data-testid="toast" data-kind={toast.summary.kind} onClick={() => setToast(null)}>
          <KindMark kind={toast.summary.kind} />
          <div>
            <div className="t">{toast.summary.title}{toast.summary.text ? <span style={{ fontWeight: 400 }}> · {toast.summary.text}</span> : null}</div>
            {(toast.summary.by || toast.summary.file) && <div className="by">{[toast.summary.by, toast.summary.file].filter(Boolean).join(" · ")}</div>}
          </div>
          <span className="go">View</span>
        </a>
      )}
    </>
  );
}
