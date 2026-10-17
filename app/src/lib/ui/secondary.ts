import { utcDate, utcInText, utcMinute } from "./format";

export type CompactSecondary = { verb: string; name: string; rest: string[]; full: string } | null;

/**
 * "Verified by Marcus Hale, Data Governance ..., on approved-services-and-exceptions.md v1, 2026-10-08T09:05:44Z"
 * -> { verb: "Verified by", name: "Marcus Hale", rest: ["v1", "2026-10-08 09:05Z"] }.
 * Presentation only: the engine's full sentence stays available as `full` (shown on hover and on the card).
 */
export function compactSecondary(text?: string): CompactSecondary {
  if (!text) return null;
  const m = text.match(/^(Verified by|Returned by|Reviewed by) (.+?), .*? on (\S+) (v\d+|\d{6,}), (\d{4}-\d{2}-\d{2}T[\d:.]+Z)(?:; due (\S+))?/);
  if (!m) return { verb: "", name: "", rest: [utcInText(text)], full: utcInText(text) };
  const rest = [m[4], utcMinute(m[5])];
  if (m[6]) rest.push(`due ${utcDate(m[6])}`);
  return { verb: m[1], name: m[2], rest, full: utcInText(text) };
}
