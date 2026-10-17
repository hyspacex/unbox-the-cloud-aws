"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { ActionResponse, ControlRow, DisplayedStatus, PackageView, SubmitRequest, TraceStep } from "@/lib/types";
import { api, followRun, type TaskItem } from "@/lib/client";
import { useKeel } from "@/components/AppProvider";
import { CountLine } from "@/components/ui/CountLine";
import { ErrorBlock, LoadingBlock } from "@/components/ui/States";
import { Drawer } from "@/components/ui/Drawer";
import { Disclosure } from "@/components/ui/Disclosure";
import { FindingContainer } from "@/components/finding/FindingContainer";
import { T_BASE, T_SLOW } from "@/lib/ui/motion";
import { orderByAttention, orderById } from "@/lib/ui/order";
import { PackageHeader } from "./PackageHeader";
import { ControlRows } from "./ControlRows";
import { TraceEmpty, TracePanel, TraceSummary, type TraceMeta } from "./TracePanel";
import { FolderProjection } from "./FolderProjection";
import { OpenTasks } from "./OpenTasks";

type RunUi = { runId: string; steps: TraceStep[]; meta: TraceMeta; running: boolean };

const STAGGER_MS = 80;

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

const SCENARIOS: { id: NonNullable<SubmitRequest["scenario"]> | string; title: string; what: string }[] = [
  { id: "fabricated_quote", title: "Fabricated quote", what: "The model cites a sentence that is not in the pinned text. Code rejects the quote and the control reads Not evaluated." },
  { id: "injection", title: "Injected instructions", what: "A runbook upload tells AI agents to mark everything satisfied. Decider quarantines it before Bedrock sees it." },
  { id: "unreadable", title: "Unreadable file", what: "One file cannot be read. Coverage drops and the controls that depend on it read Not evaluated." },
  { id: "contradiction", title: "Conflicting evidence", what: "A vendor summary contradicts a supporting quote. The control reads Needs review: conflicting evidence and Verify is blocked." },
  { id: "missing_finding", title: "Missing finding", what: "The model returns seven findings for eight controls. Code rejects the whole evaluation; nothing partial is applied." },
];

