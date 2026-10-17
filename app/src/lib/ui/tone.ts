import type { DisplayedStatus, TraceSource, ActorType } from "@/lib/types";

export type ToneClass = "tone-amber" | "tone-blue" | "tone-grey" | "tone-green" | "tone-teal" | "tone-red";

/**
 * Visual tone for a displayed status. The engine decides the status and its tone;
 * the UI only distinguishes "Verified, holds" (a prior verification that still holds)
 * with a muted teal-grey so it never reads as the green reserved for a current human Verified.
 */
export function toneClass(s: Pick<DisplayedStatus, "tone" | "kind">): ToneClass {
  if (s.kind === "verified_holds") return "tone-teal";
  // Not evaluated is the one failure state; it reads red whatever tone the engine sent.
  if (s.kind === "not_evaluated") return "tone-red";
  if (s.tone === "green" && s.kind !== "verified") return "tone-teal";
  return `tone-${s.tone}` as ToneClass;
}

export const SOURCE_META: Record<TraceSource, { label: string; color: string }> = {
  box: { label: "Box", color: "var(--src-box)" },
  boxai: { label: "Box AI", color: "var(--src-boxai)" },
  agent: { label: "Bedrock agent", color: "var(--src-agent)" },
  decider: { label: "Decider", color: "var(--src-decider)" },
  app: { label: "Application code", color: "var(--src-app)" },
  human: { label: "Human", color: "var(--src-human)" },
};

export const LEGEND_SOURCES: TraceSource[] = ["box", "boxai", "agent", "decider", "app"];

export function actorColor(t?: ActorType | string): string {
  switch (t) {
    case "human":
      return "var(--src-human)";
    case "agent":
      return "var(--src-agent)";
    case "gate":
      return "var(--src-decider)";
    case "boxai":
      return "var(--src-boxai)";
    default:
      return "var(--src-app)";
  }
}
