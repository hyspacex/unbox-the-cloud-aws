"use client";
import { useSyncExternalStore } from "react";

function fmt(iso: string, now: number) {
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (s < 10) return "just now";
  if (s < 60) return `${s} sec ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hr ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

const subscribe = (cb: () => void) => { const t = setInterval(cb, 5000); return () => clearInterval(t); };
const clientNow = () => Math.floor(Date.now() / 5000) * 5000;
const serverNow = () => null;

export function Ago({ iso }: { iso?: string | null }) {
  const now = useSyncExternalStore(subscribe, clientNow, serverNow);
  if (!iso) return null;
  return <time dateTime={iso} title={iso}>{now === null ? new Date(iso).toISOString().slice(11, 16) + " UTC" : fmt(iso, now)}</time>;
}
