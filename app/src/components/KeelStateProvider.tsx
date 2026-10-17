"use client";

/**
 * UI v4 state: one provider for the Box page, the owl and the panel. It owns the package view, run following,
 * the labelled replay, the owl's state, badge and bubble, and the panel's level history. Nothing here composes a
 * status label or a count: badge and summary come from the engine (`open_decisions`, `decision_summary`), the
 * bubble from each step's `bubble`.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { AppConfig, ControlRow, PackageFile, PackageView, Snapshot, SubmitResponse, TraceStep } from "@/lib/types";
import { ApiError, api, clearFindingCache, followRun, isAbort, prefetchFindings, type RunState } from "@/lib/client";
import { useKeel } from "@/components/AppProvider";

export type OwlState = "idle" | "working" | "attention" | "clear" | "quarantine" | "offline";
export type MenuScreen = "how_it_works" | "rules" | "record" | "how_checked" | "scenarios" | "replay";
export type PanelView = { kind: "level1" } | { kind: "control"; controlId: string } | { kind: "menu"; screen: MenuScreen };

export type RunInfo = {
  runId: string;
  steps: TraceStep[];
  running: boolean;
  modeLabel: "Live" | "Mock" | "Replay";
  summary?: { evaluated: number; not_evaluated: number };
  /** Extra (additive): run timing and snapshot for "How it was checked". */
  startedAt?: string;
  totalDurationMs?: number;
  snapshotId?: string;
  priorSnapshotId?: string;
  compressedTiming?: boolean;
};

export type UploadVersionRequest = { file_name: string; file_id?: string; scenario?: string; content_base64?: string; allow_empty?: boolean };

/** Live upload partial success (Codex 14): the review started, but a side step failed. Shown, not treated as failure. */
type UploadWarning = { code: string; message: string };

/** Extra (additive): the Box row's upload progress. */
export type UploadState = { file_name: string; phase: "uploading" | "done"; durationMs: number; startedAt: number } | null;

export type KeelState = {
  config: AppConfig | null;
  pkg: PackageView | null;
  pkgError: string | null;
  refreshPackage: () => Promise<void>;

  run: RunInfo | null;
  uploadVersion: (req: UploadVersionRequest) => Promise<void>;
  startReplay: (runId: string) => Promise<void>;
  endReplay: () => void;
  replay: { runId: string } | null;

  owl: OwlState;
  badge: number;
  bubble: { text: string; sticky: boolean } | null;
  dismissBubble: () => void;

  panel: { open: boolean; view: PanelView; history: PanelView[] };
  openPanel: (view?: PanelView) => void;
  closePanel: () => void;
  pushView: (view: PanelView) => void;
  back: () => void;

  afterAction: () => Promise<void>;
  reset: () => Promise<void>;
  busy: boolean;

  // Additive extras (not in the contract; safe to ignore).
  /**
   * Owns `busy` from before the action's POST until the package refresh completes (codex #9). Rejects when another
   * operation is in flight. Lane B wraps api.action calls in it: `await runAction(() => api.action(body))`.
   */
  runAction: <T>(fn: () => Promise<T>) => Promise<T>;
  /** False while a live run, an upload or an action is in flight: Replay is refused then (codex #3). */
  canReplay: boolean;
  /** The run transport or the package API is failing; the owl reads offline. */
  transportDown: boolean;
  upload: UploadState;
  uploadError: string | null;
  /** A live upload succeeded with a warning (VERSION_NOTE_FAILED, MAP_SAVE_FAILED, MAP_READ_FAILED): the API's message. */
  uploadWarning: string | null;
  dismissUploadError: () => void;
  replayError: string | null;
  owlRef: React.RefObject<HTMLButtonElement | null>;
  isMock: boolean;
};

const LEVEL1: PanelView = { kind: "level1" };
const BUBBLE_FADE_MS = 4000;
const BUBBLE_MIN_MS = 650;
/** After the run is done, the queue drains within about this long; lines are shortened to BUBBLE_FAST_MS, never dropped. */
const BUBBLE_DRAIN_BUDGET_MS = 3000;
const BUBBLE_FAST_MS = 400;
const MOCK_UPLOAD_MS = 1200;
const IDLE_POLL_MS = 5000;
const OFFLINE_TEXT = "I can't reach Keel.";
/** Every package or run read has a deadline, so no await can strand busy state (codex #6). */
const READ_DEADLINE_MS = 8000;
const RESET_DEADLINE_MS = 15000;
const ACTION_DEADLINE_MS = 30000;
/** The upload POST is aborted after this; the outcome is then unknown and reconciled from the package (codex #8). */
const UPLOAD_TIMEOUT_MS = 30000;
/** The row's cells fade in over this long after the upload; the first bubble waits for it. */
const UPLOAD_SETTLE_MS = 300;
/** Transport health (codex #7): this many failed run reads, or this long without any run event, reads as offline. */
const TRANSPORT_FAILS_OFFLINE = 3;
const STREAM_SILENCE_MS = 12000;
const WATCHDOG_MS = 3000;

const anyPending = (v: PackageView) => v.evaluation_state === "pending" || v.rows.some((r) => r.status.kind === "pending_recheck");
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

