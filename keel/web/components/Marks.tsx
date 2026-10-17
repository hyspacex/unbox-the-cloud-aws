export function CheckIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5 10 17.5 19 7" /></svg>;
}
export function AlertIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M12 6.5v7" /><circle cx="12" cy="17.6" r="0.6" fill="currentColor" /></svg>;
}
export function BellIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15L6 16Z" /><path d="M10 20.5a2 2 0 0 0 4 0" /></svg>;
}

// The dot/check used in lists, notifications and the activity feed.
export const kindTone = (kind: string) =>
  kind === "fail" ? "alert" : kind === "drift" || kind === "attention" ? "blue" : kind === "kept" ? "" : "ok";

export function KindMark({ kind }: { kind: string }) {
  const tone = kindTone(kind);
  if (tone === "ok") return <span className="glyph pass"><svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2.5 6.4 5 8.8l4.6-5.4" /></svg></span>;
  if (tone === "blue") return <span className="glyph change"><svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2.5 6h7M7 3.5 9.5 6 7 8.5" /></svg></span>;
  if (tone === "alert") return <span className="glyph fail"><svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3.3 3.3l5.4 5.4M8.7 3.3 3.3 8.7" /></svg></span>;
  return <span className="dot" style={{ background: "var(--mute-2)" }} />;
}
