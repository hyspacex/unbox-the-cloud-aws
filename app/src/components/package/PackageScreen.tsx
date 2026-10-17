"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { ActionResponse, ControlRow, DisplayedStatus, PackageView, SubmitRequest, TraceStep } from "@/lib/types";
import { api, clearFindingCache, followRun, isAbort, prefetchFindings, type RunSummary, type TaskItem } from "@/lib/client";
import { useKeel } from "@/components/AppProvider";
import { CountLine } from "@/components/ui/CountLine";
import { ErrorBlock, LoadingBlock } from "@/components/ui/States";
import { Drawer } from "@/components/ui/Drawer";
import { Disclosure } from "@/components/ui/Disclosure";
import { Modal } from "@/components/ui/Modal";
import { FindingContainer } from "@/components/finding/FindingContainer";
import { T_BASE, T_SLOW } from "@/lib/ui/motion";
import { isHold, orderByAttention, orderById } from "@/lib/ui/order";
import { useMedia } from "@/lib/ui/useMedia";
import { PackageHeader } from "./PackageHeader";
import { ControlRows } from "./ControlRows";
import { TraceEmpty, TraceLine, TracePanel, TraceSummary, type RunSummaryCounts, type TraceMeta } from "./TracePanel";
import { FolderProjection } from "./FolderProjection";
import { OpenTasks } from "./OpenTasks";

type RunUi = { runId: string; steps: TraceStep[]; meta: TraceMeta; running: boolean; summary?: { evaluated: number; not_evaluated: number } };
type WithSummary = { summary?: { evaluated: number; not_evaluated: number } };
type Snap = { view: PackageView; rows: ControlRow[]; countLine: string };

const STAGGER_MS = 80;
const IDLE_POLL_MS = 5000;

/** Rule 1 while a re-check runs: the prior label stays visible, struck through. */
function pendingOf(r: ControlRow): ControlRow {
  if (r.status.kind === "pending_recheck") return r;
  const status: DisplayedStatus = {
    rule: 1,
    kind: "pending_recheck",
    label: "Re-check pending",
    projection_code: "PENDING",
    tone: "grey",
    struck: r.status.label,
  };
  return { ...r, status };
}

const allHold = (rows: ControlRow[]) => rows.length > 0 && rows.every((r) => r.status.kind === "verified_holds");
const anyPending = (v: PackageView) => v.evaluation_state === "pending" || v.rows.some((r) => r.status.kind === "pending_recheck");
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** Wall clock for replays (called from event handlers only). */
const wallNow = () => Date.now();

const SCENARIOS: { id: string; title: string; what: string; upload: string }[] = [
  {
    id: "fabricated_quote",
    title: "Fabricated quote",
    what: "The model cites a sentence that is not in the pinned text. Code rejects the quote and the control reads Not evaluated.",
    upload: "architecture.md v3, with the mock model citing a sentence that v3 no longer contains",
  },
  {
    id: "injection",
    title: "Injected instructions",
    what: "A runbook upload tells AI agents to mark everything satisfied. Decider quarantines it before Bedrock sees it.",
    upload: "a new runbook.md version with a note addressed to AI agents",
  },
  {
    id: "unreadable",
    title: "Unreadable file",
    what: "One file cannot be read. Coverage drops and the controls that depend on it read Not evaluated.",
    upload: "a new approved-services-and-exceptions.md version that Box cannot return as text",
  },
  {
    id: "contradiction",
    title: "Conflicting evidence",
    what: "A vendor summary contradicts a supporting quote. The control reads Needs review: conflicting evidence and Verify is blocked.",
    upload: "a new vendor-contract-summary.md version whose processing addendum conflicts with the architecture",
  },
  {
    id: "missing_finding",
    title: "Missing finding",
    what: "The model returns seven findings for eight controls. Code rejects the whole evaluation; nothing partial is applied.",
    upload: "architecture.md v3, with the mock model omitting one control's finding",
  },
];

