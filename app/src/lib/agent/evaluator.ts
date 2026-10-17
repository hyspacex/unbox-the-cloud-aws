/**
 * BedrockEvaluator: the single Bedrock judge (spec section 3 step 6). One Strands TypeScript Agent
 * on BedrockModel, one invocation per snapshot, three read-only tools, no write tools.
 *
 * Strands API used (@strands-agents/sdk 1.21.0, see docs/INTEGRATION.md for file:line refs):
 *   - new Agent({ model, systemPrompt, tools, printer: false })
 *   - new BedrockModel({ modelId, region, temperature, maxTokens })
 *   - tool({ name, description, inputSchema: zod, callback })
 *   - agent.invoke(prompt, { structuredOutputSchema: FindingSet, cancelSignal, limits })
 *     Structured output is registered as one more tool (strands_structured_output) in the same agent
 *     loop, so it combines with the read tools in a single run; if the model answers in plain text
 *     the SDK forces that tool on the next cycle and validates with zod, feeding validation errors
 *     back for a retry. No two-phase run is needed.
 *   - agent.addHook(BeforeModelCallEvent / AfterModelCallEvent) for model-turn timings.
 *   - result.structuredOutput, result.metrics.accumulatedUsage.outputTokens.
 *
 * Everything about the model comes from env: KEEL_INFERENCE_PROFILE (the Bedrock modelId sent),
 * KEEL_MODEL_ID (the foundation model id recorded), KEEL_MRM_MODEL_ID, KEEL_PROMPT_VERSION, AWS_REGION.
 */
import { z } from "zod";
import type { Model } from "@strands-agents/sdk";
import type { TraceStep } from "../types";
import type { Evaluator, EvaluatorInput, EvaluatorResult, SearchSnapshotTool } from "./evaluator.types";
import { FindingSet } from "./schema";
import { buildUserPrompt, PROMPT_VERSION, promptHash, SYSTEM_PROMPT } from "./prompt";
import { EMITTED_STEPS } from "./search-tool";

export interface BedrockEvaluatorConfig {
  /** Sent to Bedrock as modelId: an inference profile id such as us.anthropic.claude-sonnet-4-6. */
  inferenceProfile: string;
  /** Foundation model id recorded on events, e.g. anthropic.claude-sonnet-4-6. */
  modelId: string;
  mrmModelId: string;
  region: string;
  promptVersion: string;
  maxTokens: number;
  timeoutMs: number;
  maxTurns: number;
}

export function bedrockConfigFromEnv(env: NodeJS.ProcessEnv = process.env): BedrockEvaluatorConfig {
  const s = (k: string, d: string) => (env[k] && env[k]!.trim() ? env[k]!.trim() : d);
  const n = (k: string, d: number) => (env[k] && Number.isFinite(Number(env[k])) ? Number(env[k]) : d);
  return {
    inferenceProfile: s("KEEL_INFERENCE_PROFILE", "us.anthropic.claude-sonnet-4-6"),
    modelId: s("KEEL_MODEL_ID", "anthropic.claude-sonnet-4-6"),
    mrmModelId: s("KEEL_MRM_MODEL_ID", "MRM-AI-0271"),
    region: s("AWS_REGION", s("AWS_DEFAULT_REGION", "us-east-1")),
    promptVersion: s("KEEL_PROMPT_VERSION", PROMPT_VERSION),
    maxTokens: n("KEEL_MAX_TOKENS", 16000),
    timeoutMs: n("KEEL_EVAL_TIMEOUT_MS", 180_000),
    maxTurns: n("KEEL_MAX_TURNS", 24),
  };
}

/** Stable error codes the pipeline records on evaluation_error events. */
export class EvaluatorError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "EvaluatorError";
  }
}

