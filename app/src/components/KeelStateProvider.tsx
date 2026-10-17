"use client";

/**
 * UI v4 state: one provider for the Box page, the owl and the panel. It owns the package view, run following,
 * the labelled replay, the owl's state, badge and bubble, and the panel's level history. Nothing here composes a
 * status label or a count: badge and summary come from the engine (`open_decisions`, `decision_summary`), the
 * bubble from each step's `bubble`.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { AppConfig, ControlRow, DisplayedStatus, PackageFile, PackageView, SubmitResponse, Trace, TraceStep } from "@/lib/types";
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

export type UploadVersionRequest = { file_name: string; file_id?: string; scenario?: string; content_base64?: string };

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
  upload: UploadState;
  uploadError: string | null;
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

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const anyPending = (v: PackageView) => v.evaluation_state === "pending" || v.rows.some((r) => r.status.kind === "pending_recheck");
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Rule 1 while a re-check replays: the prior label stays visible, struck through (same as the engine's pending row). */
function pendingOf(r: ControlRow): ControlRow {
  if (r.status.kind === "pending_recheck") return r;
  const status: DisplayedStatus = { rule: 1, kind: "pending_recheck", label: "Re-check pending", projection_code: "PENDING", tone: "grey", struck: r.status.label };
  return { ...r, status };
}

/** Recorded outcome fields lane E may add (optional): replay reads them, never counts rows itself. */
type OutcomeExtra = { open_decisions?: number; decision_summary?: string; files?: PackageFile[] };

function postUploadVersion(body: UploadVersionRequest): Promise<SubmitResponse> {
  return api.uploadVersion(body);
}

/** The toast line for a failed upload: the API's own message, with a plainer line for a busy package. */
function uploadErrorText(e: unknown): string {
  if (e instanceof ApiError) {
    const code = e.body && typeof e.body === "object" ? (e.body as { error?: { code?: string } }).error?.code : undefined;
    if (code === "PACKAGE_BUSY" || code === "RUN_ACTIVE" || (e.status === 409 && !code)) return "A re-check is already running on this folder.";
    // The mock fixture's version was already uploaded: say what to do in the UI's terms, not the route's.
    if (code === "ALREADY_SUBMITTED") return "This version is already uploaded. Reset the demo from the Keel menu to upload it again.";
    return e.message;
  }
  return msg(e);
}

/** A stuck request never leaves the row on the progress bar. */
const UPLOAD_TIMEOUT_MS = 30000;
/** The row's cells fade in over this long after the upload; the first bubble waits for it. */
const UPLOAD_SETTLE_MS = 300;

const Ctx = createContext<KeelState | null>(null);

