import type { DisplayedStatus, TraceSource, ActorType } from "@/lib/types";

export type ToneClass = "tone-amber" | "tone-blue" | "tone-grey" | "tone-green" | "tone-teal" | "tone-red";

const TONES: Record<string, ToneClass> = {
  amber: "tone-amber",
  blue: "tone-blue",
  grey: "tone-grey",
  green: "tone-green",
  teal: "tone-teal",
  red: "tone-red",
};

/**
 * Visual tone for a displayed status: the tone the API supplied, mapped directly to styling.
 * Semantic distinctions (for example teal for "Verified, holds") live in the display contract.
 */
export function toneClass(s: Pick<DisplayedStatus, "tone">): ToneClass {
  return TONES[s.tone] ?? "tone-grey";
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