export function mapBedrockError(e: unknown, cfg: Pick<BedrockEvaluatorConfig, "inferenceProfile" | "region">): EvaluatorError {
  if (e instanceof EvaluatorError) return e;
  const name = (e as { name?: string })?.name ?? "";
  const msg = e instanceof Error ? e.message : String(e);
  const where = `${cfg.inferenceProfile} in ${cfg.region}`;
  if (name === "StructuredOutputError")
    return new EvaluatorError("STRUCTURED_OUTPUT_INVALID", `Model output did not match the FindingSet schema: ${msg}`, e);
  if (/CredentialsProviderError|Could not load credentials|security token|ExpiredToken|UnrecognizedClient/i.test(name + " " + msg))
    return new EvaluatorError("BEDROCK_CREDENTIALS", `No usable AWS credentials for Bedrock (${msg}). Set AWS_PROFILE or AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY/AWS_SESSION_TOKEN in app/.env.local.`, e);
  if (/AccessDenied/i.test(name + msg))
    return new EvaluatorError("BEDROCK_ACCESS_DENIED", `Bedrock denied ${where}: enable model access for Claude Sonnet 4.6 and allow bedrock:InvokeModelWithResponseStream on the inference profile (${msg}).`, e);
  if (/ResourceNotFound|model identifier is invalid|ValidationException.*model/i.test(name + msg))
    return new EvaluatorError("BEDROCK_MODEL_NOT_FOUND", `Bedrock does not know ${where}; check KEEL_INFERENCE_PROFILE and AWS_REGION (${msg}).`, e);
  if (/Throttl|TooManyRequests|ServiceQuota/i.test(name + msg)) return new EvaluatorError("BEDROCK_THROTTLED", `Bedrock throttled ${where} (${msg}).`, e);
  if (/AbortError|aborted|TimeoutError/i.test(name + msg)) return new EvaluatorError("EVALUATION_TIMEOUT", `Evaluation exceeded KEEL_EVAL_TIMEOUT_MS (${msg}).`, e);
  return new EvaluatorError("BEDROCK_ERROR", `Bedrock call failed for ${where}: ${msg}`, e);
}

const STRUCTURED_TOOL = "strands_structured_output";

/**
 * @strands-agents/sdk is ESM-only and one of its dependencies (@modelcontextprotocol/ext-tasks)
 * exports subpaths under the "import" condition only, so a CommonJS require() of the SDK fails
 * (ERR_PACKAGE_PATH_NOT_EXPORTED). tsx runs app/scripts/*.ts as CommonJS, so values are loaded
 * with a dynamic import(), which always goes through the ESM loader. Types stay static.
 */
let strands: Promise<typeof import("@strands-agents/sdk")> | null = null;
export const loadStrands = () => (strands ??= import("@strands-agents/sdk"));

export class BedrockEvaluator implements Evaluator {
  readonly kind = "bedrock" as const;
  readonly config: BedrockEvaluatorConfig;
  /** Test seam: a scripted Strands Model instead of BedrockModel. Never set in app code. */
  private readonly modelOverride?: Model;

  constructor(cfg: Partial<BedrockEvaluatorConfig> = {}, opts: { model?: Model } = {}) {
    this.config = { ...bedrockConfigFromEnv(), ...cfg };
    this.modelOverride = opts.model;
  }

