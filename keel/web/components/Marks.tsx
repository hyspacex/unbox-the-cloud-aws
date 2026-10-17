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
export function KindMark({ kind }: { kind: string }) {
  if (kind === "drift" || kind === "fail" || kind === "attention") return <span className="dot" />;
  if (kind === "resolved" || kind === "clear") return <span className="glyph pass" style={{ width: 20, height: 20 }}><svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M2.5 6.4 5 8.8l4.6-5.4" /></svg></span>;
  return <span className="dot" style={{ background: "var(--ink)", boxShadow: "0 0 0 4px var(--panel)" }} />;
}
