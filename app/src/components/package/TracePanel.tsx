"use client";

import { AnimatePresence, motion } from "motion/react";
import type { TraceSource, TraceStep } from "@/lib/types";
import { substepsOf } from "@/lib/client";
import { addMs, ms, utcTime } from "@/lib/ui/format";
import { SourceLegend, SourceSwatch, SourceTag } from "@/components/ui/SourceTag";
import { Caret, Disclosure } from "@/components/ui/Disclosure";
import { T_BASE } from "@/lib/ui/motion";

export type TraceMeta = {
  run_id?: string;
  mode_label?: "Live" | "Replay" | "Mock";
  started_at?: string;
  total_duration_ms?: number;
  snapshot_id?: string;
  prior_snapshot_id?: string;
  model_id?: string;
  inference_profile?: string;
  compressed_timing?: boolean;
};

/** Source for a substep: Box AI tool calls are tagged Box AI even inside the agent loop. */
function sourceOf(s: TraceStep): TraceSource {
  if (s.tool === "box_ai_ask" || s.tool === "box_ai_text_gen" || /^Box AI/.test(s.label)) return "boxai";
  return s.source;
}

function coverageText(steps: TraceStep[]): string | null {
  const s = steps.find((x) => x.kind === "texts_fetched");
  if (!s) return null;
  const d = s.detail as { coverage?: unknown } | undefined;
  const c = d?.coverage;
  if (typeof c === "string") return `${c} files readable`;
  if (c && typeof c === "object" && "readable" in c && "total" in c) {
    const cc = c as { readable: number; total: number };
    return `${cc.readable} of ${cc.total} files readable`;
  }
  return null;
}

/** One-line summary shown once a run has finished; expands back into the full panel. */
export function TraceSummary({
  steps,
  meta,
  gate,
  elapsedMs,
  onExpand,
}: {
  steps: TraceStep[];
  meta: TraceMeta;
  gate?: { ran: boolean; label: string } | null;
  elapsedMs?: number | null;
  onExpand: () => void;
}) {
  const last = steps[steps.length - 1];
  const total = elapsedMs ?? meta.total_duration_ms ?? (last ? last.startMs + (last.durationMs ?? 0) : undefined);
  const coverage = coverageText(steps);
  const gateStep = steps.find((s) => s.kind === "input_gate");
  const boxAi = steps.flatMap((s) => [s, ...substepsOf(s)]).filter((s) => s.tool === "box_ai_ask" || /^Box AI ask/.test(s.label)).length;
  return (
    <button
      onClick={onExpand}
      className="w-full text-left rounded-[10px] border hairline bg-panel px-4 py-2.5 hover:border-line-strong transition-colors flex flex-wrap items-center gap-x-5 gap-y-1 text-[12.5px] text-ink-2"
      aria-label="Show run trace"
    >
      <span className="inline-flex items-center gap-2 font-medium text-ink">
        <Caret open={false} /> Run trace
      </span>
      {meta.run_id ? <span className="mono text-muted">{meta.run_id}</span> : null}
      {meta.prior_snapshot_id && meta.snapshot_id ? (
        <span>
          <span className="mono">{meta.prior_snapshot_id}</span> to <span className="mono">{meta.snapshot_id}</span>
        </span>
      ) : null}
      {total != null ? (
        <span>
          elapsed <span className="mono">{ms(total)}</span>
          {meta.compressed_timing ?? meta.mode_label === "Mock" ? <span className="text-amber-ink"> (compressed)</span> : null}
        </span>
      ) : null}
      <span>{steps.length} steps</span>
      {boxAi ? <span>{boxAi} Box AI asks</span> : null}
      {coverage ? <span>coverage {coverage}</span> : null}
      <span>
        input gate{" "}
        {gateStep ? (typeof gateStep.detail === "string" ? gateStep.detail.split(" · ").slice(0, 2).join(" · ") : "ran") : gate && !gate.ran ? "omitted: Decider not running" : gate?.label ?? "omitted: Decider not running"}
      </span>
    </button>
  );
}

