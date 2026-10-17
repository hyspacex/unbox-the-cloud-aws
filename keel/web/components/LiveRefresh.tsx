"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

// Polls a cheap state fingerprint and refreshes server components when it changes.
export function LiveRefresh({ url, interval = 900 }: { url: string; interval?: number }) {
  const router = useRouter();
  const last = useRef<string | null>(null);
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const res = await fetch(url, { cache: "no-store" });
        const text = await res.text();
        if (last.current !== null && text !== last.current) router.refresh();
        last.current = text;
      } catch {}
      if (alive) setTimeout(tick, interval);
    };
    tick();
    return () => { alive = false; };
  }, [url, interval, router]);
  return null;
}