  /**
   * The optional fourth argument is the run's abort signal, given either as `{ signal }` (what the
   * pipeline passes) or as a bare AbortSignal. It is combined with KEEL_EVAL_TIMEOUT_MS via
   * AbortSignal.any into the Strands invoke cancelSignal; Strands derives each tool call's
   * cancelSignal from it, and search_snapshot passes that to the search tool's Box requests.
   */
  async evaluate(input: EvaluatorInput, tools: { search: SearchSnapshotTool }, onStep?: (step: TraceStep) => void, runSignal?: AbortSignal | { signal?: AbortSignal }): Promise<EvaluatorResult> {
    const opts = { signal: runSignal instanceof AbortSignal ? runSignal : runSignal?.signal };
    const cfg = this.config;
    const { Agent, AfterModelCallEvent, BedrockModel, BeforeModelCallEvent, tool } = await loadStrands();
    const t0 = Date.now();
    const trace: TraceStep[] = [];
    const record = (s: TraceStep) => {
      trace.push(s);
      if (!EMITTED_STEPS.has(s)) onStep?.(s);
      return s;
    };
    const stamp = (startedAt: number) => ({ startMs: startedAt - t0, durationMs: Date.now() - startedAt, ts: new Date(startedAt).toISOString() });
    const controlIds = new Set(input.controls.map((c) => c.id));
    const pinned = new Map(input.files.map((f) => [`${f.file.fileName}\u0000${f.file.versionId}`, f]));

    // ---- tools (read-only, snapshot-constrained) ---------------------------
    const getPriorEvidence = tool({
      name: "get_prior_evidence",
      description:
        "Return the previously verified evidence for one control: quote, file, version, section, verifier, role and time. Read-only.",
      inputSchema: z.object({ control_id: z.string().describe("A control id from the control list, e.g. SEC-ARCH-07") }),
      callback: ({ control_id }) => {
        const started = Date.now();
        const known = controlIds.has(control_id);
        const refs = known ? input.prior_evidence[control_id] ?? [] : [];
        const result = known
          ? refs.length
            ? refs.map((r) => ({
                quote: r.quote,
                fileName: r.fileName,
                versionId: r.versionId,
                versionLabel: r.versionLabel ?? null,
                section: r.section,
                paragraph: r.paragraph ?? null,
                verified_by: r.verified_by ?? null,
                verified_role: r.verified_role ?? null,
                verified_at: r.verified_at ?? null,
                verified_snapshot_id: r.verified_snapshot_id ?? null,
              }))
            : { note: `no prior verified evidence for ${control_id}` }
          : { error: `unknown control id ${control_id}; use an id from the control list` };
        const first = Array.isArray(result) ? result[0] : undefined;
        record({
          source: "agent",
          kind: "tool_call",
          tool: "get_prior_evidence",
          label: `get_prior_evidence(${control_id})`,
          ...stamp(started),
          args: { control_id },
          result: first
            ? { quote: first.quote, fileName: first.fileName, versionId: first.versionId, verified_by: first.verified_by, verified_at: first.verified_at, count: (result as unknown[]).length }
            : result,
        });
        return result;
      },
    });

    const readSnapshotFile = tool({
      name: "read_snapshot_file",
      description:
        "Re-read the pinned text of one file in this snapshot. Only fileName/versionId pairs listed in the document headers can be read; anything else is rejected.",
      inputSchema: z.object({
        fileName: z.string().describe("fileName exactly as in the document header"),
        versionId: z.string().describe("versionId exactly as in the document header"),
        control_id: z.string().optional().describe("The control id this call is for, from the control list"),
      }),
      callback: ({ fileName, versionId, control_id }) => {
        const started = Date.now();
        const hit = pinned.get(`${fileName}\u0000${versionId}`);
        const result = hit
          ? { fileName, versionId, text: hit.text }
          : { error: `rejected: ${fileName} version ${versionId} is not in snapshot ${input.snapshot.snapshot_id}` };
        record({
          source: "agent",
          kind: "tool_call",
          tool: "read_snapshot_file",
          label: hit ? `read_snapshot_file(${fileName}, ${versionId})` : `read_snapshot_file rejected: ${fileName} ${versionId} outside snapshot`,
          ...stamp(started),
          args: { fileName, versionId, ...(control_id ? { control_id } : {}) },
          result: hit ? { chars: hit.text.length } : result,
        });
        return result;
      },
    });

    const searchSnapshot = tool({
      name: "search_snapshot",
      description:
        "Box AI ask with citations over the other files of this snapshot. Code validates every citation against the pinned version text and returns only validated statements with file, version, section and exact quote.",
      inputSchema: z.object({
        query: z.string().min(2).describe("Short OR-separated key terms, e.g. 'customer-managed keys OR key rotation OR key custodians'"),
        exclude_file: z.string().optional().describe("fileName of the primary evidencing file to leave out"),
        control_id: z.string().optional().describe("The control id this call is for, from the control list"),
      }),
      callback: async ({ query, exclude_file, control_id }, context) => {
        const started = Date.now();
        // Strands' execution-scoped signal: cancelling the invocation aborts the Box AI request too.
        const res = await tools.search.search(query, exclude_file, context?.cancelSignal);
        const own = (res as { step?: TraceStep }).step;
        // Tag the step with the control so the finding card can show it as basis provenance.
        if (own && control_id) own.args = { ...(own.args ?? {}), control_id };
        record(
          own ?? {
            source: "boxai",
            kind: "tool_call",
            tool: res.fallback ? "string_search" : "box_ai_ask",
            label: res.label,
            ...stamp(started),
            args: { agent_tool: "search_snapshot", query, exclude_file: exclude_file ?? null, ...(control_id ? { control_id } : {}), snapshot_id: input.snapshot.snapshot_id, mode: res.fallback ? "string_search" : "multiple_item_qa", include_citations: !res.fallback },
            result: { cited_statements: res.citations.length, citations: res.citations },
          },
        );
        return {
          label: res.label,
          fallback: res.fallback,
          cited_statements: res.citations.length,
          statements: res.citations.map((c) => ({ fileName: c.fileName, versionId: c.versionId, section: c.section, paragraph: c.paragraph ?? null, quote: c.quote })),
        };
      },
    });

    // ---- agent -----------------------------------------------------------------
    const model =
      this.modelOverride ??
      new BedrockModel({
      modelId: cfg.inferenceProfile,
      region: cfg.region,
      temperature: 0,
      maxTokens: cfg.maxTokens,
    });
    const agent = new Agent({
      model,
      systemPrompt: SYSTEM_PROMPT,
      tools: [getPriorEvidence, readSnapshotFile, searchSnapshot],
      printer: false,
    });

    let turn = 0;
    let turnStart = 0;
    agent.addHook(BeforeModelCallEvent, () => {
      turnStart = Date.now();
    });
    agent.addHook(AfterModelCallEvent, (ev) => {
      turn += 1;
      const content = ev.stopData?.message?.content ?? [];
      const toolNames = content.filter((b) => b.type === "toolUseBlock").map((b) => (b as { name: string }).name);
      const writing = toolNames.includes(STRUCTURED_TOOL);
      const others = toolNames.filter((n) => n !== STRUCTURED_TOOL);
      const label = writing
        ? `Writing ${input.controls.length} typed findings with per-clause support`
        : turn === 1
          ? `Reading requirement, required clauses, applicability and evidence for ${input.controls.length} controls with ${input.files.length} file texts and diff hints${others.length ? `; requested ${others.length} tool call${others.length === 1 ? "" : "s"}` : ""}`
          : `Model turn ${turn}${others.length ? `: requested ${others.join(", ")}` : ""}${ev.error ? ` (error: ${ev.error.message})` : ""}`;
      record({
        source: "agent",
        kind: "model_turn",
        label,
        ...stamp(turnStart || Date.now()),
        model_id: cfg.modelId,
        inference_profile: cfg.inferenceProfile,
        detail: { stop_reason: ev.stopData?.stopReason ?? null, tool_uses: toolNames, attempt: ev.attemptCount },
      });
    });

    const userPrompt = buildUserPrompt(input);
    let result;
    try {
      result = await agent.invoke(userPrompt, {
        structuredOutputSchema: FindingSet,
        // Our own evaluation timeout, or the run's transaction deadline, whichever fires first.
        cancelSignal: opts.signal ? AbortSignal.any([AbortSignal.timeout(cfg.timeoutMs), opts.signal]) : AbortSignal.timeout(cfg.timeoutMs),
        limits: { turns: cfg.maxTurns },
      });
    } catch (e) {
      if (opts.signal?.aborted) throw new EvaluatorError("RUN_TIMEOUT", `Evaluation aborted by the run's transaction deadline: ${e instanceof Error ? e.message : String(e)}`, e);
      throw mapBedrockError(e, cfg);
    }
    if (result.stopReason === "cancelled")
      throw opts.signal?.aborted
        ? new EvaluatorError("RUN_TIMEOUT", `Evaluation cancelled after ${Date.now() - t0} ms by the run's transaction deadline (KEEL_TRANSACTION_TIMEOUT_MS).`)
        : new EvaluatorError("EVALUATION_TIMEOUT", `Evaluation cancelled after ${Date.now() - t0} ms (KEEL_EVAL_TIMEOUT_MS=${cfg.timeoutMs}).`);

    const parsed = FindingSet.safeParse(result.structuredOutput);
    if (!parsed.success)
      throw new EvaluatorError("STRUCTURED_OUTPUT_INVALID", `No FindingSet in the model result (stopReason ${result.stopReason}): ${parsed.error.message}`);

    return {
      output: parsed.data,
      trace,
      model_id: cfg.modelId,
      inference_profile: cfg.inferenceProfile,
      prompt_version: cfg.promptVersion,
      prompt_hash: promptHash,
      output_tokens: result.metrics?.accumulatedUsage?.outputTokens,
      elapsed_ms: Date.now() - t0,
    };
  }
}