export function TracePanel({
  steps,
  meta,
  running,
  gate,
  elapsedMs,
  onCollapse,
}: {
  steps: TraceStep[];
  meta: TraceMeta;
  running: boolean;
  gate?: { ran: boolean; label: string } | null;
  elapsedMs?: number | null;
  onCollapse?: () => void;
}) {
  const gateStep = steps.find((s) => s.kind === "input_gate");
  const coverage = coverageText(steps);
  const last = steps[steps.length - 1];
  const totalShown =
    elapsedMs ?? (running ? undefined : meta.total_duration_ms ?? (last ? last.startMs + (last.durationMs ?? 0) : undefined));
  const compressed = meta.compressed_timing ?? meta.mode_label === "Mock";

  return (
    <section className="panel overflow-hidden" aria-label="Run trace">
      <header className="px-5 pt-4 pb-3 border-b hairline bg-panel-cool">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className={`h-2 w-2 rounded-full flex-none ${running ? "bg-amber-dot pulse" : "bg-[var(--grey-dot)]"}`} style={running ? { background: "var(--amber-dot)" } : undefined} />
            <h2 className="text-[15px] font-semibold text-ink">{running ? "Re-check running" : "Run trace"}</h2>
            {meta.snapshot_id ? (
              <span className="text-[12.5px] text-muted truncate">
                {meta.prior_snapshot_id ? (
                  <>
                    <span className="mono">{meta.prior_snapshot_id}</span> to{" "}
                  </>
                ) : null}
                <span className="mono text-ink-2">{meta.snapshot_id}</span>
              </span>
            ) : null}
          </div>
          <div className="flex items-center gap-2 text-[12.5px] text-muted tabular-nums whitespace-nowrap">
            {totalShown != null ? (
              <>
                elapsed <span className="mono text-ink-2">{ms(totalShown)}</span>
              </>
            ) : (
              <span className="pulse">streaming</span>
            )}
            {onCollapse && !running ? (
              <button className="btn btn-ghost btn-sm !h-6 !px-1.5" onClick={onCollapse} aria-label="Collapse trace" title="Collapse">
                <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
                  <path d="M2 2l6 6M8 2 2 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                </svg>
              </button>
            ) : null}
          </div>
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted">
          {meta.run_id ? <span className="mono">{meta.run_id}</span> : null}
          {meta.mode_label ? <span>· {meta.mode_label}</span> : null}
          {meta.started_at ? (
            <span>
              · started <span className="mono">{utcTime(meta.started_at)}</span> UTC
            </span>
          ) : null}
        </div>
        <div className="mt-2.5">
          <SourceLegend />
        </div>
        {compressed ? (
          <p className="mt-2 text-[12px] text-amber-ink">Compressed timing: the mock run replays the recorded steps faster than real time.</p>
        ) : null}
      </header>

      <ol className="px-2 py-2 max-h-[560px] overflow-y-auto scroll-quiet" aria-live="polite">
        <AnimatePresence initial={false}>
          {steps.map((s, i) => (
            <motion.li
              key={(s.seq ?? i) + s.kind}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={T_BASE}
              className="rounded-md"
            >
              {s.kind === "model_turn" || s.kind === "tool_call" || (s as TraceStep & { parent_seq?: number }).parent_seq != null ? (
                <div className="ml-[22px] border-l hairline pl-2">
                  <StepLine step={s} startedAt={meta.started_at} nested />
                </div>
              ) : (
                <StepLine step={s} startedAt={meta.started_at} />
              )}
              {substepsOf(s).length ? (
                <ol className="ml-[22px] border-l hairline pl-2 mb-1">
                  {substepsOf(s).map((sub, j) => (
                    <motion.li
                      key={j}
                      initial={{ opacity: 0, x: -4 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ ...T_BASE, delay: 0.06 * j }}
                    >
                      <StepLine step={sub} startedAt={meta.started_at} nested />
                    </motion.li>
                  ))}
                </ol>
              ) : null}
            </motion.li>
          ))}
        </AnimatePresence>
        {running ? (
          <li className="flex items-center gap-2 px-3 py-2 text-[12.5px] text-faint">
            <span className="h-1.5 w-1.5 rounded-full bg-current pulse" /> waiting for the next step
          </li>
        ) : null}
      </ol>

      <footer className="px-5 py-3 border-t hairline text-[12.5px] text-ink-2 space-y-1">
        <div className="flex flex-wrap gap-x-5 gap-y-1">
          <span>
            <span className="text-muted">Coverage</span> {coverage ?? (running ? "pending" : "not reported")}
          </span>
          <span>
            <span className="text-muted">Input gate</span>{" "}
            {gateStep ? (
              <GateText step={gateStep} />
            ) : gate ? (
              gate.ran ? (
                gate.label
              ) : (
                <span className="text-ink">{/omitted/i.test(gate.label) ? gate.label.replace(/^input gate\s*/i, "") : `omitted: ${gate.label}`}</span>
              )
            ) : running ? (
              "pending"
            ) : (
              <span className="text-ink">omitted: Decider not running</span>
            )}
          </span>
        </div>
      </footer>
    </section>
  );
}

