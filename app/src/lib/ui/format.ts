/** Formatting helpers. Every value shown comes from the API; these only change presentation. */

/** "2026-10-17T15:30:04Z" -> "2026-10-17 15:30:04Z" (UTC, always explicit). */
export function utc(ts?: string | null): string {
  if (!ts) return "";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  return d.toISOString().replace("T", " ").replace(/\.\d{3}Z$/, "Z");
}

/** Time of day only, UTC: "15:30:04Z". */
export function utcTime(ts?: string | null): string {
  const s = utc(ts);
  return s.includes(" ") ? s.split(" ")[1] : s;
}

/** Date only, UTC: "2026-10-23". */
export function utcDate(ts?: string | null): string {
  const s = utc(ts);
  return s.split(" ")[0];
}

/** Add ms to an ISO start time and return ISO. */
export function addMs(startIso: string, ms: number): string {
  const d = new Date(startIso);
  if (Number.isNaN(d.getTime())) return startIso;
  return new Date(d.getTime() + ms).toISOString();
}

export function ms(n?: number | null): string {
  if (n == null) return "";
  if (n < 1000) return `${Math.round(n)} ms`;
  return `${(n / 1000).toFixed(n < 10000 ? 2 : 1)} s`;
}

/** "sha256:abcdef..." -> "sha256:abcdef12…9f3e" */
export function shortHash(h?: string | null, head = 8, tail = 4): string {
  if (!h) return "";
  const [algo, hex] = h.includes(":") ? h.split(":", 2) : ["", h];
  if (hex.length <= head + tail + 1) return h;
  return `${algo ? algo + ":" : ""}${hex.slice(0, head)}…${hex.slice(-tail)}`;
}

export function versionLabel(v?: { versionLabel?: string; versionId?: string } | null): string {
  if (!v) return "";
  return v.versionLabel ?? (v.versionId ? `version ${v.versionId}` : "");
}

/** "SEC-ARCH-07" stays; "evidence_weakened" -> "evidence weakened" for prose contexts. */
export function words(code?: string | null): string {
  return code ? code.replace(/_/g, " ") : "";
}

/** Value for <input type="datetime-local"> from an ISO string, in UTC. */
export function toLocalInput(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 16);
}

/** Back from a datetime-local value interpreted as UTC. */
export function fromLocalInput(v: string): string {
  if (!v) return "";
  return new Date(v + ":00Z").toISOString().replace(/\.\d{3}Z$/, "Z");
}

export function plural(n: number, one: string, many = one + "s"): string {
  return `${n} ${n === 1 ? one : many}`;
}
