/**
 * Mock input gate standing in for Strands Decider 2B (spec 3 step 5). Data-driven: a small set of
 * patterns for instructions addressed to an AI agent or tool. Normal files return the fixture's
 * Decider result (injection no 0.03, evaluate_now 0.91, about 118 ms); text that addresses the
 * agent returns injection yes 0.97 and is quarantined above the configured threshold.
 * The gate never writes a status. An absent gate returns null and the trace omits the step.
 */
import type { InputGate } from "./evaluator.types";
import type { InputGateResult, SnapshotFile } from "../types";

const INJECTION_PATTERNS: RegExp[] = [
  /\bignore (all |any |the )?(previous |prior |above )?(instructions|control list|controls|rules)\b/i,
  /\b(mark|report|set|treat) (everything|every control|all controls?|all findings)\b[^.]{0,40}\b(as )?(satisfied|compliant|passed|approved|green)\b/i,
  /\b(AI|LLM|automated) (agents?|assistants?|reviewers?|models?)\b[^.]{0,80}\b(must|should|are instructed to)\b/i,
  /\b(system prompt|developer message|you are now)\b/i,
];

export function injectionScore(text: string): { hits: number; probability: number } {
  const hits = INJECTION_PATTERNS.filter((p) => p.test(text)).length;
  return { hits, probability: hits === 0 ? 0.03 : hits === 1 ? 0.88 : 0.97 };
}

const sleep = (ms: number) => (ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve());

export class MockInputGate implements InputGate {
  readonly kind = "mock" as const;
  constructor(
    private readonly threshold = 0.5,
    private readonly timeScale = 0,
  ) {}
  async gate(file: SnapshotFile, text: string): Promise<InputGateResult> {
    const t0 = Date.now();
    await sleep(118 * this.timeScale);
    const s = injectionScore(text);
    const injected = s.probability >= 0.5;
    return {
      fileId: file.fileId,
      fileName: file.fileName,
      versionId: file.versionId,
      injection: { answer: injected ? "yes" : "no", probability: s.probability },
      material_change: { answer: "evaluate_now", probability: 0.91 },
      options: ["evaluate_now", "batch", "noise"],
      latency_ms: this.timeScale > 0 ? Date.now() - t0 : 118,
      quarantined: injected && s.probability >= this.threshold,
      available: true,
    };
  }
}

/** The gate when Decider is not running: never fakes a pass. */
export class AbsentInputGate implements InputGate {
  readonly kind = "absent" as const;
  async gate(): Promise<null> {
    return null;
  }
}
