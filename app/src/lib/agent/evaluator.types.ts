/**
 * Evaluator interface shared by the real Strands/Bedrock evaluator and the mock evaluator.
 * The pipeline calls `evaluate` once per snapshot and treats the result as untrusted model
 * output until the engine validates it.
 */
import type { Control, ControlProfile, PriorEvidenceRef, Snapshot, SnapshotFile, TraceStep } from "../types";
import type { FindingSet } from "./schema";

export interface EvaluatorFileText {
  file: SnapshotFile;
  text: string; // pinned version text
}

export interface DiffHint {
  control_id: string;
  file: string;
  status: "present" | "weakened" | "removed";
  quote?: string;
  hint_terms_in_prior_quote?: string[];
  hint_terms_still_in_file?: string[];
  note?: string;
}

export interface EvaluatorInput {
  snapshot: Snapshot;
  profile: Pick<ControlProfile, "profile_id" | "profile_version" | "attestation_phrase">;
  controls: Pick<Control, "id" | "title" | "requirement" | "required_clauses" | "applicability" | "evidence">[];
  files: EvaluatorFileText[]; // readable files only; coverage is handled by the engine
  prior_evidence: Record<string, PriorEvidenceRef[]>; // control id -> prior evidence with verification history
  diff_hints: DiffHint[];
  /** Mock only: which canned scenario to play. */
  scenario?: string;
}

export interface SearchSnapshotTool {
  /** Box AI ask over the other readable files with citations validated by code; string-search fallback. */
  /** `signal` (optional, additive): aborts the Box AI request when the agent's tool call is cancelled. */
  search(query: string, excludeFileName?: string, signal?: AbortSignal): Promise<{
    label: string; // "Box AI ask over 4 files, 1 cited statement in runbook.md"
    fallback: boolean;
    citations: { fileName: string; versionId: string; section: string; paragraph?: number; page?: number; quote: string; validated_against_pinned_text: boolean }[];
  }>;
}

export interface EvaluatorResult {
  /** Raw, schema-valid model output. Not yet validated against the profile or pinned text. */
  output: FindingSet;
  trace: TraceStep[]; // model turns and tool calls with real timings
  model_id: string;
  inference_profile: string;
  prompt_version: string;
  prompt_hash: string;
  output_tokens?: number;
  elapsed_ms: number;
}

export interface Evaluator {
  readonly kind: "bedrock" | "mock";
  /** opts.signal: the review transaction's deadline; evaluators abort the model call when it fires. */
  evaluate(input: EvaluatorInput, tools: { search: SearchSnapshotTool }, onStep?: (step: TraceStep) => void, opts?: { signal?: AbortSignal }): Promise<EvaluatorResult>;
}

export interface InputGate {
  readonly kind: "decider" | "mock" | "absent";
  /** Returns null when the gate is not running; the trace then omits the step and the UI says so. */
  gate(file: SnapshotFile, text: string): Promise<import("../types").InputGateResult | null>;
}
