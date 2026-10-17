"use client";

import { useEffect, useMemo, useState } from "react";
import type { LedgerEvent } from "@/lib/types";
import { api, type RunSummary } from "@/lib/client";
import { utcMinute } from "@/lib/ui/format";
import { RulesPage } from "@/components/pages/RulesPage";
import { ExportPanel } from "@/components/ledger/LedgerScreen";
import { TracePanel } from "@/components/package/TracePanel";
import { useKeelState, type MenuScreen } from "@/components/KeelStateProvider";
import { HowItWorksStrip } from "./HowItWorksStrip";
import { ChainFooter, EventLine, meaningOf, useManifest } from "./RecordList";
import { C, btnPrimary, btnSecondary, btnSmall, errorText } from "./parts";

export const MENU_TITLES: Record<MenuScreen, string> = {
  how_it_works: "How it works",
  rules: "Status rules",
  record: "Full record",
  how_checked: "How it was checked",
  scenarios: "Other scenarios",
  replay: "Replay a run",
};

export function MenuScreenView({ screen }: { screen: MenuScreen }) {
  switch (screen) {
    case "how_it_works":
      return <HowItWorksStrip />;
    case "rules":
      return (
        <div className="kp-compact px-5 pt-3 pb-6">
          <RulesPage />
        </div>
      );
    case "record":
      return <FullRecord />;
    case "how_checked":
      return <HowChecked />;
    case "scenarios":
      return <Scenarios />;
    case "replay":
      return <Replay />;
  }
}

