"use client";

import { useEffect, useState } from "react";
import type { ExportManifest, LedgerEvent } from "@/lib/types";
import { api } from "@/lib/client";
import { C, chainShort, errorText } from "./parts";

type ChainCheck = { ok: boolean; verified: number; total: number };
export type ManifestWithChain = ExportManifest & { chain_verification?: ChainCheck };

/** One detail word per event, taken from the event's own fields (never a judgement). */
export function detailWord(e: LedgerEvent): string {
  // Stored events carry human_disposition as a plain string; the typed shape is an object. Accept both.
  const hd = e.human_disposition as unknown;
  if (typeof hd === "string") return hd.replace(/_/g, " ");
  if (hd && typeof hd === "object" && "disposition" in hd) return String((hd as { disposition: string }).disposition).replace(/_/g, " ");
  if (e.event_type === "acknowledgment_recorded") return "acknowledged";
  if (e.response?.resolution_state) return e.response.resolution_state;
  if (e.mapped_action) return e.mapped_action.replace(/_/g, " ");
  if (e.machine_assessment) return e.machine_assessment.replace(/^evidence_/, "").replace(/_/g, " ");
  if (e.change_classification && e.change_classification !== "none") return e.change_classification;
  if (e.task?.task_id) return `task ${e.task.task_id}`;
  if (e.projection?.box_metadata && e.projection.box_metadata !== "n/a") return e.projection.box_metadata;
  return e.actor.type;
}

/** The chain footer: "Chain verified N/N" from the export manifest, plus the export links. */
export function ChainFooter({ manifest, error }: { manifest: ManifestWithChain | null; error?: string | null }) {
  const cv = manifest?.chain_verification;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t pt-2 text-[12px]" style={{ borderColor: C.border, color: C.secondary }}>
      {cv ? (
        <span className="font-bold tabular-nums" style={{ color: cv.ok ? C.text : C.red }}>
          {cv.ok ? "Chain verified" : "Chain broken at"} {cv.verified}/{cv.total}
        </span>
      ) : error ? (
        <span style={{ color: C.red }}>Manifest unavailable: {error}</span>
      ) : manifest ? null : (
        <span>Checking chain…</span>
      )}
      <a className="hover:underline" style={{ color: C.boxBlue }} href={api.exportCsvUrl} download="keel-ledger-export.csv">
        Export CSV
      </a>
      <a className="hover:underline" style={{ color: C.boxBlue }} href={api.exportManifestUrl} download="keel-export-manifest.json">
        Manifest
      </a>
    </div>
  );
}

export function useManifest(dep?: unknown) {
  const [manifest, setManifest] = useState<ManifestWithChain | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const ctrl = new AbortController();
    api
      .exportManifest(ctrl.signal)
      .then((m) => {
        setManifest(m as ManifestWithChain);
        setError(null);
      })
      .catch((e) => !ctrl.signal.aborted && setError(errorText(e)));
    return () => ctrl.abort();
  }, [dep]);
  return { manifest, error };
}

const hdOf = (e: LedgerEvent): string | null => {
  const hd = e.human_disposition as unknown;
  if (typeof hd === "string") return hd;
  if (hd && typeof hd === "object" && "disposition" in hd) return String((hd as { disposition: string }).disposition);
  return null;
};

/**
 * What an event means in the return-to-author context (judge B5). A return is a rejected task response (the
 * reviewer's reason), then a confirmed finding, then the author task and the disposition. `all` is the list the
 * event sits in, oldest first. Returns null when the plain event type says enough.
 */
export function meaningOf(e: LedgerEvent, all: LedgerEvent[]): string | null {
  if (e.event_type === "box_task_response_ingested" && e.response?.resolution_state === "rejected") return "reason recorded (task response)";
  if (e.event_type === "acknowledgment_recorded") {
    const i = all.indexOf(e);
    const same = (x: LedgerEvent) => (e.finding_id && x.finding_id ? x.finding_id === e.finding_id : x.control_id === e.control_id);
    const returned = all.slice(i + 1).some((x) => x.event_type === "human_disposition_recorded" && hdOf(x) === "returned_to_author" && same(x));
    if (returned) return "finding confirmed";
  }
  return null;
}

export function EventLine({ e, meaning }: { e: LedgerEvent; meaning?: string | null }) {
  return (
    <li className="py-1.5">
      <div className="flex items-baseline gap-2 min-w-0">
        <span className="mono text-[12px] font-bold flex-none" style={{ color: C.text }}>
          {e.event_id}
        </span>
        {meaning ? (
          <span className="flex-none text-[12.5px] font-bold" style={{ color: C.text }}>
            {meaning}
          </span>
        ) : null}
        <span className="mono truncate text-[12px]" style={{ color: meaning ? C.secondary : C.text }} title={e.event_type}>
          {e.event_type}
        </span>
      </div>
      <div className="mono pl-[1px] text-[11.5px]" style={{ color: C.secondary }}>
        {[
          meaning ? null : detailWord(e),
          e.actor.type === "human" && e.actor.box_user_id ? `Box user ${e.actor.box_user_id}` : null,
          `chain ${chainShort(e.chain_hash)}`,
        ]
          .filter(Boolean)
          .join(" · ")}
      </div>
    </li>
  );
}

/** Ledger events for one control, newest first (GET /api/ledger?control=…). */
export function RecordList({ controlId, refreshKey }: { controlId: string; refreshKey?: unknown }) {
  const [events, setEvents] = useState<LedgerEvent[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const { manifest, error } = useManifest(refreshKey);

  useEffect(() => {
    const ctrl = new AbortController();
    api
      .ledger(controlId, ctrl.signal)
      .then((l) => {
        setEvents(l.events);
        setErr(null);
      })
      .catch((e) => !ctrl.signal.aborted && setErr(errorText(e)));
    return () => ctrl.abort();
  }, [controlId, refreshKey]);

  return (
    <div className="rounded-[4px] border px-3 py-2" style={{ borderColor: C.border }}>
      {err ? <p className="text-[12px]" style={{ color: C.red }}>{err}</p> : null}
      {!events && !err ? <p className="text-[12px]" style={{ color: C.secondary }}>Loading the record…</p> : null}
      {events ? (
        <ol className="max-h-[260px] overflow-y-auto divide-y divide-[#E8E8E8]" aria-label={`Ledger events for ${controlId}, newest first`}>
          {events
            .slice()
            .reverse()
            .map((e) => (
              <EventLine key={e.event_id} e={e} meaning={meaningOf(e, events)} />
            ))}
        </ol>
      ) : null}
      <div className="mt-1">
        <ChainFooter manifest={manifest} error={error} />
      </div>
    </div>
  );
}
