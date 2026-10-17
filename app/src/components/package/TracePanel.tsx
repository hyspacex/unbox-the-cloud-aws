"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { TraceSource, TraceStep } from "@/lib/types";
import { substepsOf } from "@/lib/client";
import { addMs, ms, utc, utcTime } from "@/lib/ui/format";
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

type Step = TraceStep & { parent_seq?: number };

/** Source for a step: Box AI tool calls are tagged Box AI even inside the agent loop. */
function sourceOf(s: TraceStep): TraceSource {
  if (s.tool === "box_ai_ask" || s.tool === "box_ai_text_gen" || /^Box AI/.test(s.label)) return "boxai";
  return s.source;
}

const isSub = (s: Step) => s.kind === "model_turn" || s.kind === "tool_call" || s.parent_seq != null;

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

function gateText(steps: TraceStep[], gate?: { ran: boolean; label: string } | null, running?: boolean): string {
  const g = steps.find((s) => s.kind === "input_gate");
  if (g) return typeof g.detail === "string" ? g.detail : g.label;
  if (gate) return gate.ran ? gate.label : /omitted/i.test(gate.label) ? gate.label.replace(/^input gate\s*/i, "") : `omitted: ${gate.label}`;
  return running ? "pending" : "omitted: Decider not running";
}

function totalOf(steps: TraceStep[], meta: TraceMeta, elapsedMs?: number | null): number | undefined {
  const last = steps[steps.length - 1];
  return elapsedMs ?? meta.total_duration_ms ?? (last ? last.startMs + (last.durationMs ?? 0) : undefined);
}

const isCompressed = (meta: TraceMeta) => meta.compressed_timing ?? meta.mode_label === "Mock";

export type RunSummaryCounts = { total: number; notEvaluated: number };

export function doneText(summary: RunSummaryCounts | undefined, total?: number): string {
  const t = total != null ? ` in ${ms(total)}` : "";
  if (summary && summary.notEvaluated > 0) {
    return `Done: ${summary.total - summary.notEvaluated} re-checked, ${summary.notEvaluated} not evaluated${t}`;
  }
  return `Done: ${summary?.total ?? 8} controls re-checked${t}`;
}

function LegendTip() {
  return (
    <span className="relative group inline-flex">
      <button type="button" className="inline-flex items-center gap-1 text-[11.5px] text-muted hover:text-ink-2" aria-label="Source legend">
        <span className="flex -space-x-0.5" aria-hidden>
          {(["box", "boxai", "agent", "decider", "app"] as TraceSource[]).map((s) => (
            <SourceSwatch key={s} source={s} size={7} />
          ))}
        </span>
        sources
      </button>
      <span className="pointer-events-none absolute right-0 top-full z-20 mt-1.5 w-[260px] rounded-lg border hairline bg-panel p-2.5 opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100">
        <SourceLegend />
      </span>
    </span>
  );
}

/** Below xl: the whole trace as one line under the count line; expands on click (A4). */
export function TraceLine({
  steps,
  meta,
  running,
  summary,
  elapsedMs,
  open,
  onToggle,
  clockStartMs,
  replaySpeed,
}: {
  steps: TraceStep[];
  meta: TraceMeta;
  running: boolean;
  summary?: RunSummaryCounts;
  elapsedMs?: number | null;
  open: boolean;
  onToggle: () => void;
  clockStartMs?: number;
  replaySpeed?: number;
}) {
  const [now, setNow] = useState(0);
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(t);
  }, [running]);
  const started = clockStartMs ?? (meta.started_at ? new Date(meta.started_at).getTime() : NaN);
  const live = running && now && !Number.isNaN(started) ? Math.max(0, now - started) * (replaySpeed ?? 1) : null;
  const last = steps[steps.length - 1];
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className="w-full text-left rounded-[10px] border hairline bg-panel px-4 py-2.5 hover:border-line-strong transition-colors flex items-center gap-2.5 text-[13px] min-w-0"
    >
      <Caret open={open} />
      {running ? <Spinner /> : null}
      <span className="font-medium text-ink whitespace-nowrap">
        {running ? (replaySpeed ? "Replaying" : "Re-check running") : doneText(summary, totalOf(steps, meta, elapsedMs))}
      </span>
      {running && live != null ? <span className="mono text-[12px] text-muted tabular-nums whitespace-nowrap">· {ms(live)}</span> : null}
      {running && last ? <span className="text-muted truncate">· {last.label}</span> : null}
      {!running && meta.run_id ? <span className="mono text-[12px] text-muted truncate">· {meta.run_id}</span> : null}
    </button>
  );
}

