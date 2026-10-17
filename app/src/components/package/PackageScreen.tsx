"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { ActionResponse, ControlRow, PackageView, TraceStep } from "@/lib/types";
import { api, followRun, type TaskItem } from "@/lib/client";
import { useKeel } from "@/components/AppProvider";
import { CountLine } from "@/components/ui/CountLine";
import { ErrorBlock, LoadingBlock } from "@/components/ui/States";
import { Drawer } from "@/components/ui/Drawer";
import { FindingContainer } from "@/components/finding/FindingContainer";
import { T_BASE, T_SLOW } from "@/lib/ui/motion";
import { PackageHeader } from "./PackageHeader";
import { ControlRows } from "./ControlRows";
import { TracePanel, TraceSummary, type TraceMeta } from "./TracePanel";
import { FolderProjection } from "./FolderProjection";
import { OpenTasks } from "./OpenTasks";

type RunUi = { runId: string; steps: TraceStep[]; meta: TraceMeta; running: boolean; error?: string };

const STAGGER_MS = 40;

export function PackageScreen() {
  const { config, setRun: setRunLabel } = useKeel();
  const [view, setView] = useState<PackageView | null>(null);
  const [rows, setRows] = useState<ControlRow[]>([]);
  const [countLine, setCountLine] = useState<string>("");
  const [err, setErr] = useState<string | null>(null);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [tasksErr, setTasksErr] = useState<string | null>(null);
  const [run, setRun] = useState<RunUi | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitErr, setSubmitErr] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [traceOpen, setTraceOpen] = useState(true);
  const pushedRef = useRef(false);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const cancelRunRef = useRef<(() => void) | null>(null);
  const rowsRef = useRef<ControlRow[]>([]);
  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);

  const mode = view?.mode ?? config?.mode;
  const isMock = mode === "mock";

  /** Apply a new view; rows whose status changed update one by one, 40 ms apart. */
  const applyView = useCallback((v: PackageView, stagger = true) => {
    setView(v);
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
    const prev = rowsRef.current;
    const sameShape = prev.length === v.rows.length && prev.every((r, i) => r.control_id === v.rows[i].control_id);
    if (!stagger || !sameShape) {
      setRows(v.rows);
      setCountLine(v.count_line);
      return;
    }
    const changed = v.rows
      .map((r, i) => ({ r, i }))
      .filter(({ r, i }) => JSON.stringify(r) !== JSON.stringify(prev[i]));
    if (changed.length === 0) {
      setRows(v.rows);
      setCountLine(v.count_line);
      return;
    }
    changed.forEach(({ r, i }, k) => {
      timersRef.current.push(
        setTimeout(() => {
          setRows((cur) => {
            const next = cur.slice();
            next[i] = r;
            return next;
          });
        }, k * STAGGER_MS),
      );
    });
    timersRef.current.push(setTimeout(() => setCountLine(v.count_line), changed.length * STAGGER_MS));
  }, []);

  const loadPackage = useCallback(
    async (stagger = true) => {
      try {
        const v = await api.package();
        applyView(v, stagger);
        setErr(null);
        return v;
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
        return null;
      }
    },
    [applyView],
  );

  const loadTasks = useCallback(async () => {
    try {
      setTasks(await api.tasks());
      setTasksErr(null);
    } catch (e) {
      setTasksErr(e instanceof Error ? e.message : String(e));
    }
  }, []);

  const startFollowing = useCallback(
    (runId: string, initialMeta: TraceMeta) => {
      cancelRunRef.current?.();
      setRun({ runId, steps: [], meta: initialMeta, running: true });
      setTraceOpen(true);
      api
        .run(runId)
        .then((m) =>
          setRun((r) =>
            r && r.runId === runId
              ? { ...r, meta: { ...r.meta, run_id: m.run_id, mode_label: m.mode_label, started_at: m.started_at, snapshot_id: m.snapshot_id, prior_snapshot_id: m.prior_snapshot_id, compressed_timing: m.compressed_timing } }
              : r,
          ),
        )
        .catch(() => {});
      let pollTimer: ReturnType<typeof setTimeout> | null = null;
      const pollPackage = async () => {
        await loadPackage(true);
        pollTimer = setTimeout(pollPackage, 700);
      };
      pollTimer = setTimeout(pollPackage, 250);
      const cancel = followRun(runId, {
        onStep: (step) => setRun((r) => (r && r.runId === runId ? { ...r, steps: [...r.steps, step] } : r)),
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
          setRunLabel({ run_id: m.run_id, mode_label: m.mode_label });
        },
        onDone: async () => {
          if (pollTimer) clearTimeout(pollTimer);
          setRun((r) => (r && r.runId === runId ? { ...r, running: false } : r));
          await loadPackage(true);
          loadTasks();
          // Give the rows the full width once the run is done; the summary stays one click away.
          timersRef.current.push(setTimeout(() => setTraceOpen(false), 2600));
        },
        onError: () => {},
      });
      cancelRunRef.current = () => {
        cancel();
        if (pollTimer) clearTimeout(pollTimer);
      };
    },
    [loadPackage, loadTasks, setRunLabel],
  );

  // Initial load; resume a run in progress or show the last run's trace.
  useEffect(() => {
    let alive = true;
    (async () => {
      const v = await loadPackage(false);
      loadTasks();
      if (!alive || !v?.trace_run_id) return;
      if (v.evaluation_state === "pending") {
        startFollowing(v.trace_run_id, { run_id: v.trace_run_id });
      } else {
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
          if (t.done) setTraceOpen(false);
        } catch {
          /* no trace available */
        }
      }
    })();
    return () => {
      alive = false;
      cancelRunRef.current?.();
      timersRef.current.forEach(clearTimeout);
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

  const openFinding = (id: string, replace = false) => {
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
  };

  const submit = async () => {
    setSubmitting(true);
    setSubmitErr(null);
    try {
      const res = await api.submit(isMock ? { scenario: "architecture_v3" } : {});
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
    setRunLabel(null);
    await loadPackage(true);
    loadTasks();
  };

  const onChanged = (r: ActionResponse) => {
    // Show the server's row and count line at once, then reconcile with the package.
    setRows((cur) => cur.map((row) => (row.control_id === r.row.control_id ? r.row : row)));
    if (r.count_line) setCountLine(r.count_line);
    setTimeout(() => {
      loadPackage(true);
      loadTasks();
    }, 300);
  };

  if (err && !view) {
    return (
      <Shell>
        <ErrorBlock title="Could not load the package view from /api/package" message={err} onRetry={() => loadPackage(false)} />
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

  const running = Boolean(run?.running) || view.evaluation_state === "pending";
  const showTrace = Boolean(run) && (traceOpen || Boolean(run?.running));

  return (
    <Shell>
      <PackageHeader view={view} />

      <SubmitBar
        isMock={isMock}
        running={running}
        submitting={submitting}
        error={submitErr}
        onSubmit={submit}
        onReset={reset}
      />

      <div className={`mt-6 grid gap-6 ${showTrace ? "xl:grid-cols-[minmax(0,1fr)_460px]" : ""}`}>
        <div className="min-w-0 order-2 xl:order-1">
          {run && !showTrace ? (
            <div className="mb-4">
              <TraceSummary steps={run.steps} meta={run.meta} gate={view.gate} elapsedMs={view.elapsed_ms ?? null} onExpand={() => setTraceOpen(true)} />
            </div>
          ) : null}
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
            <CountLine text={countLine} className="text-[18px] leading-snug text-ink tracking-[-0.01em]" />
            <span className="text-[12.5px] text-muted">
              Search tool: {view.search_tool.label}
              {view.search_tool.fallback ? " (fallback)" : ""}
            </span>
          </div>
          <ControlRows rows={rows} onOpen={(r) => openFinding(r.finding_id ?? r.control_id)} selectedId={openId} />
          <p className="mt-2 text-[12px] text-muted">
            Select a row to open its finding card. Statuses are computed by the published display rules; the page renders them.
          </p>

          <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
            <div>
              <h3 className="text-[14px] font-semibold text-ink mb-2">Projection into Box</h3>
              <FolderProjection projection={view.projection} currentSnapshotId={view.snapshot.snapshot_id} />
            </div>
            <OpenTasks tasks={tasks} error={tasksErr} />
          </div>
        </div>

        <AnimatePresence initial={false}>
          {showTrace && run ? (
            <motion.div
              key="trace"
              className="min-w-0 order-1 xl:order-2 xl:sticky xl:top-[72px] xl:self-start"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              transition={T_SLOW}
            >
              <TracePanel
                steps={run.steps}
                meta={run.meta}
                running={run.running}
                gate={run.running ? null : view.gate}
                elapsedMs={run.running ? null : view.elapsed_ms ?? null}
                onCollapse={() => setTraceOpen(false)}
              />
            </motion.div>
          ) : null}
        </AnimatePresence>
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
          />
        ) : null}
      </Drawer>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-[1360px] px-6 lg:px-10 pt-8 pb-16">{children}</div>;
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
    <div className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-[12px] border hairline bg-panel-cool px-5 py-3.5">
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