class DeadlineError extends Error {
  constructor() {
    super("Keel did not answer in time.");
  }
}

/** Run `fn` with an abort signal that fires after `ms`; a deadline rejects with DeadlineError. */
async function withDeadline<T>(fn: (signal: AbortSignal) => Promise<T>, ms: number): Promise<T> {
  const ctrl = new AbortController();
  let timedOut = false;
  const t = setTimeout(() => {
    timedOut = true;
    ctrl.abort();
  }, ms);
  try {
    return await fn(ctrl.signal);
  } catch (e) {
    if (timedOut) throw new DeadlineError();
    throw e;
  } finally {
    clearTimeout(t);
  }
}

/** For calls without a signal: the promise keeps running, but the caller stops waiting after `ms`. */
function raceDeadline<T>(p: Promise<T>, ms: number): Promise<T> {
  let t: ReturnType<typeof setTimeout> | null = null;
  return Promise.race([p, new Promise<never>((_, reject) => (t = setTimeout(() => reject(new DeadlineError()), ms)))]).finally(() => {
    if (t) clearTimeout(t);
  });
}

/**
 * POST /api/upload-version with an abort signal (api.uploadVersion takes none). Same body and error shape as the
 * client module: errors are ApiError with the route's `{ error: { code, message } }` body.
 */
