"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { ExportManifest, Ledger, LedgerEvent } from "@/lib/types";
import { api } from "@/lib/client";
import { ErrorBlock, LoadingBlock } from "@/components/ui/States";
import { Hash } from "@/components/ui/Mono";
import { Caret } from "@/components/ui/Disclosure";
import { utc } from "@/lib/ui/format";
import { actorColor } from "@/lib/ui/tone";
import { T_BASE } from "@/lib/ui/motion";

export const LIMITATION =
  "Observed revisions, evaluations, and human responses from this run. Complete-period reconciliation against Box's version list and independent integrity protection are not implemented.";

type Phase = "all" | "seed" | "live";

const isLive = (e: LedgerEvent) => e.phase !== "seed";

export function LedgerScreen() {
  const [ledger, setLedger] = useState<Ledger | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [manifest, setManifest] = useState<ExportManifest | null>(null);
  const [manifestErr, setManifestErr] = useState<string | null>(null);
  const [control, setControl] = useState("all");
  const [type, setType] = useState("all");
  const [phase, setPhase] = useState<Phase>("all");
  const [open, setOpen] = useState<Set<string>>(new Set());

  const load = useCallback(() => {
    api
      .ledger()
      .then((l) => {
        setLedger(l);
        setErr(null);
      })
      .catch((e: unknown) => setErr(e instanceof Error ? e.message : String(e)));
    api
      .exportManifest()
      .then((m) => {
        setManifest(m);
        setManifestErr(null);
      })
      .catch((e: unknown) => setManifestErr(e instanceof Error ? e.message : String(e)));
  }, []);

  useEffect(load, [load]);

  const events = useMemo(() => ledger?.events ?? [], [ledger]);
  const controls = useMemo(() => [...new Set(events.map((e) => e.control_id).filter(Boolean) as string[])].sort(), [events]);
  const types = useMemo(() => [...new Set(events.map((e) => e.event_type))].sort(), [events]);
  const phaseCounts = useMemo(
    () => ({ all: events.length, seed: events.filter((e) => !isLive(e)).length, live: events.filter(isLive).length }),
    [events],
  );

  const filtered = useMemo(
    () =>
      events
        .filter((e) => control === "all" || e.control_id === control || (control === "package" && !e.control_id))
        .filter((e) => type === "all" || e.event_type === type)
        .filter((e) => phase === "all" || (phase === "live" ? isLive(e) : !isLive(e)))
        .slice()
        .reverse(),
    [events, control, type, phase],
  );

  const toggle = (id: string) =>
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <div className="mx-auto max-w-[1360px] px-6 lg:px-10 pt-8 pb-16">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start">
        <div className="min-w-0">
          <div className="eyebrow mb-2">Ledger</div>
          <h1 className="text-[28px] font-semibold tracking-[-0.025em] text-ink">Every evaluation, including the ones that changed nothing</h1>
          {ledger ? (
            <p className="mt-2 text-[14px] text-ink-2 max-w-[75ch]">
              {ledger.scope ?? "Append-only."} Hash chain:{" "}
              <span className="text-muted">{ledger.chain.algorithm}</span>, head <Hash value={ledger.chain.head} />.
            </p>
          ) : null}
        </div>
        <ExportPanel manifest={manifest} error={manifestErr} />
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-lg border hairline bg-panel p-0.5" role="tablist" aria-label="Phase">
          {(["all", "seed", "live"] as Phase[]).map((p) => (
            <button
              key={p}
              role="tab"
              aria-selected={phase === p}
              onClick={() => setPhase(p)}
              className={`relative h-8 rounded-md px-3 text-[13px] ${phase === p ? "text-ink font-medium" : "text-muted hover:text-ink"}`}
            >
              {phase === p ? <motion.span layoutId="phase-pill" className="absolute inset-0 rounded-md bg-paper-2" transition={T_BASE} /> : null}
              <span className="relative">
                {p === "all" ? "All" : p === "seed" ? "Seed" : "Live"} <span className="text-faint tabular-nums">{phaseCounts[p]}</span>
              </span>
            </button>
          ))}
        </div>
        <Select label="Control" value={control} onChange={setControl} options={[["all", "All controls"], ["package", "Package-level"], ...controls.map((c) => [c, c] as [string, string])]} />
        <Select label="Event type" value={type} onChange={setType} options={[["all", "All types"], ...types.map((t) => [t, t] as [string, string])]} />
        <span className="ml-auto text-[12.5px] text-muted tabular-nums">
          {filtered.length} of {events.length} events, newest first
        </span>
      </div>

      <div className="mt-3">
        {err ? <ErrorBlock title="Could not load /api/ledger" message={err} onRetry={load} /> : null}
        {!ledger && !err ? (
          <div className="panel p-5">
            <LoadingBlock lines={10} />
          </div>
        ) : null}
        {ledger ? (
          <div className="panel overflow-x-auto">
            <table className="w-full text-[12px] border-collapse">
              <thead className="bg-panel-cool sticky top-0">
                <tr className="text-left">
                  {["", "Time (UTC)", "Event", "Type", "Control", "Snapshot", "Actor", "Assessment", "Classification", "Projection"].map((h) => (
                    <th key={h} className="eyebrow !text-[10.5px] px-2.5 py-2.5 border-b hairline font-semibold whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((e) => (
                  <Fragment key={e.event_id}>
                    <tr
                      className={`border-b hairline cursor-pointer hover:bg-paper/70 ${open.has(e.event_id) ? "bg-paper/70" : ""}`}
                      onClick={() => toggle(e.event_id)}
                      aria-expanded={open.has(e.event_id)}
                    >
                      <td className="pl-3 pr-1 py-2 text-faint">
                        <Caret open={open.has(e.event_id)} />
                      </td>
                      <td className="px-2.5 py-2 mono whitespace-nowrap text-ink-2">{utc(e.ts)}</td>
                      <td className="px-2.5 py-2 mono whitespace-nowrap text-ink">{e.event_id}</td>
                      <td className="px-2.5 py-2 mono whitespace-nowrap">
                        {e.event_type}
                        {isLive(e) ? <span className="ml-1.5 rounded border border-line-strong px-1 py-px text-[10px] font-sans font-semibold uppercase tracking-wide text-ink-2">live</span> : null}
                      </td>
                      <td className="px-2.5 py-2 mono whitespace-nowrap">{e.control_id ?? <span className="text-faint">package</span>}</td>
                      <td className="px-2.5 py-2 mono">{e.snapshot_id ?? ""}</td>
                      <td className="px-2.5 py-2">
                        <span className="inline-flex flex-wrap items-center gap-x-1.5">
                          <span className="h-1.5 w-1.5 rounded-full" style={{ background: actorColor(e.actor.type) }} />
                          <span className="text-muted">{e.actor.type}</span>
                          <span className={e.actor.type === "human" ? "text-blue-ink font-medium" : "text-ink-2"}>{e.actor.name}</span>
                        </span>
                      </td>
                      <td className="px-2.5 py-2 mono text-grey-ink">{e.machine_assessment ?? ""}</td>
                      <td className="px-2.5 py-2 mono text-grey-ink">{e.change_classification ?? ""}</td>
                      <td className={`px-2.5 py-2 mono ${e.projection?.box_metadata === "failed" ? "text-red-ink" : "text-muted"}`}>{e.projection?.box_metadata ?? ""}</td>
                    </tr>
                    <AnimatePresence initial={false}>
                      {open.has(e.event_id) ? (
                        <tr key="detail" className="border-b hairline bg-paper/50">
                          <td colSpan={10} className="p-0">
                            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={T_BASE} style={{ overflow: "hidden" }}>
                              <EventRecord e={e} />
                            </motion.div>
                          </td>
                        </tr>
                      ) : null}
                    </AnimatePresence>
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function EventRecord({ e }: { e: LedgerEvent }) {
  const model = e.model_id ?? e.actor.model_id;
  return (
    <div className="px-6 py-4 grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)] max-w-[calc(100vw-120px)]">
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-[12px] content-start">
        <dt className="text-muted">Snapshot</dt>
        <dd className="mono">{e.snapshot_id ?? "none"}</dd>
        <dt className="text-muted">Model</dt>
        <dd className="mono break-all">{model ?? "none"}</dd>
        <dt className="text-muted">MRM model id</dt>
        <dd className="mono">{e.mrm_model_id}</dd>
        <dt className="text-muted">Prompt hash</dt>
        <dd>
          <Hash value={e.prompt_hash} />
        </dd>
        <dt className="text-muted">Chain hash</dt>
        <dd>
          <Hash value={e.chain_hash} />
        </dd>
        {e.fileName ? (
          <>
            <dt className="text-muted">Evidence</dt>
            <dd className="mono break-all">
              {e.fileName} {e.versionId}
            </dd>
          </>
        ) : null}
        {e.current_disposition ? (
          <>
            <dt className="text-muted">Current disposition</dt>
            <dd className="mono">{e.current_disposition}</dd>
          </>
        ) : null}
      </dl>
      <pre className="mono text-[11px] leading-[1.55] whitespace-pre-wrap break-words bg-panel border hairline rounded-lg p-3 text-ink-2 max-h-[420px] overflow-auto scroll-quiet">
        {JSON.stringify(e, null, 2)}
      </pre>
    </div>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: [string, string][];
}) {
  return (
    <label className="inline-flex items-center gap-2 text-[13px] text-muted">
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 rounded-lg border border-line-strong bg-panel px-2 text-[13px] text-ink mono focus:outline-none focus:border-[var(--blue-dot)]"
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

export function ExportPanel({ manifest, error }: { manifest: ExportManifest | null; error?: string | null }) {
  return (
    <section className="panel p-4" aria-label="Export">
      <div className="flex items-baseline justify-between">
        <h2 className="text-[14px] font-semibold text-ink">Export</h2>
        {manifest ? <span className="text-[12px] text-muted">exported {utc(manifest.exported_at)}</span> : null}
      </div>
      <p className="mt-1.5 text-[12.5px] leading-[1.5] text-ink-2">{LIMITATION}</p>
      {manifest && manifest.limitation && manifest.limitation !== LIMITATION ? (
        <p className="mt-1 text-[12px] text-muted">{manifest.limitation}</p>
      ) : null}
      <div className="mt-3 flex gap-2">
        <a className="btn btn-secondary btn-sm" href={api.exportCsvUrl} download="keel-ledger-export.csv">
          Download CSV
        </a>
        <a className="btn btn-secondary btn-sm" href={api.exportManifestUrl} download="keel-export-manifest.json">
          Download manifest
        </a>
      </div>
      {error ? <p className="mt-3 text-[12px] text-red-ink">Manifest unavailable: {error}</p> : null}
      {manifest ? (
        <dl className="mt-3 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-[12px] border-t hairline pt-3">
          <dt className="text-muted">Events</dt>
          <dd className="mono tabular-nums">{manifest.event_count}</dd>
          <dt className="text-muted">Snapshots</dt>
          <dd className="mono">{manifest.snapshot_ids.join(", ")}</dd>
          <dt className="text-muted">Runs</dt>
          <dd className="mono break-all">{manifest.run_ids.length ? manifest.run_ids.join(", ") : "none"}</dd>
          <dt className="text-muted">Chain head</dt>
          <dd>
            <Hash value={manifest.chain_head} />
          </dd>
          <dt className="text-muted">Events hash</dt>
          <dd>
            <Hash value={manifest.events_hash} />
          </dd>
        </dl>
      ) : null}
    </section>
  );
}