export function PackageScreen() {
  const { config, setRun: setRunLabel } = useKeel();
  const [view, setView] = useState<PackageView | null>(null);
  const [rows, setRows] = useState<ControlRow[]>([]);
  const [order, setOrder] = useState<string[] | null>(null);
  const [countLine, setCountLine] = useState<string>("");
  const [err, setErr] = useState<string | null>(null);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [tasksErr, setTasksErr] = useState<string | null>(null);
  const [run, setRun] = useState<RunUi | null>(null);
  const [traceOpen, setTraceOpen] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitErr, setSubmitErr] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [scenario, setScenario] = useState<string | null>(null);
  const pushedRef = useRef(false);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const cancelRunRef = useRef<(() => void) | null>(null);
  const flippedRef = useRef<string | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  const mode = view?.mode ?? config?.mode;
  const isMock = mode === "mock";

  const clearTimers = () => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  };

  /** Show a view immediately (load, reset, after an action). */
  const showView = useCallback((v: PackageView) => {
    clearTimers();
    setView(v);
    setRows(v.rows);
    setCountLine(v.count_line);
    setOrder(allHold(v.rows) ? orderById(v.rows).map((r) => r.control_id) : orderByAttention(v.rows).map((r) => r.control_id));
  }, []);

  /** The end-of-run reveal: header and count flip together, rows flip one by one in attention order. */
  const revealView = useCallback((v: PackageView) => {
    clearTimers();
    const target = allHold(v.rows) ? orderById(v.rows) : orderByAttention(v.rows);
    setView(v);
    setCountLine(v.count_line);
    setOrder(target.map((r) => r.control_id));
    target.forEach((r, k) => {
      timersRef.current.push(
        setTimeout(() => setRows((cur) => cur.map((x) => (x.control_id === r.control_id ? r : x))), k * STAGGER_MS),
      );
    });
  }, []);

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

  /** Fetch the package once findings are applied; retry briefly if the engine is still pending. */
  const flip = useCallback(
    async (runId: string) => {
      if (flippedRef.current === runId) return;
      flippedRef.current = runId;
      for (let attempt = 0; attempt < 12; attempt++) {
        const v = await loadPackage();
        if (v && !anyPending(v)) {
          revealView(v);
          return;
        }
        await new Promise((r) => setTimeout(r, 250));
      }
      const v = await loadPackage();
      if (v) revealView(v);
    },
    [loadPackage, revealView],
  );

  const startFollowing = useCallback(
    (runId: string, initialMeta: TraceMeta) => {
      cancelRunRef.current?.();
      flippedRef.current = null;
      setRun({ runId, steps: [], meta: initialMeta, running: true });
      setTraceOpen(true);
      // Hold every row at "Re-check pending" with its prior label struck through.
      setRows((cur) => cur.map(pendingOf));
      api
        .run(runId)
        .then((m) => {
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
          if (step.kind === "findings_applied") flip(runId);
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
          setRun((r) => (r && r.runId === runId ? { ...r, running: false, steps: final?.steps?.length ? final.steps : r.steps } : r));
          await flip(runId);
          loadTasks();
          // Pick up the projection and tasks written after findings were applied, without re-animating rows.
          const v = await loadPackage();
          if (v && !anyPending(v)) {
            setView(v);
            setCountLine(v.count_line);
          }
        },
      });
      cancelRunRef.current = cancel;
    },
    [flip, loadPackage, loadTasks, setRunLabel],
  );

  // Initial load; resume a run in progress or show the last run's trace.
  useEffect(() => {
    let alive = true;
    (async () => {
      const v = await loadPackage();
      if (!alive || !v) return;
      showView(v);
      loadTasks();
      if (!v.trace_run_id) return;
      if (anyPending(v)) {
        startFollowing(v.trace_run_id, { run_id: v.trace_run_id });
        return;
      }
      try {
        const t = await api.run(v.trace_run_id);
        if (!alive) return;
        setRun({
          runId: t.run_id,
          steps: t.steps,
          running: !t.done,
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
        /* no trace available */
      }
    })();
    return () => {
      alive = false;
      cancelRunRef.current?.();
      clearTimers();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const submit = async (sc?: string) => {
    setSubmitting(true);
    setSubmitErr(null);
    try {
      if (sc && sc !== "architecture_v3") {
        // Alternate scenarios start from the baseline so each one shows only its own effect.
        await api.reset();
        const base = await loadPackage();
        if (base) showView(base);
      }
      setScenario(sc ?? null);
      const res = await api.submit(isMock ? { scenario: (sc ?? "architecture_v3") as SubmitRequest["scenario"] } : {});
      startFollowing(res.run_id, { run_id: res.run_id, snapshot_id: res.snapshot_id });
    } catch (e) {
      setSubmitErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  const reset = async () => {
    cancelRunRef.current?.();
    try {
      await api.reset();
    } catch (e) {
      setSubmitErr(e instanceof Error ? e.message : String(e));
    }
    setRun(null);
    setScenario(null);
    setRunLabel(null);
    const v = await loadPackage();
    if (v) showView(v);
    loadTasks();
  };

  const onChanged = (r: ActionResponse) => {
    setRows((cur) => cur.map((row) => (row.control_id === r.row.control_id ? r.row : row)));
    if (r.count_line) setCountLine(r.count_line);
    setTimeout(async () => {
      const v = await loadPackage();
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

  const running = Boolean(run?.running);
  const pendingView = running || rows.some((r) => r.status.kind === "pending_recheck");
  const orderedRows = order ? order.map((id) => rows.find((r) => r.control_id === id)).filter((r): r is ControlRow => Boolean(r)) : rows;
  const extra = rows.filter((r) => !orderedRows.includes(r));
  const displayRows = [...orderedRows, ...extra];

  const trace =
    run && (traceOpen || running) ? (
      <TracePanel
        steps={run.steps}
        meta={run.meta}
        running={run.running}
        gate={run.running ? null : view.gate}
        elapsedMs={run.running ? null : view.elapsed_ms ?? null}
        controls={view.rows.length}
        onCollapse={() => setTraceOpen(false)}
      />
    ) : run ? (
      <TraceSummary steps={run.steps} meta={run.meta} gate={view.gate} elapsedMs={view.elapsed_ms ?? null} controls={view.rows.length} onExpand={() => setTraceOpen(true)} />
    ) : null;

  return (
    <Shell>
      <PackageHeader view={view} />

      <SubmitBar isMock={isMock} running={running} submitting={submitting} error={submitErr} onSubmit={() => submit()} onReset={reset} />
      {isMock ? (
        <Disclosure className="mt-2 ml-1" label="Other scenarios" hint="what if the model fabricates a quote, someone injects instructions, or a file cannot be read">
          <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
            {SCENARIOS.map((s) => (
              <li key={s.id} className={`rounded-[10px] border bg-panel p-3 ${scenario === s.id ? "border-ink-2" : "hairline"}`}>
                <button className="btn btn-secondary btn-sm w-full" disabled={running || submitting} onClick={() => submit(s.id)}>
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
        <div className="min-w-0 order-2 xl:order-1">
          {scenario && scenario !== "architecture_v3" ? (
            <p className="mb-2 text-[12.5px] text-muted">
              Scenario: <span className="text-ink-2 font-medium">{SCENARIOS.find((s) => s.id === scenario)?.title ?? scenario}</span>
            </p>
          ) : null}
          <div className="mb-3">
            <CountLine text={countLine} className="text-[18px] leading-snug text-ink tracking-[-0.01em]" />
          </div>
          <ControlRows
            rows={displayRows}
            ordering={order ? "attention" : "id"}
            onOpen={(r) => openFinding(r.finding_id ?? r.control_id, false, r.control_id)}
            selectedId={openId}
            holdsDefaultOpen={pendingView ? undefined : allHold(rows) ? true : false}
            preserveOrder={Boolean(order)}
          />
          <p className="mt-2 text-[12px] text-muted">
            Select a row to open its finding card. Statuses come from the published display rules; this page renders them.
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
              />
            </div>
            <OpenTasks tasks={tasks} error={tasksErr} />
          </div>
        </div>

        <div className={`min-w-0 order-1 xl:order-2 xl:sticky xl:top-[72px] xl:self-start ${run ? "" : "hidden xl:block"}`}>
          <AnimatePresence initial={false} mode="wait">
            {trace ? (
              <motion.div key={run && (traceOpen || running) ? "panel" : "summary"} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={T_SLOW}>
                {trace}
              </motion.div>
            ) : (
              <motion.div key="empty" className="hidden xl:block" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={T_BASE}>
                <TraceEmpty />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <Drawer open={openId != null} onClose={closeFinding}>
        {openId ? (
          <FindingContainer key="drawer-card" id={openId} layout="drawer" onClose={closeFinding} onSelect={(id) => openFinding(id, true)} onChanged={onChanged} />
        ) : null}
      </Drawer>
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
}: {
  isMock: boolean;
  running: boolean;
  submitting: boolean;
  error: string | null;
  onSubmit: () => void;
  onReset: () => void;
}) {
  return (
    <div className="mt-5 flex flex-wrap items-center justify-between gap-4 rounded-[12px] border hairline bg-panel-cool px-5 py-3">
      <div className="min-w-[320px] flex-1 text-[13.5px] text-ink-2">
        {isMock ? (
          <>
            <span className="font-medium text-ink">Mock mode.</span> Submitting plays <span className="mono">architecture.md</span> v3 from the
            fixture into the mock Box folder.
          </>
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
        {isMock ? (
          <button className="btn btn-ghost btn-sm text-muted" onClick={onReset} disabled={running || submitting}>
            Reset to baseline
          </button>
        ) : null}
        <button className="btn btn-primary !h-10 !px-4" onClick={onSubmit} disabled={running || submitting}>
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
