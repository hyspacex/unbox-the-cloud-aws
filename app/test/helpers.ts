/** Test harness: an in-memory store, the mock Box on its state, the mock evaluator and gate, the real engine. */
import { loadConfig, type KeelConfig } from "../src/lib/config";
import { fixture } from "../src/lib/fixture";
import { createMemoryStore, type Store } from "../src/lib/store";
import { MockBoxAdapter } from "../src/lib/box/mock";
import { MockEvaluator } from "../src/lib/agent/mock-evaluator";
import { AbsentInputGate, MockInputGate } from "../src/lib/agent/mock-gate";
import { runReview, type PipelineResult } from "../src/lib/engine/pipeline";
import { buildRows } from "../src/lib/engine/state";
import { countLine } from "../src/lib/engine/display";
import { ingestTaskResponse, type IngestResult } from "../src/lib/engine/disposition";
import { playScenario } from "../src/lib/service";
import type { Evaluator, InputGate } from "../src/lib/agent/evaluator.types";
import type { BoxIdentity, BoxResolutionState, TraceStep } from "../src/lib/types";

export const DANA_REASON = "Encrypted is stated; the key model and rotation are not. IS-STD-014 §5.1 requires the KMS CMK statement restored.";
export const DANA_22 = "Recovery targets present in runbook §3; binding updated. I attest the cited evidence meets the requirement.";
export const FIXED_NOW = new Date("2026-10-17T15:33:54Z");

export function harness(o: { gate?: "mock" | "absent"; evaluator?: Evaluator; gateImpl?: InputGate } = {}) {
  const store: Store = createMemoryStore("mock");
  const config: KeelConfig = { ...loadConfig(), mockTimeScale: 0 };
  const box = new MockBoxAdapter(() => store.data.mock_box!, () => {}, 0);
  const profile = fixture.profile();
  const evaluator =
    o.evaluator ?? new MockEvaluator({ modelId: config.modelId, inferenceProfile: config.inferenceProfile, promptVersion: config.promptVersion, promptHash: config.mockPromptHash, timeScale: 0 });
  const gate = o.gateImpl ?? (o.gate === "absent" ? new AbsentInputGate() : new MockInputGate(config.gateInjectionThreshold, 0));
  let n = 0;
  const h = {
    store,
    config,
    box,
    profile,
    evaluator,
    gate,
    /** Play a scenario upload (or none) and run the review transaction. */
    async run(scenario?: string, ev: Evaluator = evaluator): Promise<PipelineResult> {
      if (scenario) playScenario(box, scenario);
      const runId = `test-run-${++n}`;
      const steps: TraceStep[] = [];
      store.data.runs[runId] = { run_id: runId, mode_label: "Mock", snapshot_id: "", started_at: "", total_duration_ms: 0, model_id: config.modelId, inference_profile: config.inferenceProfile, mrm_model_id: config.mrmModelId, steps, done: false, status: "running", compressed_timing: false, timing_label: "test", gate: { ran: false, label: "" }, search_tool: { label: "", fallback: false }, box_ai_asks: [] };
      const onStep = (st: TraceStep) => {
        const i = steps.findIndex((x) => x.seq === st.seq);
        if (i >= 0) steps[i] = st;
        else steps.push(st);
      };
      const r = await runReview({ box, evaluator: ev, gate, store, profile, config, runId, scenario, onStep });
      store.data.runs[runId].done = true;
      return r;
    },
    rows(snapshotId = store.data.current_snapshot_id!) {
      return buildRows(store, profile, snapshotId);
    },
    row(controlId: string) {
      return h.rows().find((r) => r.control_id === controlId)!;
    },
    countLine() {
      const s = store.data.current_snapshot_id!;
      return countLine(h.rows(s), s);
    },
    openTask(controlId: string) {
      return [...store.data.tasks].reverse().find((t) => t.control_id === controlId && t.status === "open" && (t.kind ?? "reviewer") === "reviewer");
    },
    /** Respond in the mock Box and ingest through the handler, as the live poller would. */
    async respond(
      controlId: string,
      resolution_state: BoxResolutionState,
      message: string,
      opts: { as?: BoxIdentity; decision_snapshot_id?: string; completed_at?: string; now?: Date; replay?: boolean; taskId?: string } = {},
    ): Promise<IngestResult> {
      const t = (opts.taskId ? store.data.tasks.find((x) => x.task_id === opts.taskId) : undefined) ?? h.openTask(controlId) ?? [...store.data.tasks].reverse().find((x) => x.control_id === controlId && (x.kind ?? "reviewer") === "reviewer")!;
      if (!opts.replay) box.resolveAssignment(t.assignment_id, { resolution_state, message, as: opts.as ?? box.directoryLookup(config.reviewer.box_user_id), completed_at: opts.completed_at });
      const view = (await box.listTaskAssignments(t.task_id)).find((v) => v.assignment_id === t.assignment_id)!;
      return ingestTaskResponse(
        { store, box, profile, config, now: () => opts.now ?? FIXED_NOW },
        { view, mapping: store.data.task_mappings[t.assignment_id], decision_snapshot_id: opts.decision_snapshot_id },
      );
    },
    eventsOf(type: string, snapshotId?: string) {
      return store.events.filter((e) => e.event_type === type && (!snapshotId || e.snapshot_id === snapshotId));
    },
  };
  return h;
}