/** Placeholder that keeps the trace column reserved so the table never reflows. */
export function TraceEmpty() {
  return (
    <section className="rounded-[10px] border border-dashed border-line-strong px-5 py-6 text-[13px] text-muted" aria-label="Run trace">
      <div className="font-medium text-ink-2">Run trace</div>
      <p className="mt-1">Run trace appears here when you submit.</p>
      <div className="mt-3">
        <SourceLegend />
      </div>
    </section>
  );
}

/** One-line summary shown when the presenter collapses the panel. */
export function TraceSummary({
  steps,
  meta,
  gate,
  elapsedMs,
  controls,
  summary,
  onExpand,
}: {
  steps: TraceStep[];
  meta: TraceMeta;
  gate?: { ran: boolean; label: string } | null;
  elapsedMs?: number | null;
  controls?: number;
  summary?: RunSummaryCounts;
  onExpand: () => void;
}) {
  const total = totalOf(steps, meta, elapsedMs);
  const coverage = coverageText(steps);
  return (
    <button
      onClick={onExpand}
      className="w-full text-left rounded-[10px] border hairline bg-panel px-4 py-2.5 hover:border-line-strong transition-colors text-[12.5px] text-ink-2"
      aria-label="Show run trace"
    >
      <span className="flex items-center gap-2 font-medium text-ink">
        <Caret open={false} /> {doneText(summary ?? (controls != null ? { total: controls, notEvaluated: 0 } : undefined), total)}
        {isCompressed(meta) ? <span className="font-normal text-muted">(compressed timing)</span> : null}
      </span>
      <span className="mt-1 block text-muted">
        {meta.run_id ? <span className="mono">{meta.run_id}</span> : null} · {steps.length} steps
        {coverage ? ` · coverage ${coverage}` : ""} · input gate {gateText(steps, gate)}
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
  controls,
  onCollapse,
  stacked = false,
  replay,
  onEndReplay,
  clockStartMs,
  summary,
}: {
  steps: TraceStep[];
  meta: TraceMeta;
  running: boolean;
  gate?: { ran: boolean; label: string } | null;
  elapsedMs?: number | null;
  controls?: number;
  onCollapse?: () => void;
  /** Stacked above the table (narrow screens): cap the list height. */
  stacked?: boolean;
  /** Set while showing a replay of a stored run. */
  replay?: { run_id: string; started_at?: string; speed: number } | null;
  onEndReplay?: () => void;
  /** Wall-clock start for the live elapsed counter (replays start now, not at the recorded time). */
  clockStartMs?: number;
  summary?: RunSummaryCounts;
}) {
  const listRef = useRef<HTMLOListElement>(null);
  const userUpAt = useRef(0);
  const programmatic = useRef(false);
  const follow = () => Date.now() - userUpAt.current > 2000;
  const toBottom = (smooth: boolean) => {
    const el = listRef.current;
    if (!el) return;
    programmatic.current = true;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
    setTimeout(() => (programmatic.current = false), smooth ? 500 : 50);
  };
  const lastArrival = useRef<number>(0);
  const [clock, setClock] = useState({ now: 0, since: 0 });

  useEffect(() => {
    lastArrival.current = Date.now();
  }, [steps.length]);

  // Live clock while running (spinner line and header elapsed).
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => {
      const n = Date.now();
      setClock({ now: n, since: Math.max(0, (n - (lastArrival.current || n)) / 1000) });
    }, 100);
    return () => clearInterval(t);
  }, [running]);
  const now = clock.now;

  // Follow new steps unless the presenter scrolled up within the last 2 s.
  useLayoutEffect(() => {
    if (follow()) toBottom(true);
  }, [steps.length]);

  // On completion, pin the last step (again after the done header has grown the panel).
  useEffect(() => {
    if (running) return;
    const a = setTimeout(() => follow() && toBottom(false), 60);
    const b = setTimeout(() => follow() && toBottom(false), 480);
    return () => {
      clearTimeout(a);
      clearTimeout(b);
    };
  }, [running]);

  const onScroll = () => {
    const el = listRef.current;
    if (!el || programmatic.current) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
    userUpAt.current = atBottom ? 0 : Date.now();
  };

  const total = totalOf(steps, meta, elapsedMs);
  const coverage = coverageText(steps);
  const started = clockStartMs ?? (meta.started_at ? new Date(meta.started_at).getTime() : NaN);
  // During a replay, show recorded time (wall time multiplied by the replay speed).
  const liveElapsed = running && now && !Number.isNaN(started) ? Math.max(0, now - started) * (replay?.speed ?? 1) : null;

  // What is running now: the agent loop until quotes are validated, else the next application step.
  const top = steps.filter((s) => !isSub(s as Step));
  const lastTop = top[top.length - 1];
  const inAgent = lastTop?.kind === "agent_evaluation" && !steps.some((s) => s.kind === "quotes_validated");
  const sinceLast = running ? clock.since : 0;
  const workingLabel = steps.length === 0 ? "Starting" : inAgent ? "Agent working" : "Working";

  return (
    <section
      className={`panel overflow-hidden flex flex-col ${stacked ? "" : "xl:max-h-[min(560px,calc(100vh-96px))]"}`}
      aria-label="Run trace"
    >
      <header className="flex-none px-5 pt-4 pb-3 border-b hairline bg-panel-cool">
        {replay ? (
          <div className="mb-2 flex items-start justify-between gap-3 rounded-md border border-line-strong bg-panel px-3 py-2 text-[12.5px] text-ink-2">
            <span>
              <span className="font-semibold text-ink">Replay of run</span> <span className="mono">{replay.run_id}</span>
              {replay.started_at ? <>, recorded <span className="mono">{utc(replay.started_at)}</span></> : null}
              {replay.speed !== 1 ? <span className="text-muted"> · {replay.speed}x speed</span> : null}
              <span className="block text-[11.5px] text-muted">Stored steps replayed with their original relative timing. Nothing is re-evaluated or written.</span>
            </span>
            {onEndReplay ? (
              <button className="btn btn-ghost btn-sm !h-7 !px-2 text-muted flex-none" onClick={onEndReplay}>
                End replay
              </button>
            ) : null}
          </div>
        ) : null}
        <AnimatePresence initial={false}>
          {!running && steps.length ? (
            <motion.div
              key="done"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              transition={T_BASE}
              className="mb-2 flex items-center justify-between gap-3"
            >
              <span className="text-[14.5px] font-semibold text-ink" role="status">
                {doneText(summary ?? (controls != null ? { total: controls, notEvaluated: 0 } : undefined), total)}
              </span>
              {onCollapse ? (
                <button className="btn btn-ghost btn-sm !h-7 !px-2 text-muted" onClick={onCollapse} aria-label="Collapse trace">
                  Collapse
                </button>
              ) : null}
            </motion.div>
          ) : null}
        </AnimatePresence>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <span
              className={`h-2 w-2 rounded-full flex-none ${running ? "pulse" : ""}`}
              style={{ background: running ? "var(--ink-2)" : "var(--grey-dot)" }}
            />
            <h2 className="text-[14px] font-semibold text-ink">{running ? (replay ? "Replaying" : "Re-check running") : replay ? "Replay" : "Run trace"}</h2>
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
          <div className="text-[12.5px] text-muted tabular-nums whitespace-nowrap">
            elapsed <span className="mono text-ink-2">{running ? (liveElapsed != null ? ms(liveElapsed) : "") : total != null ? ms(total) : ""}</span>
          </div>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-muted">
          {meta.run_id ? <span className="mono">{meta.run_id}</span> : null}
          {meta.mode_label ? <span>· {meta.mode_label}</span> : null}
          {meta.started_at ? (
            <span>
              · started <span className="mono">{utcTime(meta.started_at)}</span>
            </span>
          ) : null}
          {isCompressed(meta) ? <span>· compressed timing in mock</span> : null}
          <span className="ml-auto">
            <LegendTip />
          </span>
        </div>
      </header>

      <ol
        ref={listRef}
        onScroll={onScroll}
        className={`flex-1 min-h-0 px-2 py-2 overflow-y-auto scroll-quiet ${stacked ? "max-h-[420px]" : "max-h-[560px] xl:max-h-none"}`}
        aria-live="polite"
      >
        <AnimatePresence initial={false}>
          {steps.map((s, i) => (
            <motion.li
              key={(s.seq ?? i) + s.kind + i}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={T_BASE}
              className="rounded-md"
            >
              {isSub(s as Step) ? (
                <div className="ml-[22px] border-l hairline pl-2">
                  <StepLine step={s} startedAt={meta.started_at} nested />
                </div>
              ) : (
                <StepLine step={s} startedAt={meta.started_at} />
              )}
              {substepsOf(s).length ? (
                <ol className="ml-[22px] border-l hairline pl-2 mb-1">
                  {substepsOf(s).map((sub, j) => (
                    <li key={j}>
                      <StepLine step={sub} startedAt={meta.started_at} nested />
                    </li>
                  ))}
                </ol>
              ) : null}
            </motion.li>
          ))}
        </AnimatePresence>
        {running ? (
          <li className={`flex items-center gap-2.5 px-3 py-2 text-[13px] text-ink-2 ${inAgent ? "ml-[22px] border-l hairline" : ""}`}>
            <Spinner />
            <span>{workingLabel}…</span>
            <span className="mono text-[12px] text-muted tabular-nums">{sinceLast.toFixed(1)} s</span>
          </li>
        ) : null}
      </ol>

      <footer className="flex-none px-5 py-3 border-t hairline text-[12.5px] text-ink-2">
        <div className="flex flex-wrap gap-x-5 gap-y-1">
          <span>
            <span className="text-muted">Coverage</span> {coverage ?? (running ? "pending" : "not reported")}
          </span>
          <span>
            <span className="text-muted">Input gate</span> {gateText(steps, running ? null : gate, running)}
          </span>
        </div>
      </footer>
    </section>
  );
}