export function KeelStateProvider({ children }: { children: React.ReactNode }) {
  const { config, setRun: setRunLabel } = useKeel();
  const [livePkg, setLivePkg] = useState<PackageView | null>(null);
  const [pkgError, setPkgError] = useState<string | null>(null);
  const [run, setRun] = useState<RunInfo | null>(null);
  const [replay, setReplay] = useState<{ runId: string } | null>(null);
  const [replayPkg, setReplayPkg] = useState<PackageView | null>(null);
  /** The recorded outcome's badge; null until the replay ends or when the outcome does not carry it. */
  const [replayBadge, setReplayBadge] = useState<number | null>(null);
  const [bubble, setBubble] = useState<{ text: string; sticky: boolean } | null>(null);
  const [panel, setPanel] = useState<{ open: boolean; view: PanelView; history: PanelView[] }>({ open: false, view: LEVEL1, history: [] });
  const [actionBusy, setActionBusy] = useState(false);
  const [upload, setUpload] = useState<UploadState>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [replayError, setReplayError] = useState<string | null>(null);

  const owlRef = useRef<HTMLButtonElement | null>(null);
  const pkgRef = useRef<PackageView | null>(null);
  const runRef = useRef<RunInfo | null>(null);
  const cancelRef = useRef<(() => void) | null>(null);
  const genRef = useRef(0);
  const bubbleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const replayTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const savedRunRef = useRef<RunInfo | null>(null);
  const followingRef = useRef(false);
  const replayRef = useRef<{ runId: string } | null>(null);

  useEffect(() => {
    runRef.current = run;
  }, [run]);
  useEffect(() => {
    replayRef.current = replay;
  }, [replay]);

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
    if (pumpTimer.current) return;
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
      const item = queueRef.current.shift();
      if (!item) return;
      if (bubbleTimer.current) clearTimeout(bubbleTimer.current);
      bubbleTimer.current = null;
      lastShownAt.current = Date.now();
      // An empty item ends the step lines without a summary.
      setBubble(item.text ? item : null);
      if (item.text && !item.sticky) bubbleTimer.current = setTimeout(() => setBubble(null), BUBBLE_FADE_MS);
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

  // ---- package ----
  const applyPkg = useCallback((v: PackageView) => {
    pkgRef.current = v;
    setLivePkg(v);
    setPkgError(null);
  }, []);

  const loadPkg = useCallback(async (signal?: AbortSignal): Promise<PackageView | null> => {
    try {
      const v = await api.package(signal);
      return v;
    } catch (e) {
      if (!isAbort(e)) setPkgError(msg(e));
      return null;
    }
  }, []);

  const refreshPackage = useCallback(async () => {
    const v = await loadPkg();
    if (v) applyPkg(v);
  }, [loadPkg, applyPkg]);

  // ---- run following ----
  const startFollowing = useCallback(
    (runId: string) => {
      cancelRef.current?.();
      const gen = ++genRef.current;
      const current = () => gen === genRef.current;
      followingRef.current = true;
      clearFindingCache();
      const modeLabel: RunInfo["modeLabel"] = (pkgRef.current?.mode ?? config?.mode) === "live" ? "Live" : "Mock";
      setRun({ runId, steps: [], running: true, modeLabel });
      let refreshedOnApply = false;

      const finishRun = async (final?: RunState) => {
        if (!current()) return;
        setRun((r) =>
          r && r.runId === runId
            ? {
                ...r,
                running: false,
                steps: final?.steps?.length ? final.steps : r.steps,
                summary: final?.summary ?? r.summary,
                totalDurationMs: final?.total_duration_ms ?? r.totalDurationMs,
              }
            : r,
        );
        // Findings land before projection and tasks; retry briefly while the engine still reports pending.
        let v: PackageView | null = null;
        for (let i = 0; i < 16; i++) {
          v = await loadPkg();
          if (!current()) return;
          if (v && !anyPending(v)) break;
          await wait(250);
          if (!current()) return;
        }
        if (v) applyPkg(v);
        followingRef.current = false;
        if (v) {
          prefetchFindings(v.rows.filter((r) => r.status.kind !== "verified_holds").map((r) => r.finding_id ?? r.control_id));
        }
        endSteps(v?.decision_summary);
      };

      const cancel = followRun(runId, {
        onStep: (step) => {
          if (!current()) return;
          setRun((r) => (r && r.runId === runId ? { ...r, steps: [...r.steps, step] } : r));
          if (step.bubble) showBubble(step.bubble, true);
          if (!refreshedOnApply && (step.kind === "findings_applied" || step.kind === "evaluation_completed")) {
            refreshedOnApply = true;
            loadPkg().then((v) => current() && v && applyPkg(v));
          }
        },
        onMeta: (m) => {
          if (!current()) return;
          setRun((r) =>
            r && r.runId === runId
              ? {
                  ...r,
                  modeLabel: m.mode_label,
                  startedAt: m.started_at,
                  snapshotId: m.snapshot_id,
                  priorSnapshotId: m.prior_snapshot_id,
                  compressedTiming: m.compressed_timing,
                  totalDurationMs: m.done ? m.total_duration_ms : r.totalDurationMs,
                }
              : r,
          );
          setRunLabel({ run_id: m.run_id, mode_label: m.mode_label });
        },
        onDone: (final) => {
          finishRun(final);
        },
        onError: () => {
          /* followRun keeps polling */
        },
        onGone: async () => {
          if (!current()) return;
          followingRef.current = false;
          setRun(null);
          setRunLabel(null);
          dismissBubble();
          await refreshPackage();
        },
      });
      cancelRef.current = cancel;
    },
    [applyPkg, config?.mode, dismissBubble, endSteps, loadPkg, refreshPackage, setRunLabel, showBubble],
  );

  /** A finished run's stored steps, for "How it was checked". A missing run is dropped quietly. */
  const loadStoredRun = useCallback(
    async (runId: string) => {
      try {
        const t = await api.run(runId);
        setRun({
          runId: t.run_id,
          steps: t.steps,
          running: !t.done,
          modeLabel: t.mode_label,
          summary: t.summary,
          startedAt: t.started_at,
          totalDurationMs: t.total_duration_ms,
          snapshotId: t.snapshot_id,
          priorSnapshotId: t.prior_snapshot_id,
          compressedTiming: t.compressed_timing,
        });
        setRunLabel({ run_id: t.run_id, mode_label: t.mode_label });
      } catch {
        setRun(null);
      }
    },
    [setRunLabel],
  );

  // Initial load: resume a run in progress, or show the last run's steps.
  useEffect(() => {
    let alive = true;
    (async () => {
      const v = await loadPkg();
      if (!alive || !v) return;
      applyPkg(v);
      if (!v.trace_run_id) return;
      if (anyPending(v)) startFollowing(v.trace_run_id);
      else loadStoredRun(v.trace_run_id);
    })();
    const gens = genRef;
    return () => {
      alive = false;
      gens.current++;
      cancelRef.current?.();
      replayTimers.current.forEach(clearTimeout);
      if (bubbleTimer.current) clearTimeout(bubbleTimer.current);
      if (pumpTimer.current) clearTimeout(pumpTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Passive sync: picks up a run started elsewhere, a Box task response ingested, or the API coming back.
  useEffect(() => {
    let alive = true;
    let ctrl: AbortController | null = null;
    const t = setInterval(async () => {
      if (followingRef.current || replayRef.current || actionBusy || upload || document.visibilityState !== "visible") return;
      ctrl?.abort();
      ctrl = new AbortController();
      const gen = genRef.current;
      const v = await loadPkg(ctrl.signal);
      if (!alive || !v || gen !== genRef.current || followingRef.current || replayRef.current) return;
      const cur = pkgRef.current;
      if (anyPending(v) && v.trace_run_id && v.trace_run_id !== runRef.current?.runId) {
        applyPkg(v);
        startFollowing(v.trace_run_id);
        return;
      }
      if (!cur || JSON.stringify(cur) !== JSON.stringify(v)) {
        const prevOpen = cur?.open_decisions ?? 0;
        applyPkg(v);
        if ((v.open_decisions ?? 0) > prevOpen) showBubble(v.decision_summary, false);
        if (v.trace_run_id && v.trace_run_id !== runRef.current?.runId) loadStoredRun(v.trace_run_id);
        if (!v.trace_run_id && runRef.current) setRun(null);
      }
    }, IDLE_POLL_MS);
    return () => {
      alive = false;
      clearInterval(t);
      ctrl?.abort();
    };
  }, [actionBusy, upload, applyPkg, loadPkg, loadStoredRun, showBubble, startFollowing]);

  // ---- replay ----
  const clearReplayTimers = () => {
    replayTimers.current.forEach(clearTimeout);
    replayTimers.current = [];
  };

  const endReplay = useCallback(() => {
    if (!replayRef.current) return;
    clearReplayTimers();
    replayRef.current = null;
    setReplay(null);
    setReplayPkg(null);
    setReplayBadge(null);
    setReplayError(null);
    const prev = savedRunRef.current;
    savedRunRef.current = null;
    setRun(prev);
    setRunLabel(prev ? { run_id: prev.runId, mode_label: prev.modeLabel } : null);
    dismissBubble();
    refreshPackage();
  }, [dismissBubble, refreshPackage, setRunLabel]);

  const startReplay = useCallback(
    async (runId: string) => {
      setReplayError(null);
      let t: RunState;
      try {
        t = await api.run(runId);
      } catch (e) {
        setReplayError(msg(e));
        return;
      }
      const outcome = t.outcome as (Trace["outcome"] & OutcomeExtra) | undefined;
      const base = pkgRef.current;
      if (!outcome?.rows || !base) {
        setReplayError("This run has no recorded outcome, so it cannot be replayed.");
        return;
      }
      clearReplayTimers();
      if (!replayRef.current) savedRunRef.current = runRef.current;
      const key = `replay:${t.run_id}`;
      replayRef.current = { runId: t.run_id };
      setReplay({ runId: t.run_id });
      setRunLabel({ run_id: t.run_id, mode_label: "Replay" });
      dismissBubble();

      const snap = outcome.snapshot ?? { ...base.snapshot, snapshot_id: outcome.snapshot_id };
      // The Box table shows the replayed snapshot's versions, never the live store's. Per-file counts come only
      // from the recorded outcome; without them no dot is drawn.
      const replayFiles: PackageFile[] | undefined =
        outcome.files ??
        base.files?.map((f) => {
          const sf = outcome.snapshot?.files.find((x) => x.fileId === f.file_id || x.fileName === f.file_name);
          const same = !sf || sf.versionId === f.version_id;
          return {
            ...f,
            version_id: sf?.versionId ?? f.version_id,
            version_label: sf?.versionLabel ?? (same ? f.version_label : undefined),
            updated_at: same ? f.updated_at : undefined,
            size_bytes: same ? f.size_bytes : undefined,
            open_decisions: 0,
            recorded_decisions: 0,
          };
        });
      const recorded: PackageView = {
        ...base,
        snapshot: snap,
        prior_snapshot_id: outcome.prior_snapshot_id ?? base.prior_snapshot_id,
        rows: outcome.rows,
        count_line: outcome.count_line ?? base.count_line,
        evaluation_state: "complete",
        files: replayFiles,
        open_decisions: outcome.open_decisions,
        decision_summary: outcome.decision_summary,
        trace_run_id: t.run_id,
        awaiting_drafts: [],
      };
      const priorRows = outcome.rows.length === base.rows.length ? base.rows : outcome.rows;
      setReplayPkg({
        ...base,
        snapshot: snap,
        rows: priorRows.map(pendingOf),
        count_line: outcome.pending_count_line,
        evaluation_state: "pending",
        files: replayFiles?.map((f) => ({ ...f, open_decisions: 0, recorded_decisions: 0 })),
        open_decisions: 0,
        decision_summary: undefined,
        awaiting_drafts: [],
      });
      setReplayBadge(null);
      setRun({
        runId: key,
        steps: [],
        running: true,
        modeLabel: "Replay",
        summary: t.summary,
        startedAt: t.started_at,
        totalDurationMs: t.total_duration_ms,
        snapshotId: t.snapshot_id,
        priorSnapshotId: t.prior_snapshot_id,
        compressedTiming: t.compressed_timing,
      });

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
        replayTimers.current.push(
          setTimeout(() => {
            setRun((r) => (r && r.runId === key ? { ...r, steps: [...r.steps, s] } : r));
            if (s.bubble) showBubble(s.bubble, true);
            if (s.kind === "findings_applied" || s.kind === "evaluation_completed") flip();
          }, at),
        );
      });
      const total = Math.max(at, t.total_duration_ms ?? 0);
      replayTimers.current.push(
        setTimeout(() => {
          setRun((r) => (r && r.runId === key ? { ...r, running: false } : r));
          flip();
          setReplayBadge(outcome.open_decisions ?? null);
          endSteps(outcome.decision_summary);
        }, total + 60),
      );
    },
    [dismissBubble, endSteps, setRunLabel, showBubble],
  );

  // ---- upload ----
  const uploadVersion = useCallback(
    async (req: UploadVersionRequest) => {
      if (replayRef.current) endReplay();
      setUploadError(null);
      dismissBubble();
      const mock = (pkgRef.current?.mode ?? config?.mode) !== "live";
      const startedAt = Date.now();
      setUpload({ file_name: req.file_name, phase: "uploading", durationMs: mock ? MOCK_UPLOAD_MS : 0, startedAt });
      const clearMine = () => setUpload((u) => (u && u.startedAt === startedAt ? null : u));
      let timer: ReturnType<typeof setTimeout> | null = null;
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("The upload did not finish. Try again in a moment.")), UPLOAD_TIMEOUT_MS);
      });
      try {
        if (mock) await wait(MOCK_UPLOAD_MS); // Box-style progress first; the version and the run start when it completes.
        const body = mock ? { file_name: req.file_name, file_id: req.file_id, scenario: req.scenario ?? "architecture_v3" } : req;
        const res = await Promise.race([postUploadVersion(body), timeout]);
        setUpload({ file_name: req.file_name, phase: "done", durationMs: 0, startedAt });
        // Follow at once; the step lines queue up and are released once the row reads the new version.
        holdUntilRef.current = Infinity;
        startFollowing(res.run_id);
        // In parallel, the row picks up the new version. The snapshot pointer moves just after the POST returns,
        // so read until the package reports the run's snapshot (bounded). The bar stays until the row has it.
        const gen = genRef.current;
        (async () => {
          let v: PackageView | null = null;
          for (let i = 0; i < 12; i++) {
            v = await loadPkg();
            if (gen !== genRef.current) break;
            if (v?.snapshot.snapshot_id === res.snapshot_id) break;
            await wait(150);
          }
          // Only apply if the run has not already moved the package on.
          if (v && gen === genRef.current && pkgRef.current?.snapshot.snapshot_id !== res.snapshot_id) applyPkg(v);
          // "Upload complete" for 200 ms, then the row's cells show the new version; the first line follows.
          setTimeout(() => {
            clearMine();
            holdUntilRef.current = Date.now() + UPLOAD_SETTLE_MS;
            pumpRef.current();
          }, 200);
        })();
      } catch (e) {
        holdUntilRef.current = 0;
        // Any failure: the bar stops, the row shows the current version again, Upload is enabled, a toast explains.
        clearMine();
        setUploadError(uploadErrorText(e));
        refreshPackage();
      } finally {
        if (timer) clearTimeout(timer);
      }
    },
    [applyPkg, config?.mode, dismissBubble, endReplay, loadPkg, refreshPackage, startFollowing],
  );

  const dismissUploadError = useCallback(() => setUploadError(null), []);

  // ---- actions and reset ----
  const afterAction = useCallback(async () => {
    setActionBusy(true);
    try {
      clearFindingCache();
      const before = pkgRef.current?.open_decisions ?? 0;
      const v = await loadPkg();
      if (v) {
        applyPkg(v);
        if ((v.open_decisions ?? 0) !== before) showBubble(v.decision_summary, false);
      }
    } finally {
      setActionBusy(false);
    }
  }, [applyPkg, loadPkg, showBubble]);

  const reset = useCallback(async () => {
    if (replayRef.current) endReplay();
    genRef.current++;
    cancelRef.current?.();
    followingRef.current = false;
    setActionBusy(true);
    try {
      await api.reset();
    } catch (e) {
      setPkgError(msg(e));
    }
    setRun(null);
    setRunLabel(null);
    setUpload(null);
    setUploadError(null);
    dismissBubble();
    clearFindingCache();
    setPanel((p) => ({ ...p, view: LEVEL1, history: [] }));
    await refreshPackage();
    setActionBusy(false);
  }, [dismissBubble, endReplay, refreshPackage, setRunLabel]);

  // ---- panel ----
  const openPanel = useCallback((view?: PanelView) => {
    setPanel((p) => (p.open && !view ? p : { open: true, view: view ?? LEVEL1, history: view && view.kind !== "level1" ? [LEVEL1] : [] }));
  }, []);
  const closePanel = useCallback(() => {
    setPanel({ open: false, view: LEVEL1, history: [] });
    // Focus goes back to the owl (acceptance 11). The dock re-shows the owl on narrow widths first.
    let tries = 0;
    const focusOwl = () => {
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
  const badge = running ? 0 : replay ? (replayBadge ?? 0) : (livePkg?.open_decisions ?? 0);
  // A replay whose outcome does not carry the count is never shown as clear.
  const countKnown = !replay || replayBadge !== null;
  const quarantined = Boolean(pkg?.rows.some((r) => r.evidencing?.quarantined));

  const owl: OwlState = useMemo(() => {
    if (pkgError && !replay) return "offline";
    // Working while the run runs and while its step lines are still being read out.
    if (running || bubble?.sticky) return "working";
    if (!pkg) return "idle";
    if (quarantined) return "quarantine";
    if (badge > 0) return "attention";
    if (countKnown && pkg.trace_run_id && !anyPending(pkg)) return "clear";
    return "idle";
  }, [pkgError, replay, running, bubble?.sticky, pkg, quarantined, badge, countKnown]);

  const offline = owl === "offline";
  const shownBubble = useMemo(() => (offline ? { text: OFFLINE_TEXT, sticky: true } : bubble), [offline, bubble]);
  const busy = running || Boolean(replay) || actionBusy || Boolean(upload);

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
      upload,
      uploadError,
      dismissUploadError,
      replayError,
      owlRef,
      isMock,
    }),
    [config, pkg, pkgError, refreshPackage, run, uploadVersion, startReplay, endReplay, replay, owl, badge, shownBubble, dismissBubble, panel, openPanel, closePanel, pushView, back, afterAction, reset, busy, upload, uploadError, dismissUploadError, replayError, isMock],
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