function GateText({ step }: { step: TraceStep }) {
  if (typeof step.detail === "string") return <>{step.detail}</>;
  return <>{step.label}</>;
}

function StepLine({ step, startedAt, nested = false }: { step: TraceStep; startedAt?: string; nested?: boolean }) {
  const src = sourceOf(step);
  const ts = step.ts ?? (startedAt ? addMs(startedAt, step.startMs) : undefined);
  const hasDetail = step.args || step.result !== undefined || (typeof step.detail === "string" && step.kind !== "input_gate");
  return (
    <div className={`group grid grid-cols-[14px_76px_minmax(0,1fr)_auto] items-start gap-x-2 px-3 ${nested ? "py-1" : "py-1.5"} rounded-md hover:bg-paper/70`}>
      <span className="pt-[5px]">
        <SourceSwatch source={src} size={nested ? 6 : 8} />
      </span>
      <span className="mono text-[11.5px] text-faint pt-[2px] tabular-nums" title={ts}>
        {ts ? utcTime(ts) : `+${step.startMs}`}
      </span>
      <div className="min-w-0">
        <div className={`${nested ? "text-[12.5px] text-ink-2" : "text-[13.5px] text-ink"} leading-snug`}>
          {step.kind === "tool_call" && step.tool && !/^Box AI/.test(step.label) ? <span className="mono">{step.label}</span> : step.label}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11.5px] text-faint">
          <SourceTag source={src} />
          <span className="mono">+{step.startMs} ms</span>
          {step.kind === "input_gate" && typeof step.detail === "string" ? <span className="text-ink-2">{step.detail}</span> : null}
          {step.model_id ? <span className="mono">{step.model_id}</span> : null}
        </div>
        {hasDetail ? (
          <Disclosure label="detail" className="mt-0.5" buttonClassName="!text-[11.5px] !text-faint hover:!text-ink-2">
            <pre className="mono text-[11px] leading-[1.5] whitespace-pre-wrap break-words bg-paper-2 rounded-md p-2 text-ink-2 max-h-56 overflow-auto scroll-quiet">
              {JSON.stringify({ args: step.args, result: step.result, detail: typeof step.detail === "string" ? step.detail : undefined }, null, 2)}
            </pre>
          </Disclosure>
        ) : null}
      </div>
      <span className="mono text-[11.5px] text-muted pt-[2px] tabular-nums">{step.durationMs != null ? ms(step.durationMs) : ""}</span>
    </div>
  );
}
