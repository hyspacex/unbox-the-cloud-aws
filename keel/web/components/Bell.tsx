"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Ago } from "./Ago";
import { BellIcon, KindMark } from "./Marks";

type Note = { id: string; kind: string; title: string; text: string; by?: string | null; at: string; href: string; folder: string };

export function Bell() {
  const [data, setData] = useState<{ count: number; items: Note[] }>({ count: 0, items: [] });
  const [open, setOpen] = useState(false);
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try { setData(await (await fetch("/api/notifications", { cache: "no-store" })).json()); } catch {}
      if (alive) setTimeout(tick, 1500);
    };
    tick();
    return () => { alive = false; };
  }, []);
  return (
    <div style={{ position: "relative" }}>
      <button className="bell" onClick={() => setOpen(!open)} aria-label="Notifications" data-testid="bell">
        <BellIcon />
        {data.count > 0 && <span className="n">{data.count}</span>}
      </button>
      {open && (
        <div className="notes" onClick={() => setOpen(false)}>
          {data.items.length === 0 && <div className="muted" style={{ padding: 14, fontSize: 13.5 }}>Nothing yet.</div>}
          {data.items.map((n) => (
            <Link key={n.id} href={n.href}>
              <KindMark kind={n.kind} />
              <div>
                <div className="t">{n.title}</div>
                {n.text && <div className="s">{n.text}</div>}
                <div className="s">{n.folder}{n.by ? ` · ${n.by}` : ""} · <Ago iso={n.at} /></div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