/** The ledger, compact: filters, two lines per event, newest first, export and the chain line. */
function FullRecord() {
  const [events, setEvents] = useState<LedgerEvent[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [control, setControl] = useState("all");
  const [type, setType] = useState("all");
  const { manifest, error } = useManifest();

  useEffect(() => {
    const ctrl = new AbortController();
    api
      .ledger(undefined, ctrl.signal)
      .then((l) => setEvents(l.events))
      .catch((e) => !ctrl.signal.aborted && setErr(errorText(e)));
    return () => ctrl.abort();
  }, []);

  const controls = useMemo(() => [...new Set((events ?? []).map((e) => e.control_id).filter(Boolean) as string[])].sort(), [events]);
  const types = useMemo(() => [...new Set((events ?? []).map((e) => e.event_type))].sort(), [events]);
  const shown = useMemo(
    () =>
      (events ?? [])
        .filter((e) => control === "all" || (control === "package" ? !e.control_id : e.control_id === control))
        .filter((e) => type === "all" || e.event_type === type)
        .slice()
        .reverse(),
    [events, control, type],
  );

  return (
    <div className="px-5 pt-3 pb-6">
      <div className="kp-export">
        <ExportPanel manifest={manifest} error={error} />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Select label="Control" value={control} onChange={setControl} options={[["all", "All controls"], ["package", "Package-level"], ...controls.map((c) => [c, c] as [string, string])]} />
        <Select label="Type" value={type} onChange={setType} options={[["all", "All types"], ...types.map((t) => [t, t] as [string, string])]} />
      </div>
      <div className="mt-1 text-[12px] tabular-nums" style={{ color: C.secondary }}>
        {events ? `${shown.length} of ${events.length} events, newest first` : err ? "" : "Loading…"}
      </div>
      {err ? <p className="mt-2 text-[12px]" style={{ color: C.red }}>{err}</p> : null}
      <ol className="mt-1 divide-y divide-[#E8E8E8]">
        {shown.map((e) => (
          <EventLine key={e.event_id} e={e} meaning={meaningOf(e, events ?? [])} />
        ))}
      </ol>
      <div className="mt-2">
        <ChainFooter manifest={manifest} error={error} />
      </div>
    </div>
  );
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <label className="inline-flex items-center gap-1.5 text-[12.5px]" style={{ color: C.secondary }}>
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 max-w-[150px] rounded-[4px] border bg-white px-1.5 text-[12.5px] focus:border-[#0061D5] focus:outline-none"
        style={{ borderColor: "#C9C9C9", color: C.text }}
      >
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
}

/** The current run's steps with timings, read-only (the old trace). */
function HowChecked() {
  const { run, pkg } = useKeelState();
  if (!run) {
    return (
      <p className="px-5 py-4 text-[13px]" style={{ color: C.secondary }}>
        No run on this snapshot yet. Upload a new version to start one.
      </p>
    );
  }
  return (
    <div className="kp-trace px-5 pt-3 pb-6">
      <TracePanel
        steps={run.steps}
        running={run.running}
        stacked
        summary={run.summary ? { total: run.summary.evaluated + run.summary.not_evaluated, notEvaluated: run.summary.not_evaluated } : undefined}
        controls={pkg?.rows.length}
        gate={run.running ? null : pkg?.gate ?? null}
        elapsedMs={run.running ? null : run.totalDurationMs ?? pkg?.elapsed_ms ?? null}
        meta={{
          run_id: run.runId.replace(/^replay:/, ""),
          mode_label: run.modeLabel,
          started_at: run.startedAt,
          total_duration_ms: run.totalDurationMs,
          snapshot_id: run.snapshotId,
          prior_snapshot_id: run.priorSnapshotId,
          compressed_timing: run.compressedTiming,
        }}
      />
    </div>
  );
}

const SCENARIOS: { id: string; title: string; what: string; file: string }[] = [
  { id: "fabricated_quote", title: "Fabricated quote", what: "The model cites a sentence v3 does not contain. Code rejects it.", file: "architecture.md" },
  { id: "injection", title: "Injected instructions", what: "A runbook note addresses AI agents. Decider quarantines it before Bedrock.", file: "runbook.md" },
  { id: "unreadable", title: "Unreadable file", what: "One file cannot be read. Its controls read Not evaluated.", file: "approved-services-and-exceptions.md" },
  { id: "contradiction", title: "Conflicting evidence", what: "A vendor summary contradicts a quote. Verify is blocked.", file: "vendor-contract-summary.md" },
  { id: "missing_finding", title: "Missing finding", what: "The model returns seven findings for eight controls. Nothing partial applies.", file: "architecture.md" },
];

function Scenarios() {
  const { uploadVersion, reset, isMock, busy, closePanel, uploadError } = useKeelState();
  const [confirm, setConfirm] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const go = async (id: string, file: string) => {
    setErr(null);
    setConfirm(null);
    try {
      // Each scenario starts from the baseline so it shows only its own effect.
      if (isMock) await reset();
      closePanel();
      await uploadVersion({ file_name: file, scenario: id });
    } catch (e) {
      setErr(errorText(e));
    }
  };

  return (
    <div className="px-5 pt-3 pb-6">
      <p className="mb-3 text-[13px] leading-[1.45]" style={{ color: C.text }}>
        Each one resets to snapshot S3, then uploads through the same pipeline.
      </p>
      <ul className="space-y-2">
        {SCENARIOS.map((s) => (
          <li key={s.id} className="rounded-[4px] border px-3 py-2.5" style={{ borderColor: C.border }}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[13px] font-bold" style={{ color: C.text }}>
                  {s.title}
                </div>
                <div className="mt-0.5 text-[12px] leading-[1.4]" style={{ color: C.secondary }}>
                  {s.what}
                </div>
              </div>
              {confirm === s.id ? null : (
                <button type="button" className={btnSmall} disabled={busy} onClick={() => setConfirm(s.id)}>
                  Run
                </button>
              )}
            </div>
            {confirm === s.id ? (
              <div className="mt-2 flex items-center justify-end gap-2">
                <span className="mr-auto text-[12px]" style={{ color: C.secondary }}>
                  Reset and upload {s.file}?
                </span>
                <button type="button" className={btnSmall} onClick={() => setConfirm(null)}>
                  Cancel
                </button>
                <button type="button" className={`${btnSmall} !border-[#0061D5] !bg-[#0061D5] !text-white`} onClick={() => go(s.id, s.file)}>
                  Reset and run
                </button>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
      {err || uploadError ? <p className="mt-2 text-[12px]" style={{ color: C.red }}>{err ?? uploadError}</p> : null}
    </div>
  );
}

/** Labelled replay of a recorded run: rows end on the run's recorded outcome, never the live store. */
function Replay() {
  const { startReplay, endReplay, replay, replayError, run, canReplay } = useKeelState();
  const [runs, setRuns] = useState<RunSummary[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    api
      .runs(ctrl.signal)
      .then((r) => setRuns(r))
      .catch((e) => !ctrl.signal.aborted && setErr(errorText(e)));
    return () => ctrl.abort();
  }, []);

  const [showAll, setShowAll] = useState(false);
  // Newest first (judge B3); the newest architecture_v3 run with a recorded outcome is the latest rehearsal.
  const replayable = (runs ?? [])
    .filter((r) => r.has_outcome !== false)
    .slice()
    .sort((a, b) => (b.started_at ?? "").localeCompare(a.started_at ?? ""));
  const rehearsal = replayable.find((r) => (r.scenario ?? "architecture_v3") === "architecture_v3")?.run_id;
  const shown = showAll ? replayable : replayable.slice(0, 3);

  return (
    <div className="px-5 pt-3 pb-6">
      {replay ? (
        <div className="mb-3 flex items-center justify-between gap-2 rounded-[4px] border px-3 py-2 text-[12.5px]" style={{ borderColor: C.border, background: C.greyBg }}>
          <span style={{ color: C.text }}>
            Replaying {replay.runId}
            {run?.running ? "…" : ""}
          </span>
          <button type="button" className={btnSecondary + " !h-8"} onClick={endReplay}>
            End replay
          </button>
        </div>
      ) : null}
      <p className="mb-3 text-[13px] leading-[1.45]" style={{ color: C.text }}>
        Stored steps replay with their timing. Nothing is re-evaluated or written.
      </p>
      {err ? <p className="text-[12px]" style={{ color: C.red }}>{err}</p> : null}
      {replayError ? <p className="mb-2 text-[12px]" style={{ color: C.red }}>{replayError}</p> : null}
      {!runs && !err ? <p className="text-[12.5px]" style={{ color: C.secondary }}>Loading runs…</p> : null}
      {runs && !replayable.length ? (
        <p className="text-[12.5px]" style={{ color: C.secondary }}>
          No recorded run yet. Upload a new version first.
        </p>
      ) : null}
      <ul className="space-y-2">
        {shown.map((r) => (
          <li key={r.run_id} className="flex items-center justify-between gap-3 rounded-[4px] border px-3 py-2" style={{ borderColor: C.border }}>
            <div className="min-w-0">
              <div className="flex items-center gap-2 min-w-0">
                <span className="mono truncate text-[12px] font-bold" style={{ color: C.text }}>
                  {r.run_id}
                </span>
                {r.run_id === rehearsal ? (
                  <span className="flex-none rounded-[3px] px-1.5 py-0.5 text-[10.5px] font-bold" style={{ background: C.selected, color: C.boxBlue }}>
                    Latest rehearsal
                  </span>
                ) : null}
              </div>
              <div className="text-[12px]" style={{ color: C.secondary }}>
                {r.prior_snapshot_id ? `${r.prior_snapshot_id} to ` : ""}
                {r.snapshot_id} · {utcMinute(r.started_at)}
                {r.scenario && r.scenario !== "architecture_v3" ? ` · ${r.scenario.replace(/_/g, " ")}` : ""}
              </div>
            </div>
            <button
              type="button"
              className={btnPrimary + " !h-8 !px-3 !text-[13px]"}
              disabled={!canReplay || (replay?.runId === r.run_id && Boolean(run?.running))}
              title={!canReplay ? "Replay is available once the current re-check or action finishes." : undefined}
              onClick={() => startReplay(r.run_id)}
            >
              Replay
            </button>
          </li>
        ))}
      </ul>
      {replayable.length > 3 ? (
        <button type="button" className="mt-2 text-[13px] font-bold hover:underline" style={{ color: C.boxBlue }} onClick={() => setShowAll((v) => !v)}>
          {showAll ? "Show fewer" : `Show all (${replayable.length})`}
        </button>
      ) : null}
    </div>
  );
}