async function postUploadVersion(body: UploadVersionRequest, signal: AbortSignal): Promise<SubmitResponse> {
  const res = await fetch("/api/upload-version", {
    method: "POST",
    cache: "no-store",
    signal,
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let parsed: unknown = text;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    /* plain text */
  }
  if (!res.ok) {
    const e = parsed && typeof parsed === "object" ? (parsed as { error?: { message?: string } | string }).error : null;
    const m = typeof e === "string" ? e : e?.message ?? `${res.status} ${res.statusText}`;
    throw new ApiError(res.status, m, parsed);
  }
  return parsed as SubmitResponse;
}

/** The toast line for a failed upload: the API's own message, with a plainer line for a busy package. */
function uploadErrorText(e: unknown): string {
  if (e instanceof ApiError) {
    const code = e.body && typeof e.body === "object" ? (e.body as { error?: { code?: string } }).error?.code : undefined;
    if (code === "PACKAGE_BUSY" || code === "RUN_ACTIVE" || (e.status === 409 && !code)) return BUSY_TEXT;
    // The mock fixture's version was already uploaded: say what to do in the UI's terms, not the route's.
    if (code === "ALREADY_SUBMITTED") return "This version is already uploaded. Reset the demo from the Keel menu to upload it again.";
    return e.message;
  }
  return msg(e);
}
const BUSY_TEXT = "A re-check is already running on this folder.";
const REPLAY_BUSY_TEXT = "Replay is available once the current re-check or action finishes.";

/** The input gate line for "How it was checked" in a replay, from the recorded steps only. */
function gateFromSteps(steps: TraceStep[]): PackageView["gate"] {
  const g = steps.find((s) => s.kind === "input_gate");
  return g ? { ran: true, label: g.label } : { ran: false, label: "Not recorded for this run" };
}

const Ctx = createContext<KeelState | null>(null);

type Follower = { token: number; runId: string; cancel: () => void; seen: number; lastEventAt: number; fails: number; finished: boolean; finish: (final?: RunState) => void; feed: (steps: TraceStep[]) => void };

export function KeelStateProvider({ children }: { children: React.ReactNode }) {
  const { config, setRun: setRunLabel } = useKeel();
  const [livePkg, setLivePkg] = useState<PackageView | null>(null);
  const [pkgError, setPkgError] = useState<string | null>(null);
  const [transportDown, setTransportDown] = useState(false);
  const [run, setRun] = useState<RunInfo | null>(null);
  const [replay, setReplay] = useState<{ runId: string } | null>(null);
  const [replayPkg, setReplayPkg] = useState<PackageView | null>(null);
  /** The recorded outcome's badge; null until the replay ends or when the outcome does not carry it. */
  const [replayBadge, setReplayBadge] = useState<number | null>(null);
  const [bubble, setBubble] = useState<{ text: string; sticky: boolean } | null>(null);
  const [panel, setPanel] = useState<{ open: boolean; view: PanelView; history: PanelView[] }>({ open: false, view: LEVEL1, history: [] });
  const [actionCount, setActionCount] = useState(0);
  const [upload, setUpload] = useState<UploadState>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadWarning, setUploadWarning] = useState<string | null>(null);
  const [replayError, setReplayError] = useState<string | null>(null);

  const owlRef = useRef<HTMLButtonElement | null>(null);
  const pkgRef = useRef<PackageView | null>(null);
  const runRef = useRef<RunInfo | null>(null);
  const replayRef = useRef<{ runId: string } | null>(null);
  const savedRunRef = useRef<RunInfo | null>(null);
  const bubbleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ---- lifecycle (codex #5) ----
  // One epoch per lifecycle: Reset, start/end replay and unmount bump it. Every async operation captures the epoch
  // before its first await and checks `alive(op)` after every await, before any setState, timer or follower.
  const mountedRef = useRef(true);
  const epochRef = useRef(0);
  const opTimers = useRef(new Set<ReturnType<typeof setTimeout>>());
  const sleepers = useRef(new Set<(ok: boolean) => void>());
  const followerRef = useRef<Follower | null>(null);
  const followTokenRef = useRef(0);
  /** Admission flags, read synchronously (state lags a render). */
  const uploadingRef = useRef(false);
  const actionCountRef = useRef(0);

  const alive = useCallback((op: number) => mountedRef.current && op === epochRef.current, []);
  const clearOpTimers = useCallback(() => {
    opTimers.current.forEach(clearTimeout);
    opTimers.current.clear();
    sleepers.current.forEach((r) => r(false));
    sleepers.current.clear();
  }, []);
  const stopFollowing = useCallback(() => {
    followerRef.current?.cancel();
    followerRef.current = null;
  }, []);
  /** A new epoch: pending operations, their timers and the follower stop. Returns the new epoch. */
  const bumpEpoch = useCallback(() => {
    epochRef.current++;
    clearOpTimers();
    stopFollowing();
    return epochRef.current;
  }, [clearOpTimers, stopFollowing]);
  /** A timer owned by an operation: cleared with its epoch, never fires for a dead one. */
  const later = useCallback(
    (op: number, ms: number, fn: () => void) => {
      const id = setTimeout(() => {
        opTimers.current.delete(id);
        if (alive(op)) fn();
      }, ms);
      opTimers.current.add(id);
    },
    [alive],
  );
  /** Resolves true after `ms`, or false at once when the epoch ends. */
  const sleep = useCallback(
    (op: number, ms: number) =>
      new Promise<boolean>((resolve) => {
        const done = (ok: boolean) => {
          sleepers.current.delete(done);
          resolve(ok && alive(op));
        };
        sleepers.current.add(done);
        const id = setTimeout(() => {
          opTimers.current.delete(id);
          done(true);
        }, ms);
        opTimers.current.add(id);
      }),
    [alive],
  );

  const beginAction = useCallback(() => {
    actionCountRef.current++;
    setActionCount(actionCountRef.current);
  }, []);
  const endAction = useCallback(() => {
    actionCountRef.current = Math.max(0, actionCountRef.current - 1);
    setActionCount(actionCountRef.current);
  }, []);
  /** Any operation in flight, read synchronously for admission. */
  const busyNow = () => Boolean(followerRef.current) || uploadingRef.current || actionCountRef.current > 0;

  useEffect(() => {
    runRef.current = run;
  }, [run]);

  const isMock = (livePkg?.mode ?? config?.mode) === "mock";

  // ---- bubble ----
  // Steps often arrive in bursts (the stream replays what happened during the POST), so each line is held for
  // at least BUBBLE_MIN_MS before the next replaces it. Order is kept; nothing is composed here.
  const queueRef = useRef<{ text: string; sticky: boolean }[]>([]);
  const pumpTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastShownAt = useRef(0);
  const pumpRef = useRef<() => void>(() => {});
  /** When the run's last step arrived; the remaining queue is compressed to drain inside the budget. */
  const doneAtRef = useRef<number | null>(null);
  /** Lines wait until the uploaded row shows its new version (Infinity while the upload finishes). */
  const holdUntilRef = useRef(0);

  const pump = useCallback(() => {
    if (pumpTimer.current || !mountedRef.current) return;
    const next = queueRef.current[0];
    if (!next) return;
    const now = Date.now();
    if (holdUntilRef.current === Infinity) return; // released by the upload, which pumps again
    let dwell = BUBBLE_MIN_MS;
    if (doneAtRef.current !== null) {
      const left = BUBBLE_DRAIN_BUDGET_MS - (now - doneAtRef.current);
      if (queueRef.current.length * BUBBLE_MIN_MS > left) dwell = BUBBLE_FAST_MS;
    }
    const wait = Math.max(0, lastShownAt.current + dwell - now, holdUntilRef.current - now);
    pumpTimer.current = setTimeout(() => {
      pumpTimer.current = null;
      if (!mountedRef.current) return;
      const item = queueRef.current.shift();
      if (!item) return;
      if (bubbleTimer.current) clearTimeout(bubbleTimer.current);
      bubbleTimer.current = null;
      lastShownAt.current = Date.now();
      // An empty item ends the step lines without a summary.
      setBubble(item.text ? item : null);
      if (item.text && !item.sticky) bubbleTimer.current = setTimeout(() => mountedRef.current && setBubble(null), BUBBLE_FADE_MS);
      if (!item.sticky) doneAtRef.current = null;
      pumpRef.current();
    }, wait);
  }, []);
  useEffect(() => {
    pumpRef.current = pump;
  }, [pump]);

  const showBubble = useCallback(
    (text: string | undefined | null, sticky: boolean) => {
      if (!text) return;
      // Every step line is kept, in order; the queue drains at BUBBLE_MIN_MS per line.
      queueRef.current.push({ text, sticky });
      pump();
    },
    [pump],
  );
  /** After the last step: the engine's summary if there is one, else the step lines simply end. */
  const endSteps = useCallback(
    (summary: string | undefined | null) => {
      queueRef.current.push({ text: summary ?? "", sticky: false });
      doneAtRef.current = Date.now();
      pump();
    },
    [pump],
  );
  const releaseBubbles = useCallback((afterMs: number) => {
    holdUntilRef.current = Date.now() + afterMs;
    pumpRef.current();
  }, []);
  const dismissBubble = useCallback(() => {
    queueRef.current = [];
    if (pumpTimer.current) clearTimeout(pumpTimer.current);
    pumpTimer.current = null;
    if (bubbleTimer.current) clearTimeout(bubbleTimer.current);
    bubbleTimer.current = null;
    lastShownAt.current = 0;
    doneAtRef.current = null;
    holdUntilRef.current = 0;
    setBubble(null);
  }, []);

  // ---- package reads (codex #4, #6) ----
  // Every read has a deadline and a request id; only a response newer than the last applied one is applied, and
  // only while its operation's epoch is current.
  const pkgReqSeq = useRef(0);
  const pkgApplied = useRef(0);

  const applyIfNewest = useCallback((v: PackageView, id: number) => {
    if (id <= pkgApplied.current) return false;
    pkgApplied.current = id;
    pkgRef.current = v;
    setLivePkg(v);
    return true;
  }, []);

  /** One package read for operation `op`. `apply: false` returns it for the caller to apply with applyIfNewest. */
  const readPkg = useCallback(
    async (op: number, opts: { apply?: boolean } = {}): Promise<{ v: PackageView | null; id: number }> => {
      const id = ++pkgReqSeq.current;
      try {
        const v = await withDeadline((signal) => api.package(signal), READ_DEADLINE_MS);
        if (!alive(op)) return { v: null, id };
        setPkgError(null);
        if (opts.apply !== false) applyIfNewest(v, id);
        return { v, id };
      } catch (e) {
        if (alive(op) && !(isAbort(e) && !(e instanceof DeadlineError))) setPkgError(msg(e));
        return { v: null, id };
      }
    },
    [alive, applyIfNewest],
  );

  const refreshPackage = useCallback(async () => {
    await readPkg(epochRef.current);
  }, [readPkg]);

  // ---- run following (codex #7) ----
  const runReqSeq = useRef(0);

  const startFollowing = useCallback(
    (runId: string, op: number) => {
      if (!alive(op)) return;
      stopFollowing();
      const token = ++followTokenRef.current;
      const current = () => alive(op) && followerRef.current?.token === token;
      clearFindingCache();
      const modeLabel: RunInfo["modeLabel"] = (pkgRef.current?.mode ?? config?.mode) === "live" ? "Live" : "Mock";
      setRun({ runId, steps: [], running: true, modeLabel });
      let refreshedOnApply = false;

      const healthy = (f: Follower) => {
        f.fails = 0;
        f.lastEventAt = Date.now();
        setTransportDown(false);
      };

      const handleStep = (step: TraceStep, index: number) => {
        const f = followerRef.current;
        if (!f || !current() || index < f.seen) return; // the stream and the watchdog may both deliver a step
        f.seen = index + 1;
        healthy(f);
        setRun((r) => (r && r.runId === runId ? { ...r, steps: [...r.steps, step] } : r));
        if (step.bubble) showBubble(step.bubble, true);
        if (!refreshedOnApply && (step.kind === "findings_applied" || step.kind === "evaluation_completed")) {
          refreshedOnApply = true;
          readPkg(op);
        }
      };

      const finishRun = async (final?: RunState) => {
        const f = followerRef.current;
        if (!f || !current() || f.finished) return;
        f.finished = true;
        f.cancel();
        setRun((r) =>
          r && r.runId === runId
            ? { ...r, running: false, steps: final?.steps?.length ? final.steps : r.steps, summary: final?.summary ?? r.summary, totalDurationMs: final?.total_duration_ms ?? r.totalDurationMs }
            : r,
        );
        // Findings land before projection and tasks; read until the engine stops reporting pending (bounded).
        let v: PackageView | null = null;
        for (let i = 0; i < 16; i++) {
          const r = await readPkg(op);
          if (!alive(op)) return;
          v = r.v;
          if (v && !anyPending(v)) break;
          if (!(await sleep(op, 250))) return;
        }
        if (followerRef.current?.token === token) followerRef.current = null;
        if (v) prefetchFindings(v.rows.filter((r) => r.status.kind !== "verified_holds").map((r) => r.finding_id ?? r.control_id));
        endSteps(v?.decision_summary);
      };

      const cancel = followRun(runId, {
        onStep: (step, index) => handleStep(step, index),
        onMeta: (m) => {
          const f = followerRef.current;
          if (!f || !current()) return;
          healthy(f);
          setRun((r) =>
            r && r.runId === runId
              ? { ...r, modeLabel: m.mode_label, startedAt: m.started_at, snapshotId: m.snapshot_id, priorSnapshotId: m.prior_snapshot_id, compressedTiming: m.compressed_timing, totalDurationMs: m.done ? m.total_duration_ms : r.totalDurationMs }
              : r,
          );
          setRunLabel({ run_id: m.run_id, mode_label: m.mode_label });
        },
        onDone: (final) => {
          finishRun(final);
        },
        onError: () => {
          const f = followerRef.current;
          if (!f || !current()) return;
          f.fails++;
          if (f.fails >= TRANSPORT_FAILS_OFFLINE) setTransportDown(true);
        },
        onGone: () => {
          if (!current()) return;
          followerRef.current = null;
          setRun(null);
          setRunLabel(null);
          dismissBubble();
          readPkg(op);
        },
      });
      followerRef.current = {
        token,
        runId,
        cancel,
        seen: 0,
        lastEventAt: Date.now(),
        fails: 0,
        finished: false,
        finish: finishRun,
        feed: (steps) => steps.forEach((s, i) => handleStep(s, i)),
      };
    },
    [alive, config?.mode, dismissBubble, endSteps, readPkg, setRunLabel, showBubble, sleep, stopFollowing],
  );

  // Watchdog: a stream that stays open but silent, or a transport that keeps failing, is probed with a direct read.
  // A good read reconciles (missing steps, done); a failed one counts toward offline.
  useEffect(() => {
    const t = setInterval(async () => {
      const f = followerRef.current;
      if (!f || f.finished || Date.now() - f.lastEventAt < STREAM_SILENCE_MS) return;
      const token = f.token;
      try {
        const r = await withDeadline((signal) => api.run(f.runId, signal), READ_DEADLINE_MS);
        if (followerRef.current?.token !== token) return;
        f.fails = 0;
        f.lastEventAt = Date.now();
        setTransportDown(false);
        f.feed(r.steps);
        if (r.done) f.finish(r);
      } catch {
        if (followerRef.current?.token !== token) return;
        f.fails++;
        f.lastEventAt = Date.now() - STREAM_SILENCE_MS + WATCHDOG_MS; // probe again next tick
        if (f.fails >= TRANSPORT_FAILS_OFFLINE) setTransportDown(true);
      }
    }, WATCHDOG_MS);
    return () => clearInterval(t);
  }, []);

  /** A finished run's stored steps, for "How it was checked". Never replaces a replay or a followed run (codex #4). */
  const loadStoredRun = useCallback(
    async (runId: string, op: number) => {
      const id = ++runReqSeq.current;
      try {
        const t = await withDeadline((signal) => api.run(runId, signal), READ_DEADLINE_MS);
        if (!alive(op) || id !== runReqSeq.current || replayRef.current || followerRef.current) return;
        setRun({ runId: t.run_id, steps: t.steps, running: false, modeLabel: t.mode_label, summary: t.summary, startedAt: t.started_at, totalDurationMs: t.total_duration_ms, snapshotId: t.snapshot_id, priorSnapshotId: t.prior_snapshot_id, compressedTiming: t.compressed_timing });
        setRunLabel({ run_id: t.run_id, mode_label: t.mode_label });
      } catch {
        if (!alive(op) || id !== runReqSeq.current || replayRef.current || followerRef.current) return;
        setRun(null);
      }
    },
    [alive, setRunLabel],
  );

  // Initial load: resume a run in progress, or show the last run's steps. Unmount ends every operation.
  useEffect(() => {
    mountedRef.current = true;
    const op = epochRef.current;
    (async () => {
      const { v } = await readPkg(op);
      if (!alive(op) || !v || !v.trace_run_id) return;
      if (anyPending(v)) startFollowing(v.trace_run_id, op);
      else loadStoredRun(v.trace_run_id, op);
    })();
    const epoch = epochRef;
    return () => {
      mountedRef.current = false;
      epoch.current++;
      clearOpTimers();
      stopFollowing();
      if (bubbleTimer.current) clearTimeout(bubbleTimer.current);
      if (pumpTimer.current) clearTimeout(pumpTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Passive sync: picks up a run started elsewhere, a Box task response ingested, or the API coming back.
  useEffect(() => {
    const t = setInterval(async () => {
      if (busyNow() || replayRef.current || document.visibilityState !== "visible") return;
      const op = epochRef.current;
      const { v, id } = await readPkg(op, { apply: false });
      if (!v || !alive(op) || busyNow() || replayRef.current) return;
      const cur = pkgRef.current;
      if (anyPending(v) && v.trace_run_id && v.trace_run_id !== runRef.current?.runId) {
        applyIfNewest(v, id);
        startFollowing(v.trace_run_id, op);
        return;
      }
      if (!cur || JSON.stringify(cur) !== JSON.stringify(v)) {
        const prevOpen = cur?.open_decisions ?? 0;
        if (!applyIfNewest(v, id)) return;
        if ((v.open_decisions ?? 0) > prevOpen) showBubble(v.decision_summary, false);
        if (v.trace_run_id && v.trace_run_id !== runRef.current?.runId) loadStoredRun(v.trace_run_id, op);
        if (!v.trace_run_id && runRef.current) setRun(null);
      }
    }, IDLE_POLL_MS);
    return () => clearInterval(t);
  }, [alive, applyIfNewest, loadStoredRun, readPkg, showBubble, startFollowing]);

  // ---- replay (codex #3, #5, #11) ----
  const clearReplayState = useCallback(() => {
    replayRef.current = null;
    setReplay(null);
    setReplayPkg(null);
    setReplayBadge(null);
  }, []);

  const endReplay = useCallback(() => {
    if (!replayRef.current) return;
    const op = bumpEpoch();
    clearReplayState();
    setReplayError(null);
    // The saved run was finished when the replay started (replay is refused during a live run).
    const prev = savedRunRef.current;
    savedRunRef.current = null;
    setRun(prev ? { ...prev, running: false } : null);
    setRunLabel(prev ? { run_id: prev.runId, mode_label: prev.modeLabel } : null);
    dismissBubble();
    readPkg(op);
  }, [bumpEpoch, clearReplayState, dismissBubble, readPkg, setRunLabel]);

  const startReplay = useCallback(
    async (runId: string) => {
      if (busyNow()) {
        setReplayError(REPLAY_BUSY_TEXT);
        return;
      }
      setReplayError(null);
      const wasReplaying = Boolean(replayRef.current);
      const op = bumpEpoch(); // ends a previous replay's timers and any pending replay request
      let t: RunState;
      try {
        t = await withDeadline((signal) => api.run(runId, signal), READ_DEADLINE_MS);
      } catch (e) {
        if (alive(op)) setReplayError(msg(e));
        return;
      }
      if (!alive(op)) return;
      if (busyNow()) {
        setReplayError(REPLAY_BUSY_TEXT);
        return;
      }
      const outcome = t.outcome;
      const base = pkgRef.current;
      if (!outcome?.rows || !base) {
        setReplayError("This run has no recorded outcome, so it cannot be replayed.");
        return;
      }
      if (!wasReplaying) savedRunRef.current = runRef.current;
      const key = `replay:${t.run_id}`;
      replayRef.current = { runId: t.run_id };
      setReplay({ runId: t.run_id });
      setRunLabel({ run_id: t.run_id, mode_label: "Replay" });
      dismissBubble();
      // The replay opens on level 1: no live control card is ever shown beside recorded rows.
      setPanel((p) => ({ ...p, view: LEVEL1, history: [] }));

      // Built from the recorded run only. From the live package it keeps the folder identity (header, profile, mode)
      // and the engine's constant pending status; nothing time-varying.
      const snap: Snapshot = outcome.snapshot ?? {
        snapshot_id: outcome.snapshot_id,
        captured_at: t.started_at,
        control_profile_version: base.profile.profile_version,
        files: [],
        manifest_hash: "",
      };
      const files: PackageFile[] =
        outcome.files ??
        snap.files.map((f) => ({ file_id: f.fileId, file_name: f.fileName, version_id: f.versionId, version_label: f.versionLabel, control_ids: [], open_decisions: 0, recorded_decisions: 0 }));
      const recorded: PackageView = {
        mode: base.mode,
        header: base.header,
        profile: base.profile,
        snapshot: snap,
        prior_snapshot_id: outcome.prior_snapshot_id,
        evaluation_state: "complete",
        rows: outcome.rows,
        count_line: outcome.count_line ?? "",
        counts: {},
        projection: null, // the details pane says the metadata is not shown for a replay
        trace_run_id: t.run_id,
        elapsed_ms: t.total_duration_ms,
        gate: gateFromSteps(t.steps),
        search_tool: { label: "", fallback: false },
        prior_count_line: outcome.prior_count_line,
        awaiting_drafts: [],
        files,
        open_decisions: outcome.open_decisions,
        decision_summary: outcome.decision_summary,
        header_line: outcome.header_line,
        holds_line: outcome.holds_line,
        changed_files: outcome.changed_files,
        changed_line: outcome.changed_line,
        pending_status: base.pending_status,
      };
      const pendingStatus = base.pending_status;
      const pendingRows: ControlRow[] = pendingStatus ? outcome.rows.map((r) => ({ ...r, status: { ...pendingStatus, struck: undefined } })) : outcome.rows;
      setReplayPkg({
        ...recorded,
        evaluation_state: "pending",
        rows: pendingRows,
        count_line: outcome.pending_count_line,
        files: files.map((f) => ({ ...f, open_decisions: 0, recorded_decisions: 0, hover_line: undefined })),
        open_decisions: 0,
        decision_summary: undefined,
        header_line: undefined,
        holds_line: undefined,
      });
      setReplayBadge(null);
      setRun({ runId: key, steps: [], running: true, modeLabel: "Replay", summary: t.summary, startedAt: t.started_at, totalDurationMs: t.total_duration_ms, snapshotId: t.snapshot_id, priorSnapshotId: t.prior_snapshot_id, compressedTiming: t.compressed_timing });

      let flipped = false;
      const flip = () => {
        if (flipped) return;
        flipped = true;
        setReplayPkg(recorded);
      };
      let at = 0;
      t.steps.forEach((s) => {
        const end = s.kind === "agent_evaluation" ? s.startMs : s.startMs + (s.durationMs ?? 0);
        at = Math.max(at, end);
        later(op, at, () => {
          setRun((r) => (r && r.runId === key ? { ...r, steps: [...r.steps, s] } : r));
          if (s.bubble) showBubble(s.bubble, true);
          if (s.kind === "findings_applied" || s.kind === "evaluation_completed") flip();
        });
      });
      const total = Math.max(at, t.total_duration_ms ?? 0);
      later(op, total + 60, () => {
        setRun((r) => (r && r.runId === key ? { ...r, running: false } : r));
        flip();
        setReplayBadge(outcome.open_decisions ?? null);
        endSteps(outcome.decision_summary);
      });
    },
    [alive, bumpEpoch, dismissBubble, endSteps, later, setRunLabel, showBubble],
  );

  // ---- upload (codex #5, #6, #8) ----
  const uploadVersion = useCallback(
    async (req: UploadVersionRequest) => {
      if (busyNow()) {
        setUploadError(BUSY_TEXT);
        return;
      }
      uploadingRef.current = true;
      if (replayRef.current) endReplay();
      const op = epochRef.current;
      setUploadError(null);
      setUploadWarning(null);
      dismissBubble();
      const mock = (pkgRef.current?.mode ?? config?.mode) !== "live";
      const startedAt = Date.now();
      setUpload({ file_name: req.file_name, phase: "uploading", durationMs: mock ? MOCK_UPLOAD_MS : 0, startedAt });
      let handedOff = false;
      const finishUpload = () => {
        if (!alive(op)) return;
        uploadingRef.current = false;
        setUpload((u) => (u && u.startedAt === startedAt ? null : u));
      };
      const ctrl = new AbortController();
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        ctrl.abort();
      }, UPLOAD_TIMEOUT_MS);
      try {
        // Box-style progress first in mock; the version and the run start when it completes.
        if (mock && !(await sleep(op, MOCK_UPLOAD_MS))) return;
        const body = mock ? { file_name: req.file_name, file_id: req.file_id, scenario: req.scenario ?? "architecture_v3" } : req;
        let res: SubmitResponse;
        try {
          res = await postUploadVersion(body, ctrl.signal);
        } catch (e) {
          if (!alive(op)) return;
          if (!timedOut) throw e;
          // Timed out: the server may still have written the version and started a run. Reconcile before Upload
          // is enabled again: follow the run if one started, else say the outcome is unknown.
          const { v } = await readPkg(op);
          if (!alive(op)) return;
          if (v && anyPending(v) && v.trace_run_id) {
            startFollowing(v.trace_run_id, op);
            return;
          }
          setUploadError("The upload took too long to confirm. The folder shows its current state; upload again if the new version is not there.");
          return;
        }
        if (!alive(op)) return;
        const warnings = (res as SubmitResponse & { warnings?: UploadWarning[] }).warnings;
        if (warnings?.length) setUploadWarning(warnings.map((w) => w.message).join(" "));
        setUpload({ file_name: req.file_name, phase: "done", durationMs: 0, startedAt });
        // Follow at once; the step lines queue up and are released once the row reads the new version.
        holdUntilRef.current = Infinity;
        startFollowing(res.run_id, op);
        handedOff = true;
        // The snapshot pointer moves just after the POST returns: read until the package reports the run's snapshot
        // (bounded in count and, through the read deadline, in time). Cleanup is in finally.
        (async () => {
          try {
            for (let i = 0; i < 12; i++) {
              const r = await readPkg(op, { apply: false });
              if (!alive(op)) return;
              if (r.v?.snapshot.snapshot_id === res.snapshot_id) {
                if (pkgRef.current?.snapshot.snapshot_id !== res.snapshot_id) applyIfNewest(r.v, r.id);
                break;
              }
              if (!(await sleep(op, 150))) return;
            }
            // "Upload complete" for 200 ms, then the row's cells show the new version; the first line follows.
            await sleep(op, 200);
          } finally {
            finishUpload();
            if (alive(op)) releaseBubbles(UPLOAD_SETTLE_MS);
          }
        })();
      } catch (e) {
        if (!alive(op)) return;
        // Any failure: the bar stops, the row shows the current version again, Upload is enabled, a toast explains.
        setUploadError(uploadErrorText(e));
        readPkg(op);
      } finally {
        clearTimeout(timer);
        if (!handedOff) {
          holdUntilRef.current = holdUntilRef.current === Infinity ? 0 : holdUntilRef.current;
          finishUpload();
        }
      }
    },
    [alive, applyIfNewest, config?.mode, dismissBubble, endReplay, readPkg, releaseBubbles, sleep, startFollowing],
  );

  const dismissUploadError = useCallback(() => {
    setUploadError(null);
    setUploadWarning(null);
  }, []);

  // ---- actions and reset (codex #6, #9) ----
  /** Package refresh after a human action: the finding cache is cleared and a changed badge shows the summary. */
  const refreshAfterAction = useCallback(
    async (op: number) => {
      clearFindingCache();
      const before = pkgRef.current?.open_decisions ?? 0;
      const { v } = await readPkg(op);
      if (v && alive(op) && (v.open_decisions ?? 0) !== before) showBubble(v.decision_summary, false);
    },
    [alive, readPkg, showBubble],
  );

  const afterAction = useCallback(async () => {
    beginAction();
    try {
      await refreshAfterAction(epochRef.current);
    } finally {
      endAction();
    }
  }, [beginAction, endAction, refreshAfterAction]);

  const runAction = useCallback(
    async <T,>(fn: () => Promise<T>): Promise<T> => {
      if (busyNow() || replayRef.current) throw new Error("Keel is busy with another operation; try again in a moment.");
      beginAction();
      const op = epochRef.current;
      try {
        const result = await raceDeadline(fn(), ACTION_DEADLINE_MS);
        if (alive(op)) await refreshAfterAction(op);
        return result;
      } finally {
        endAction();
      }
    },
    [alive, beginAction, endAction, refreshAfterAction],
  );

  const reset = useCallback(async () => {
    const op = bumpEpoch(); // ends replay timers, a pending upload or replay request, and the follower
    clearReplayState();
    savedRunRef.current = null;
    uploadingRef.current = false;
    beginAction();
    try {
      try {
        await raceDeadline(api.reset(), RESET_DEADLINE_MS);
      } catch (e) {
        if (alive(op)) setPkgError(msg(e));
      }
      if (!alive(op)) return;
      setRun(null);
      setRunLabel(null);
      setUpload(null);
      setUploadError(null);
      setReplayError(null);
      setTransportDown(false);
      dismissBubble();
      clearFindingCache();
      setPanel((p) => ({ ...p, view: LEVEL1, history: [] }));
      await readPkg(op);
    } finally {
      endAction();
    }
  }, [alive, beginAction, bumpEpoch, clearReplayState, dismissBubble, endAction, readPkg, setRunLabel]);

  // ---- panel ----
  const openPanel = useCallback((view?: PanelView) => {
    setPanel((p) => (p.open && !view ? p : { open: true, view: view ?? LEVEL1, history: view && view.kind !== "level1" ? [LEVEL1] : [] }));
  }, []);
  const closePanel = useCallback(() => {
    setPanel({ open: false, view: LEVEL1, history: [] });
    // Focus goes back to the owl (acceptance 11). The dock re-shows the owl on narrow widths first.
    let tries = 0;
    const focusOwl = () => {
      if (!mountedRef.current) return;
      if (owlRef.current) owlRef.current.focus();
      else if (tries++ < 10) setTimeout(focusOwl, 50);
    };
    setTimeout(focusOwl, 30);
  }, []);
  const pushView = useCallback((view: PanelView) => {
    setPanel((p) => ({ open: true, view, history: [...p.history, p.view] }));
  }, []);
  const back = useCallback(() => {
    setPanel((p) => {
      if (p.history.length === 0) return { ...p, view: LEVEL1 };
      const history = p.history.slice(0, -1);
      return { ...p, view: p.history[p.history.length - 1], history };
    });
  }, []);

  // ---- derived ----
  const pkg = replay ? replayPkg : livePkg;
  const running = Boolean(run?.running);
  const liveRunning = running && !replay;
  const badge = running ? 0 : replay ? (replayBadge ?? 0) : (livePkg?.open_decisions ?? 0);
  // A replay whose outcome does not carry the count is never shown as clear.
  const countKnown = !replay || replayBadge !== null;
  const quarantined = Boolean(pkg?.rows.some((r) => r.evidencing?.quarantined));

  const owl: OwlState = useMemo(() => {
    // Offline wins over working: a run whose transport is failing is not claimed as working (codex #7).
    if ((pkgError || transportDown) && !replay) return "offline";
    // Working while the run runs and while its step lines are still being read out.
    if (running || bubble?.sticky) return "working";
    if (!pkg) return "idle";
    if (quarantined) return "quarantine";
    if (badge > 0) return "attention";
    if (countKnown && pkg.trace_run_id && !anyPending(pkg)) return "clear";
    return "idle";
  }, [pkgError, transportDown, replay, running, bubble?.sticky, pkg, quarantined, badge, countKnown]);

  const offline = owl === "offline";
  const shownBubble = useMemo(() => (offline ? { text: OFFLINE_TEXT, sticky: true } : bubble), [offline, bubble]);
  const busy = running || Boolean(replay) || actionCount > 0 || Boolean(upload);
  const canReplay = !liveRunning && !upload && actionCount === 0;

  const value = useMemo<KeelState>(
    () => ({
      config,
      pkg,
      pkgError,
      refreshPackage,
      run,
      uploadVersion,
      startReplay,
      endReplay,
      replay,
      owl,
      badge,
      bubble: shownBubble,
      dismissBubble,
      panel,
      openPanel,
      closePanel,
      pushView,
      back,
      afterAction,
      reset,
      busy,
      runAction,
      canReplay,
      transportDown,
      upload,
      uploadError,
      uploadWarning,
      dismissUploadError,
      replayError,
      owlRef,
      isMock,
    }),
    [config, pkg, pkgError, refreshPackage, run, uploadVersion, startReplay, endReplay, replay, owl, badge, shownBubble, dismissBubble, panel, openPanel, closePanel, pushView, back, afterAction, reset, busy, runAction, canReplay, transportDown, upload, uploadError, uploadWarning, dismissUploadError, replayError, isMock],
  );

  // Dev only: lets the browser checks drive the provider (replay, reset) before the panel menu exists.
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") (window as unknown as { __keelState?: KeelState }).__keelState = value;
  }, [value]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useKeelState(): KeelState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useKeelState must be used inside KeelStateProvider");
  return v;
}