/**
 * Tiny live probe for the integration gate: one Strands Agent call to the configured inference
 * profile. Returns the model id and latency. No document text is sent.
 */
export async function probeBedrock(cfg: Partial<BedrockEvaluatorConfig> & { probeTimeoutMs?: number } = {}, opts: { model?: Model } = {}): Promise<{ ok: true; modelId: string; inferenceProfile: string; latencyMs: number; reply: string } | { ok: false; code: string; message: string }> {
  const c: BedrockEvaluatorConfig & { probeTimeoutMs?: number } = { ...bedrockConfigFromEnv(), ...cfg };
  const started = Date.now();
  try {
    const { Agent, BedrockModel } = await loadStrands();
    const agent = new Agent({
      model: opts.model ?? new BedrockModel({ modelId: c.inferenceProfile, region: c.region, temperature: 0, maxTokens: 32 }),
      systemPrompt: "Reply with the single word: ready",
      printer: false,
    });
    const r = await agent.invoke("Integration gate probe.", { cancelSignal: AbortSignal.timeout(c.probeTimeoutMs ?? 30_000) });
    const reply = r.lastMessage.content
      .map((b) => (b.type === "textBlock" ? (b as { text: string }).text : ""))
      .join("")
      .trim();
    const latencyMs = Date.now() - started;
    // Strands returns cancellation as a result, not an exception: never count it as ready.
    if (r.stopReason !== "endTurn")
      return { ok: false, code: r.stopReason === "cancelled" ? "EVALUATION_TIMEOUT" : "BEDROCK_PROBE_ABNORMAL", message: `probe ended with stopReason ${r.stopReason} after ${latencyMs} ms (reply ${JSON.stringify(reply.slice(0, 80))})` };
    if (reply.toLowerCase().replace(/[^a-z]/g, "") !== "ready")
      return { ok: false, code: "BEDROCK_PROBE_UNEXPECTED", message: `expected the reply "ready", got ${JSON.stringify(reply.slice(0, 80))}` };
    return { ok: true, modelId: c.modelId, inferenceProfile: c.inferenceProfile, latencyMs, reply };
  } catch (e) {
    const m = mapBedrockError(e, c);
    return { ok: false, code: m.code, message: m.message };
  }
}
