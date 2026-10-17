/**
 * Live adapter wiring (MOCK_MODE=false): lib/box/real.ts (box-typescript-sdk-gen), lib/agent/evaluator.ts
 * (Strands on Bedrock) and lib/agent/decider.ts (Strands Decider 2B; returns null when not running).
 * Imported dynamically so mock mode never loads the Box SDK or Strands. The engine is the same in both modes.
 */
import type { BoxAdapter } from "./box/adapter";
import type { Evaluator, InputGate } from "./agent/evaluator.types";
import type { KeelConfig } from "./config";

export interface LiveAdapters {
  box: BoxAdapter;
  evaluator: Evaluator;
  gate: InputGate;
}

export async function createLiveAdapters(config: KeelConfig): Promise<LiveAdapters> {
  const [{ RealBoxAdapter }, { BedrockEvaluator }, { DeciderGate }] = await Promise.all([
    import("./box/real"),
    import("./agent/evaluator"),
    import("./agent/decider"),
  ]);
  return {
    box: new RealBoxAdapter({}),
    evaluator: new BedrockEvaluator({}),
    gate: new DeciderGate({}),
  };
}
