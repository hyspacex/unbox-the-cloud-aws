"use client";

/**
 * Small shared pieces for the Keel panel: colour tokens (contract "Visual tokens"), the one chip grammar
 * ("Severity Critical" / "Tier High"), icons, and presentation-only text helpers. Nothing here decides a
 * status or composes a count: every label shown comes from the engine.
 */
import type { ControlRow, FindingCard } from "@/lib/types";
import { ApiError } from "@/lib/client";

export const C = {
  boxBlue: "#0061D5",
  boxBlueHover: "#0053B8",
  text: "#222222",
  secondary: "#767676",
  border: "#E8E8E8",
  hover: "#F4F6FA",
  selected: "#E8F0FE",
  amber: "#B45309",
  amberBg: "#FEF6E7",
  blue: "#1D4ED8",
  blueBg: "#EEF3FE",
  green: "#15803D",
  greenBg: "#ECF8F0",
  grey: "#6B7280",
  greyBg: "#F4F5F7",
  red: "#B42318",
} as const;

export const DUR = {
  panel: 0.32,
  level: 0.24,
  inline: 0.24,
} as const;
export const EASE_OUT: [number, number, number, number] = [0.22, 1, 0.36, 1];

/** One chip grammar everywhere: a muted label word, then the value. */
export function LabelChip({ label, value, title }: { label: "Severity" | "Tier"; value: string; title?: string }) {
  return (
    <span
      className="inline-flex h-[20px] flex-none items-center gap-1 whitespace-nowrap rounded-[4px] border px-1.5 text-[11.5px] leading-none"
      style={{ borderColor: C.border, color: C.text }}
      title={title ?? (label === "Severity" ? "Severity: control tier by application tier" : "Control tier")}
    >
      <span style={{ color: C.secondary }}>{label}</span>
      <span className="font-bold">{value}</span>
    </span>
  );
}

/**
 * One chip per row for the row's whole life. The engine clears row.severity once a decision is recorded, so the
 * finding's severity (stable on the finding) is preferred, then the row's, then a remembered value, then the tier.
 */
const SEEN_SEVERITY = new Map<string, string>();
export function stableSeverity(row: ControlRow, findingSeverity?: string | null, snapshotId?: string): string | undefined {
  const key = `${snapshotId ?? ""}|${row.control_id}`;
  const sev = findingSeverity ?? row.severity ?? SEEN_SEVERITY.get(key);
  if (sev) SEEN_SEVERITY.set(key, sev);
  return sev ?? undefined;
}
export function RowChip({ row, severity }: { row: ControlRow; severity?: string }) {
  return severity ? <LabelChip label="Severity" value={severity} /> : <LabelChip label="Tier" value={row.tier} />;
}

/** Tone colour of a displayed status or receipt. Green appears only where the engine says green. */
export function toneColor(tone?: string): string {
  switch (tone) {
    case "amber":
      return C.amber;
    case "blue":
      return C.blue;
    case "green":
      return C.green;
    case "red":
      return C.red;
    default:
      return C.grey;
  }
}

/** Truncate a sentence to at most n words (presentation only; the full text goes in the title). */
export function clampWords(text: string, n = 10): string {
  const w = text.trim().split(/\s+/);
  if (w.length <= n) return text.trim();
  return w.slice(0, n).join(" ").replace(/[,;:.]$/, "") + "…";
}

/** "2026-10-23T17:00:00Z" -> "Oct 23" (prose dates, design section 3). */
export function prose(ts?: string | null): string {
  if (!ts) return "";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

/** "§4.3 Data protection at rest" -> "§4.3". */
export function shortSection(s?: string | null): string {
  if (!s) return "";
  const m = s.match(/^(§[\d.]+)/);
  return m ? m[1] : s;
}

/** "J. Park (Eng)" -> "J. Park". */
export function personName(s?: string | null): string {
  return (s ?? "").replace(/\s*\([^)]*\)\s*$/, "").trim();
}

/** "sha256:9c41…e2a7" -> "9c41…e2a7". */
export function chainShort(h?: string | null): string {
  if (!h) return "";
  const hex = h.includes(":") ? h.split(":").pop() ?? h : h;
  return hex.length > 10 ? `${hex.slice(0, 4)}…${hex.slice(-4)}` : hex;
}

export function errorText(e: unknown): string {
  if (e instanceof ApiError) {
    const b = e.body as { explanation?: string } | null;
    return b?.explanation ?? e.message;
  }
  return e instanceof Error ? e.message : String(e);
}

/** A row carries a human disposition on the current snapshot (engine kinds owned by a person). */
const HUMAN_KINDS = new Set([
  "verified",
  "returned_to_author",
  "not_applicable",
  "exception_approved",
  "exception_expired",
  "exception_requested",
  "compensating_control",
  "superseded",
]);
export function isRecordedRow(row: ControlRow, receipt?: FindingCard["receipt"]): boolean {
  // The engine's flag is authoritative when present (lane E): an acknowledgment keeps kind "acknowledge".
  if (typeof row.decision_recorded === "boolean") return row.decision_recorded;
  return Boolean(receipt) || HUMAN_KINDS.has(row.status.kind);
}

export const isDecisionKind = (k: string) => k.startsWith("needs_review") || k === "not_evaluated" || k === "pending_review";

export function CheckIcon({ size = 14, color = "currentColor" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" aria-hidden className="flex-none">
      <path d="M3 7.4 5.8 10.2 11 4" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Chevron({ dir = "right", size = 14 }: { dir?: "right" | "left" | "down" | "up"; size?: number }) {
  const rot = { right: 0, down: 90, left: 180, up: 270 }[dir];
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" aria-hidden className="flex-none" style={{ transform: `rotate(${rot}deg)`, transition: "transform 200ms" }}>
      <path d="M5 2.5 9.5 7 5 11.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.08em]" style={{ color: C.secondary }}>
      {children}
    </h3>
  );
}

/** Box-style buttons. */
export const btnPrimary =
  "inline-flex h-9 items-center justify-center gap-1.5 rounded-[4px] px-4 text-[14px] font-bold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-40 bg-[#0061D5] hover:bg-[#0053B8] disabled:hover:bg-[#0061D5]";
export const btnSecondary =
  "inline-flex h-9 items-center justify-center gap-1.5 rounded-[4px] border px-4 text-[14px] font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-40 border-[#C9C9C9] bg-white text-[#222222] hover:bg-[#F4F6FA] disabled:hover:bg-white";
export const btnSmall =
  "inline-flex h-7 items-center justify-center gap-1 rounded-[4px] border px-2.5 text-[12.5px] font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-40 border-[#C9C9C9] bg-white text-[#222222] hover:bg-[#F4F6FA]";
export const fieldClass =
  "w-full rounded-[4px] border border-[#C9C9C9] bg-white px-2.5 py-2 text-[13.5px] leading-[1.45] text-[#222222] placeholder:text-[#9A9A9A] focus:border-[#0061D5] focus:outline-none";
