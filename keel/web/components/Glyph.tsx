export type Status = "pass" | "fail" | "unknown" | "running";

export function Glyph({ status, size }: { status: Status; size?: "lg" }) {
  const cls = `glyph ${status}${size ? ` ${size}` : ""}`;
  if (status === "running") return <span className={cls} aria-label="running" />;
  return (
    <span className={cls} aria-label={status === "pass" ? "passing" : status === "fail" ? "failing" : "not evaluated"}>
      {status === "pass" && (
        <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M2.5 6.4 5 8.8l4.6-5.4" /></svg>
      )}
      {status === "fail" && (
        <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M3.3 3.3l5.4 5.4M8.7 3.3 3.3 8.7" /></svg>
      )}
      {status === "unknown" && (
        <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M3.2 6h5.6" /></svg>
      )}
    </span>
  );
}

export function initials(name?: string | null) {
  if (!name) return "·";
  return name.split(/\s+/).map((p) => p.replace(/[^A-Za-z]/g, "")[0] ?? "").join("").slice(0, 2).toUpperCase();
}