export function PackageScreen() {
  const { config, setRun: setRunLabel } = useKeel();
  const isXl = useMedia("(min-width: 1280px)");
  const [view, setView] = useState<PackageView | null>(null);
  const [rows, setRows] = useState<ControlRow[]>([]);
  const [order, setOrder] = useState<string[] | null>(null);
  const [countLine, setCountLine] = useState<string>("");
  const [priorCount, setPriorCount] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [tasksErr, setTasksErr] = useState<string | null>(null);
  const [run, setRun] = useState<RunUi | null>(null);
  const [traceOpen, setTraceOpen] = useState(true);
  const [lineOpen, setLineOpen] = useState(false);
  const [popMax, setPopMax] = useState(420);
  const lineRef = useRef<HTMLDivElement>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitErr, setSubmitErr] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [scenario, setScenario] = useState<string | null>(null);
  const [confirmScenario, setConfirmScenario] = useState<string | null>(null);
  const [replay, setReplay] = useState<{ run_id: string; started_at?: string; speed: number; clockStart: number } | null>(null);
  const savedRunRef = useRef<RunUi | null>(null);
  const savedSnapRef = useRef<Snap | null>(null);
  const replayTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const pushedRef = useRef(false);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const cancelRunRef = useRef<(() => void) | null>(null);
  const flippedRef = useRef<string | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  /** Attention order is fixed once per snapshot (B3): pills change, positions do not. */
  const orderRef = useRef<{ snapshot: string; ids: string[] } | null>(null);
  const viewRef = useRef<PackageView | null>(null);
  const busyRef = useRef(false);
  /** Follower generation: bumped on every new run, reset and unmount. Async work checks it after each await. */
  const genRef = useRef(0);
  const actionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const mode = view?.mode ?? config?.mode;
  const isMock = mode === "mock";

  const clearTimers = () => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  };

  const orderFor = useCallback((v: PackageView): string[] => {
    const ids = v.rows.map((r) => r.control_id);
    const o = orderRef.current;
    if (o && o.snapshot === v.snapshot.snapshot_id && o.ids.length === ids.length && ids.every((id) => o.ids.includes(id))) return o.ids;
    if (anyPending(v)) return (o?.ids.length === ids.length ? o.ids : orderById(v.rows).map((r) => r.control_id));
    const next = (allHold(v.rows) ? orderById(v.rows) : orderByAttention(v.rows)).map((r) => r.control_id);
    orderRef.current = { snapshot: v.snapshot.snapshot_id, ids: next };
    return next;
  }, []);

  /** Apply ONE package response whole: header, count line and rows together. */
  const showView = useCallback(
    (v: PackageView) => {
      clearTimers();
      viewRef.current = v;
      setView(v);
      setRows(v.rows);
      setCountLine(v.count_line);
      setOrder(orderFor(v));
      const pc = (v as PackageView & { prior_count_line?: string }).prior_count_line;
      if (pc) setPriorCount(pc);
      else if (!anyPending(v)) setPriorCount(null);
    },
    [orderFor],
  );

  /** End-of-run reveal from one response: header and count flip together, rows flip one by one. */
  const revealView = useCallback(
    (v: PackageView) => {
      clearTimers();
      viewRef.current = v;
      const ids = orderFor(v);
      setView(v);
      setCountLine(v.count_line);
      setPriorCount(null);
      setOrder(ids);
      ids.forEach((id, k) => {
        const r = v.rows.find((x) => x.control_id === id);
        if (!r) return;
        timersRef.current.push(setTimeout(() => setRows((cur) => cur.map((x) => (x.control_id === id ? r : x))), k * STAGGER_MS));
      });
      // B5: the attention rows' cards open filled.
      prefetchFindings(v.rows.filter((r) => !isHold(r)).map((r) => r.finding_id ?? r.control_id));
    },
    [orderFor],
  );

  const loadPackage = useCallback(async () => {
    try {
      const v = await api.package();
      setErr(null);
      return v;
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      return null;
    }
  }, []);

  const loadTasks = useCallback(async () => {
    try {
      setTasks(await api.tasks());
      setTasksErr(null);
    } catch (e) {
      setTasksErr(e instanceof Error ? e.message : String(e));
    }
  }, []);

  /** Fetch the package once findings are applied; retry briefly while the engine still reports pending. */
  const flip = useCallback(
    async (runId: string, gen: number) => {
      if (flippedRef.current === runId) return;
      flippedRef.current = runId;
      for (let attempt = 0; attempt < 16; attempt++) {
        const v = await loadPackage();
        if (gen !== genRef.current) return;
        if (v && !anyPending(v)) {
          revealView(v);
          return;
        }
        await wait(250);
        if (gen !== genRef.current) return;
      }
    },
    [loadPackage, revealView],
  );

  const startFollowing = useCallback(
    (runId: string, initialMeta: TraceMeta, priorLine?: string) => {
      cancelRunRef.current?.();
      const gen = ++genRef.current;
      const current = () => gen === genRef.current;
      flippedRef.current = null;
      busyRef.current = true;
      clearFindingCache();
      setRun({ runId, steps: [], meta: initialMeta, running: true });
      setTraceOpen(true);
      setLineOpen(false);
      if (priorLine) setPriorCount(priorLine);
      setRows((cur) => cur.map(pendingOf));
      // B1: take the engine's pending count line from the same response as its pending rows.
      (async () => {
        for (let i = 0; i < 8; i++) {
          const v = await loadPackage();
          if (!current() || flippedRef.current === runId) return;
          if (v && anyPending(v)) {
            showView(v);
            return;
          }
          await wait(150);
          if (!current()) return;
        }
      })();
      api
        .run(runId)
        .then((m) => {
          if (!current()) return;
          setRun((r) =>
            r && r.runId === runId
              ? {
                  ...r,
                  meta: {
                    ...r.meta,
                    run_id: m.run_id,
                    mode_label: m.mode_label,
                    started_at: m.started_at,
                    snapshot_id: m.snapshot_id,
                    prior_snapshot_id: m.prior_snapshot_id,
                    compressed_timing: m.compressed_timing,
                  },
                }
              : r,
          );
          setRunLabel({ run_id: m.run_id, mode_label: m.mode_label });
        })
        .catch(() => {});
      const cancel = followRun(runId, {
        onStep: (step) => {
          setRun((r) => (r && r.runId === runId ? { ...r, steps: [...r.steps, step] } : r));
          if (step.kind === "findings_applied" || step.kind === "evaluation_completed") flip(runId, gen);
        },
        onMeta: (m) => {
          setRun((r) =>
            r && r.runId === runId
              ? {
                  ...r,
                  meta: {
                    run_id: m.run_id,
                    mode_label: m.mode_label,
                    started_at: m.started_at,
                    total_duration_ms: m.done ? m.total_duration_ms : undefined,
                    snapshot_id: m.snapshot_id,
                    prior_snapshot_id: m.prior_snapshot_id,
                    model_id: m.model_id,
                    inference_profile: m.inference_profile,
                    compressed_timing: m.compressed_timing,
                  },
                }
              : r,
          );
        },
        onDone: async (final) => {
          setRun((r) =>
            r && r.runId === runId
              ? { ...r, running: false, steps: final?.steps?.length ? final.steps : r.steps, summary: (final as WithSummary | undefined)?.summary ?? r.summary }
              : r,
          );
          await flip(runId, gen);
          if (!current()) return;
          loadTasks();
          // Projection and tasks land after findings; once the reveal has finished, apply one response whole.
          await wait(STAGGER_MS * 10 + 120);
          if (!current()) return;
          const v = await loadPackage();
          if (!current()) return;
          if (v && !anyPending(v)) showView(v);
          busyRef.current = false;
        },
        onGone: async () => {
          // The run was removed (a reset elsewhere): drop it quietly and show the current package.
          if (!current()) return;
          busyRef.current = false;
          setRun(null);
          setRunLabel(null);
          const v = await loadPackage();
          if (current() && v) showView(v);
        },
      });
      cancelRunRef.current = cancel;
    },
    [flip, loadPackage, loadTasks, setRunLabel, showView],
  );

  /** Show a stored trace for a finished run; a missing run is dropped quietly (A5). */
  const showStoredRun = useCallback(
    async (runId: string) => {
      try {
        const t = await api.run(runId);
        setRun({
          runId: t.run_id,
          steps: t.steps,
          running: !t.done,
          summary: (t as WithSummary).summary,
          meta: {
            run_id: t.run_id,
            mode_label: t.mode_label,
            started_at: t.started_at,
            total_duration_ms: t.total_duration_ms,
            snapshot_id: t.snapshot_id,
            prior_snapshot_id: t.prior_snapshot_id,
            compressed_timing: t.compressed_timing,
          },
        });
        setRunLabel({ run_id: t.run_id, mode_label: t.mode_label });
      } catch {
        setRun(null);
      }
    },
    [setRunLabel],
  );

  // Initial load; resume a run in progress or show the last run's trace.
  useEffect(() => {
    let alive = true;
    (async () => {
      const v = await loadPackage();
      if (!alive || !v) return;
      showView(v);
      loadTasks();
      if (!alive || !v.trace_run_id) return;
      if (anyPending(v)) startFollowing(v.trace_run_id, { run_id: v.trace_run_id });
      else await showStoredRun(v.trace_run_id);
    })();
    return () => {
      alive = false;
      // eslint-disable-next-line react-hooks/exhaustive-deps -- genRef is a counter, not a DOM ref
      genRef.current++;
      cancelRunRef.current?.();
      clearTimers();
      replayTimersRef.current.forEach(clearTimeout);
      if (actionTimerRef.current) clearTimeout(actionTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // C1: passive tabs stay in sync. Each poll response is applied whole; a run started elsewhere is followed.
  useEffect(() => {
    let alive = true;
    let ctrl: AbortController | null = null;
    const t = setInterval(async () => {
      if (busyRef.current || replay || openId || document.visibilityState !== "visible") return;
      ctrl?.abort();
      ctrl = new AbortController();
      const gen = genRef.current;
      let v: PackageView;
      try {
        v = await api.package(ctrl.signal);
      } catch (e) {
        if (alive && !isAbort(e)) setErr(e instanceof Error ? e.message : String(e));
        return;
      }
      if (!alive || gen !== genRef.current || busyRef.current) return;
      setErr(null);
      const cur = viewRef.current;
      if (anyPending(v) && v.trace_run_id && v.trace_run_id !== run?.runId) {
        startFollowing(v.trace_run_id, { run_id: v.trace_run_id }, cur?.count_line);
        return;
      }
      if (!cur || JSON.stringify(cur) !== JSON.stringify(v)) {
        showView(v);
        loadTasks();
        if (v.trace_run_id && v.trace_run_id !== run?.runId) showStoredRun(v.trace_run_id);
        if (!v.trace_run_id && run) setRun(null);
      }
    }, IDLE_POLL_MS);
    return () => {
      alive = false;
      clearInterval(t);
      ctrl?.abort();
    };
  }, [replay, openId, run, startFollowing, showView, loadTasks, showStoredRun]);

  // Drawer is portalled: close it if this route is hidden by Activity.
  useLayoutEffect(() => () => setOpenId(null), []);

  // Route sync: /finding/[id] while the drawer is open.
  useEffect(() => {
    const onPop = () => {
      const m = window.location.pathname.match(/^\/finding\/([^/]+)/);
      setOpenId(m ? decodeURIComponent(m[1]) : null);
      if (!m) pushedRef.current = false;
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const openFinding = (id: string, replace = false, controlId?: string) => {
    if (!replace) {
      const rowEl = controlId ? document.querySelector<HTMLElement>(`[data-control="${controlId}"] [tabindex="0"]`) : null;
      returnFocusRef.current = rowEl ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    }
    setOpenId(id);
    const url = `/finding/${encodeURIComponent(id)}`;
    if (replace || pushedRef.current) window.history.replaceState(null, "", url);
    else window.history.pushState(null, "", url);
    pushedRef.current = true;
  };

  const closeFinding = () => {
    setOpenId(null);
    if (pushedRef.current) {
      pushedRef.current = false;
      window.history.replaceState(null, "", "/");
    }
    const el = returnFocusRef.current;
    setTimeout(() => el?.focus?.({ preventScroll: false }), 460);
  };

  /** B13: replay a stored run; rows go through Re-check pending and flip on the recorded findings step. Read-only. */
  const startReplay = async (runId: string, speed: number) => {
    replayTimersRef.current.forEach(clearTimeout);
    replayTimersRef.current = [];
    let t;
    try {
      t = await api.run(runId);
    } catch (e) {
      setSubmitErr(e instanceof Error ? e.message : String(e));
      return;
    }
    if (!replay) {
      savedRunRef.current = run;
      if (view) savedSnapRef.current = { view, rows, countLine };
    }
    const saved = savedSnapRef.current;
    const meta: TraceMeta = {
      run_id: t.run_id,
      mode_label: "Replay",
      started_at: t.started_at,
      total_duration_ms: t.total_duration_ms,
      snapshot_id: t.snapshot_id,
      prior_snapshot_id: t.prior_snapshot_id,
      compressed_timing: t.compressed_timing,
    };
    const clockStart = wallNow();
    const key = `replay:${t.run_id}`;
    setReplay({ run_id: t.run_id, started_at: t.started_at, speed, clockStart });
    setRunLabel({ run_id: t.run_id, mode_label: "Replay" });
    setTraceOpen(true);
    setRun({ runId: key, steps: [], meta, running: true });
    clearTimers();
    if (saved) {
      setPriorCount(saved.countLine);
      setRows(saved.rows.map(pendingOf));
    }
    let at = 0;
    let flipped = false;
    t.steps.forEach((s) => {
      const end = s.kind === "agent_evaluation" ? s.startMs : s.startMs + (s.durationMs ?? 0);
      at = Math.max(at, end);
      replayTimersRef.current.push(
        setTimeout(() => {
          setRun((r) => (r && r.runId === key ? { ...r, steps: [...r.steps, s] } : r));
          if (!flipped && saved && (s.kind === "findings_applied" || s.kind === "evaluation_completed")) {
            flipped = true;
            // Flip back to the package as it is now; the replay never changes state.
            revealView(saved.view);
          }
        }, at / speed),
      );
    });
    const total = Math.max(at, t.total_duration_ms ?? 0);
    replayTimersRef.current.push(
      setTimeout(() => {
        setRun((r) => (r && r.runId === key ? { ...r, running: false } : r));
        if (!flipped && saved) revealView(saved.view);
      }, total / speed + 60),
    );
  };

  const endReplay = () => {
    replayTimersRef.current.forEach(clearTimeout);
    replayTimersRef.current = [];
    setReplay(null);
    const prev = savedRunRef.current;
    savedRunRef.current = null;
    setRun(prev);
    setRunLabel(prev ? { run_id: prev.meta.run_id ?? prev.runId, mode_label: prev.meta.mode_label ?? "Mock" } : null);
    const snap = savedSnapRef.current;
    savedSnapRef.current = null;
    if (snap) showView(snap.view);
  };

  const humanDecisions = (view?.rows ?? []).filter((r) => r.current_disposition !== "unreviewed").length;

  const submit = async (sc?: string) => {
    if (replay) endReplay();
    setSubmitting(true);
    setSubmitErr(null);
    const prior = countLine;
    try {
      if (sc && sc !== "architecture_v3") {
        // Alternate scenarios start from the baseline so each one shows only its own effect.
        await api.reset();
        const base = await loadPackage();
        if (base) showView(base);
      }
      setScenario(sc ?? null);
      const res = await api.submit(isMock ? { scenario: (sc ?? "architecture_v3") as SubmitRequest["scenario"] } : {});
      startFollowing(res.run_id, { run_id: res.run_id, snapshot_id: res.snapshot_id }, sc && sc !== "architecture_v3" ? viewRef.current?.count_line : prior);
    } catch (e) {
      setSubmitErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  const askScenario = (sc: string) => {
    if (humanDecisions > 0) setConfirmScenario(sc);
    else submit(sc);
  };

  const reset = async () => {
    if (replay) endReplay();
    genRef.current++;
    cancelRunRef.current?.();
    busyRef.current = false;
    try {
      await api.reset();
    } catch (e) {
      setSubmitErr(e instanceof Error ? e.message : String(e));
    }
    setRun(null);
    setScenario(null);
    setRunLabel(null);
    setPriorCount(null);
    clearFindingCache();
    const v = await loadPackage();
    if (v) showView(v);
    loadTasks();
  };

  const onChanged = (r: ActionResponse) => {
    setRows((cur) => cur.map((row) => (row.control_id === r.row.control_id ? r.row : row)));
    if (r.count_line) setCountLine(r.count_line);
    if (actionTimerRef.current) clearTimeout(actionTimerRef.current);
    const gen = genRef.current;
    actionTimerRef.current = setTimeout(async () => {
      const v = await loadPackage();
      if (gen !== genRef.current) return;
      if (v) showView(v);
      loadTasks();
    }, 300);
  };

  if (err && !view) {
    return (
      <Shell>
        <ErrorBlock title="Could not load the package view from /api/package" message={err} onRetry={() => loadPackage().then((v) => v && showView(v))} />
      </Shell>
    );
  }
  if (!view) {
    return (
      <Shell>
        <LoadingBlock lines={2} className="max-w-xl" />
        <div className="mt-10 panel p-5">
          <LoadingBlock lines={8} />
        </div>
      </Shell>
    );
  }

  const running = Boolean(run?.running) && !replay;
  const traceRunning = Boolean(run?.running);
  const locked = running || submitting || Boolean(replay);
  const pendingView = traceRunning || rows.some((r) => r.status.kind === "pending_recheck");
  const orderedRows = order ? order.map((id) => rows.find((r) => r.control_id === id)).filter((r): r is ControlRow => Boolean(r)) : rows;
  const extra = rows.filter((r) => !orderedRows.includes(r));
  const displayRows = [...orderedRows, ...extra];
  const engineSummary = run?.summary;
  const summary: RunSummaryCounts = {
    total: view.rows.length,
    notEvaluated: engineSummary?.not_evaluated ?? view.rows.filter((r) => r.status.kind === "not_evaluated").length,
  };
  const scen = SCENARIOS.find((s) => s.id === scenario);

  const panel = run ? (
    <TracePanel
      steps={run.steps}
      meta={run.meta}
      running={run.running}
      gate={run.running || replay ? null : view.gate}
      elapsedMs={run.running || replay ? null : view.elapsed_ms ?? null}
      controls={view.rows.length}
      summary={pendingView ? undefined : summary}
      onCollapse={() => (isXl ? setTraceOpen(false) : setLineOpen(false))}
      replay={replay}
      onEndReplay={endReplay}
      clockStartMs={replay?.clockStart}
    />
  ) : null;

  const wideTrace =
    run && (traceOpen || traceRunning) ? (
      panel
    ) : run ? (
      <TraceSummary steps={run.steps} meta={run.meta} gate={view.gate} elapsedMs={view.elapsed_ms ?? null} controls={view.rows.length} summary={summary} onExpand={() => setTraceOpen(true)} />
    ) : null;

  return (
    <Shell>
      <PackageHeader view={view} />

      <SubmitBar
        isMock={isMock}
        running={running}
        submitting={submitting}
        locked={locked}
        error={submitErr}
        onSubmit={() => submit()}
        onReset={reset}
        scenarioUpload={scen?.upload}
        scenarioTitle={scen?.title}
        replayControl={<ReplayControl disabled={running || submitting || Boolean(replay)} onReplay={startReplay} />}
      />
      {isMock ? (
        <Disclosure className="mt-2 ml-1" label="Other scenarios" hint="what if the model fabricates a quote, someone injects instructions, or a file cannot be read">
          <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
            {SCENARIOS.map((s) => (
              <li key={s.id} className={`rounded-[10px] border bg-panel p-3 ${scenario === s.id ? "border-ink-2" : "hairline"}`}>
                <button className="btn btn-secondary btn-sm w-full" disabled={locked} onClick={() => askScenario(s.id)}>
                  {s.title}
                </button>
                <p className="mt-2 text-[12px] leading-[1.45] text-muted">{s.what}</p>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11.5px] text-faint">Each scenario resets to the baseline first, then submits its upload through the same pipeline.</p>
        </Disclosure>
      ) : null}

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0">
          {err ? (
            <div role="alert" className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-[10px] border border-red-line bg-red-bg px-4 py-2.5 text-[13px] text-red-ink">
              <span>
                <span className="font-semibold">Showing the last loaded view; it may be stale.</span> Refresh failed: {err}
              </span>
              <button
                className="btn btn-secondary btn-sm"
                onClick={async () => {
                  const v = await loadPackage();
                  if (v) showView(v);
                }}
              >
                Retry
              </button>
            </div>
          ) : null}
          {view.awaiting_drafts && view.awaiting_drafts.length ? (
            <div className="mb-3 rounded-[10px] border border-blue-line bg-blue-bg/50 px-4 py-2.5 text-[13px] text-ink-2" role="status">
              <span className="font-medium text-blue-ink">
                {view.awaiting_drafts.length} author {view.awaiting_drafts.length === 1 ? "task" : "tasks"} awaiting the reviewer&apos;s approval of the Box AI draft
              </span>
              {" · "}
              {view.awaiting_drafts.map((d, i) => (
                <span key={d.finding_id}>
                  {i ? ", " : ""}
                  <button type="button" className="link mono text-[12.5px]" onClick={() => openFinding(d.finding_id, false, d.control_id)}>
                    {d.control_id} {d.finding_id}
                  </button>
                </span>
              ))}
            </div>
          ) : null}
          <div className="mb-3">
            <CountLine text={countLine} className="text-[18px] leading-snug text-ink tracking-[-0.01em]" />
            {priorCount && priorCount !== countLine ? <p className="mt-0.5 text-[12.5px] struck">{priorCount}</p> : null}
          </div>
          {!isXl && run ? (
            <div className="mb-3 relative" ref={lineRef}>
              <TraceLine
                steps={run.steps}
                meta={run.meta}
                running={run.running}
                summary={pendingView ? undefined : summary}
                elapsedMs={run.running || replay ? null : view.elapsed_ms ?? null}
                open={lineOpen}
                onToggle={() => {
                  // Fit the popover in the space below the line so its end is always on screen.
                  const b = lineRef.current?.getBoundingClientRect().bottom ?? 300;
                  setPopMax(Math.max(260, window.innerHeight - b - 16));
                  setLineOpen((o) => !o);
                }}
                clockStartMs={replay?.clockStart}
                replaySpeed={replay?.speed}
              />
              <AnimatePresence initial={false}>
                {lineOpen ? (
                  <>
                    {/* Outside click closes the popover; the rows below never move. */}
                    <motion.button
                      key="line-backdrop"
                      type="button"
                      aria-label="Close run trace"
                      className="fixed inset-0 z-20 cursor-default bg-transparent"
                      onClick={() => setLineOpen(false)}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                    />
                    <motion.div
                      key="line-panel"
                      role="region"
                      aria-label="Run trace"
                      onKeyDown={(e) => e.key === "Escape" && setLineOpen(false)}
                      initial={{ opacity: 0, y: -6, scale: 0.99 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -6 }}
                      transition={T_BASE}
                      className="absolute left-0 right-0 top-full z-30 mt-2 rounded-[12px]"
                      style={{ boxShadow: "var(--shadow-modal)" }}
                    >
                      {run ? (
                        <TracePanel
                          steps={run.steps}
                          meta={run.meta}
                          running={run.running}
                          gate={run.running || replay ? null : view.gate}
                          elapsedMs={run.running || replay ? null : view.elapsed_ms ?? null}
                          controls={view.rows.length}
                          summary={pendingView ? undefined : summary}
                          onCollapse={() => setLineOpen(false)}
                          replay={replay}
                          onEndReplay={endReplay}
                          clockStartMs={replay?.clockStart}
                          maxHeight={popMax}
                        />
                      ) : null}
                    </motion.div>
                  </>
                ) : null}
              </AnimatePresence>
            </div>
          ) : null}
          <ControlRows
            rows={displayRows}
            ordering={order ? "attention" : "id"}
            onOpen={(r) => openFinding(r.finding_id ?? r.control_id, false, r.control_id)}
            selectedId={openId}
            holdsDefaultOpen={pendingView ? undefined : allHold(rows) ? true : false}
            preserveOrder={Boolean(order)}
          />
          <p className="mt-2 text-[12px] text-muted">
            Select a row to open its finding card. Statuses come from the{" "}
            <a href="/rules" className="link">
              published display rules
            </a>
            ; this page renders them.
          </p>

          <div className="mt-8 grid gap-8 2xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
            <div>
              <h3 className="text-[14px] font-semibold text-ink mb-2">Projection into Box</h3>
              <FolderProjection
                key={`${view.snapshot.snapshot_id}-${Boolean(run) && !running}`}
                projection={view.projection}
                currentSnapshotId={view.snapshot.snapshot_id}
                defaultOpen={Boolean(run) && !running}
                folderName={view.header.folderName}
                writing={Boolean((view as PackageView & { projection_in_flight?: boolean }).projection_in_flight) || running}
              />
            </div>
            <OpenTasks tasks={tasks} error={tasksErr} />
          </div>
        </div>

        {isXl ? (
          <div className="min-w-0 xl:sticky xl:top-[72px] xl:self-start">
            <AnimatePresence initial={false} mode="wait">
              {wideTrace ? (
                <motion.div key={run && (traceOpen || traceRunning) ? `panel-${run.runId}` : "summary"} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={T_SLOW}>
                  {wideTrace}
                </motion.div>
              ) : (
                <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={T_BASE}>
                  <TraceEmpty />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ) : null}
      </div>

      <Drawer open={openId != null} onClose={closeFinding}>
        {openId ? (
          <FindingContainer
            key="drawer-card"
            id={openId}
            layout="drawer"
            onClose={closeFinding}
            onSelect={(id) => openFinding(id, true)}
            onChanged={onChanged}
            onPending={async () => {
              const v = await loadPackage();
              if (v) showView(v);
            }}
          />
        ) : null}
      </Drawer>

      <Modal
        open={confirmScenario != null}
        onClose={() => setConfirmScenario(null)}
        title={`Run ${SCENARIOS.find((s) => s.id === confirmScenario)?.title ?? "scenario"}?`}
        eyebrow="Other scenarios"
        width={520}
        footer={
          <div className="flex justify-end gap-2">
            <button className="btn btn-ghost" onClick={() => setConfirmScenario(null)}>
              Cancel
            </button>
            <button
              className="btn btn-primary"
              onClick={() => {
                const sc = confirmScenario;
                setConfirmScenario(null);
                if (sc) submit(sc);
              }}
            >
              Reset and run
            </button>
          </div>
        }
      >
        <p className="text-[14px] text-ink-2">
          This resets to baseline and discards {humanDecisions} recorded {humanDecisions === 1 ? "decision" : "decisions"}. Run{" "}
          {SCENARIOS.find((s) => s.id === confirmScenario)?.title ?? "this scenario"}?
        </p>
      </Modal>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-[1360px] px-6 lg:px-10 pt-7 pb-16">{children}</div>;
}

function SubmitBar({
  isMock,
  running,
  submitting,
  error,
  onSubmit,
  onReset,
  replayControl,
  locked,
  scenarioUpload,
  scenarioTitle,
}: {
  isMock: boolean;
  running: boolean;
  submitting: boolean;
  error: string | null;
  onSubmit: () => void;
  onReset: () => void;
  replayControl?: React.ReactNode;
  locked?: boolean;
  scenarioUpload?: string;
  scenarioTitle?: string;
}) {
  return (
    <div className="mt-5 flex flex-wrap items-center justify-between gap-4 rounded-[12px] border hairline bg-panel-cool px-5 py-3">
      <div className="min-w-[320px] flex-1 text-[13.5px] text-ink-2">
        {isMock ? (
          scenarioUpload ? (
            <>
              <span className="font-medium text-ink">Mock mode · scenario {scenarioTitle}.</span> Played {scenarioUpload} into the mock Box folder.
            </>
          ) : (
            <>
              <span className="font-medium text-ink">Mock mode.</span> Submitting plays <span className="mono">architecture.md</span> v3 from the
              fixture into the mock Box folder.
            </>
          )
        ) : (
          <>
            <span className="font-medium text-ink">Upload a new version in Box; Keel observes the folder.</span> Check now to snapshot the
            folder and re-check every control.
          </>
        )}
        <AnimatePresence>
          {error ? (
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={T_BASE} className="mt-1 text-[12.5px] text-red-ink">
              {error}
            </motion.p>
          ) : null}
        </AnimatePresence>
      </div>
      <div className="flex items-center gap-3">
        {replayControl}
        {isMock ? (
          <button className="btn btn-ghost btn-sm text-muted" onClick={onReset} disabled={running || submitting || locked}>
            Reset to baseline
          </button>
        ) : null}
        <button className="btn btn-primary !h-10 !px-4" onClick={onSubmit} disabled={running || submitting || locked}>
          {running ? (
            <>
              <span className="h-1.5 w-1.5 rounded-full bg-white pulse" /> Re-check running
            </>
          ) : submitting ? (
            "Submitting"
          ) : isMock ? (
            "Submit rewritten architecture document"
          ) : (
            "Check for new version"
          )}
        </button>
      </div>
    </div>
  );
}

/** Quiet control: pick a recorded run (newest by default) and replay it, optionally at 2x. */
function ReplayControl({ disabled, onReplay }: { disabled: boolean; onReplay: (runId: string, speed: number) => void }) {
  const [open, setOpen] = useState(false);
  const [runs, setRuns] = useState<RunSummary[] | null>(null);
  const [pick, setPick] = useState<string>("");
  const [fast, setFast] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next) {
      setErr(null);
      api
        .runs()
        .then((r) => {
          setRuns(r);
          setPick((p) => p || r[0]?.run_id || "");
        })
        .catch((e: unknown) => setErr(e instanceof Error ? e.message : String(e)));
    }
  };

  return (
    <div className="relative">
      <button className="btn btn-ghost btn-sm text-muted" onClick={toggle} disabled={disabled} aria-expanded={open}>
        Replay a recorded run
      </button>
      <AnimatePresence>
        {open ? (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4 }}
            transition={T_BASE}
            className="absolute right-0 top-full mt-2 z-30 w-[360px] rounded-[10px] border border-line-strong bg-panel p-3"
            style={{ boxShadow: "var(--shadow-modal)" }}
          >
            <div className="text-[12.5px] text-muted mb-2">
              Replays a stored trace with its original timing. Nothing is re-evaluated or written.
            </div>
            {err ? <p className="text-[12px] text-red-ink">{err}</p> : null}
            {runs && runs.length === 0 ? <p className="text-[12.5px] text-ink-2">No recorded runs yet. Submit once first.</p> : null}
            {runs && runs.length ? (
              <>
                <select
                  className="w-full h-8 rounded-lg border border-line-strong bg-white px-2 text-[12.5px] mono text-ink"
                  value={pick}
                  onChange={(e) => setPick(e.target.value)}
                >
                  {runs.map((r) => (
                    <option key={r.run_id} value={r.run_id}>
                      {r.run_id} · {r.prior_snapshot_id ? `${r.prior_snapshot_id}→` : ""}
                      {r.snapshot_id}
                      {r.scenario && r.scenario !== "architecture_v3" ? ` · ${r.scenario}` : ""}
                    </option>
                  ))}
                </select>
                <div className="mt-2 flex items-center justify-between">
                  <label className="inline-flex items-center gap-2 text-[12.5px] text-ink-2">
                    <input type="checkbox" checked={fast} onChange={(e) => setFast(e.target.checked)} />
                    2x speed
                  </label>
                  <button
                    className="btn btn-secondary btn-sm"
                    disabled={!pick}
                    onClick={() => {
                      setOpen(false);
                      onReplay(pick, fast ? 2 : 1);
                    }}
                  >
                    Replay
                  </button>
                </div>
              </>
            ) : null}
            {!runs && !err ? <LoadingBlock lines={2} /> : null}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