function Spinner() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" className="animate-spin flex-none" aria-hidden>
      <circle cx="6" cy="6" r="4.5" fill="none" stroke="var(--line-strong)" strokeWidth="1.6" />
      <path d="M6 1.5a4.5 4.5 0 0 1 4.5 4.5" fill="none" stroke="var(--ink-2)" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function StepLine({ step, startedAt, nested = false }: { step: TraceStep; startedAt?: string; nested?: boolean }) {
  const src = sourceOf(step);
  const ts = step.ts ?? (startedAt ? addMs(startedAt, step.startMs) : undefined);
  const hasDetail = step.args || step.result !== undefined;
  return (
    <div className={`group grid grid-cols-[14px_70px_minmax(0,1fr)_auto] items-start gap-x-2 px-3 ${nested ? "py-1" : "py-1.5"} rounded-md hover:bg-paper/70`}>
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
          <span className="mono">+{ms(step.startMs)}</span>
          {step.kind === "input_gate" && typeof step.detail === "string" ? <span className="text-ink-2">{step.detail}</span> : null}
        </div>
        {hasDetail ? (
          <Disclosure label="detail" className="mt-0.5" buttonClassName="!text-[11.5px] !text-faint hover:!text-ink-2">
            <pre className="mono text-[11px] leading-[1.5] whitespace-pre-wrap break-words bg-paper-2 rounded-md p-2 text-ink-2 max-h-56 overflow-auto scroll-quiet">
              {JSON.stringify({ args: step.args, result: step.result }, null, 2)}
            </pre>
          </Disclosure>
        ) : null}
      </div>
      <span className="mono text-[11.5px] text-muted pt-[2px] tabular-nums">{step.durationMs != null ? ms(step.durationMs) : ""}</span>
    </div>
  );
}
