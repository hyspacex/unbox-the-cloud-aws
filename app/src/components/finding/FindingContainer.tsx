"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ActionResponse, ControlRow, FindingCard } from "@/lib/types";
import { api, ApiError, isAbort, peekFinding } from "@/lib/client";
import { useKeel } from "@/components/AppProvider";
import { ErrorBlock, LoadingBlock } from "@/components/ui/States";
import { FindingCardView } from "./FindingCard";

/** Loads a FindingCard by finding id or control id and renders it. */
export function FindingContainer({
  id,
  layout,
  onClose,
  onSelect,
  onChanged,
  onPending,
}: {
  id: string;
  layout: "drawer" | "page";
  onClose?: () => void;
  onSelect?: (id: string) => void;
  onChanged?: (r: ActionResponse) => void;
  /** A return is recorded and awaiting draft approval: the package should refresh its notice. */
  onPending?: () => void;
}) {
  const { config } = useKeel();
  const router = useRouter();
  // The loaded card is stored with the id it was requested for, so a late response for another id never shows.
  const [loaded, setLoaded] = useState<{ id: string; card: FindingCard } | null>(null);
  const [err, setErr] = useState<{ id: string; message: string; status?: number } | null>(null);
  const reqRef = useRef<{ gen: number; ctrl: AbortController | null }>({ gen: 0, ctrl: null });
  const refreshRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [project, setProject] = useState<string | undefined>(undefined);

  useEffect(() => {
    const ctrl = new AbortController();
    api
      .package(ctrl.signal)
      .then((p) => setProject(p.header.project))
      .catch(() => {});
    return () => ctrl.abort();
  }, []);

  /** Load the card for `id`, aborting any superseded request; stale results are ignored. */
  const load = useCallback(() => {
    reqRef.current.ctrl?.abort();
    const ctrl = new AbortController();
    const gen = ++reqRef.current.gen;
    reqRef.current.ctrl = ctrl;
    return api
      .finding(id, ctrl.signal)
      .then((c) => {
        if (gen !== reqRef.current.gen) return;
        setLoaded({ id, card: c });
        setErr(null);
      })
      .catch((e: unknown) => {
        if (gen !== reqRef.current.gen || isAbort(e)) return;
        setErr({ id, message: e instanceof Error ? e.message : String(e), status: e instanceof ApiError ? e.status : undefined });
      });
  }, [id]);

  useEffect(() => {
    load();
    const r = reqRef.current;
    return () => {
      // Selection changed or unmounted: cancel the request and any delayed refresh.
      r.ctrl?.abort();
      r.gen++;
      if (refreshRef.current) clearTimeout(refreshRef.current);
      refreshRef.current = null;
    };
  }, [load]);

  const onResult = (r: ActionResponse) => {
    onChanged?.(r);
    // Reload so the thread and actions reflect the ledger; the result panel stays.
    if (refreshRef.current) clearTimeout(refreshRef.current);
    refreshRef.current = setTimeout(() => load(), 350);
  };

  // B5: a prefetched card renders at once; the fresh fetch replaces it.
  const shown = loaded?.id === id ? loaded.card : peekFinding(id) ?? null;
  const errFor = err?.id === id ? err.message : null;
  const gone = err?.id === id && err.status === 404;

  const onSelectRelated = (row: ControlRow) => onSelect?.(row.finding_id ?? row.control_id);

  if (gone && !shown) {
    return (
      <div className={layout === "drawer" ? "p-7" : ""}>
        <div className="rounded-[10px] border border-line-strong bg-panel px-4 py-3 text-[14px] text-ink-2" role="alert">
          <div className="font-medium text-ink">This finding is not on the current snapshot. Reload the package.</div>
          <p className="mt-0.5 text-[12.5px] text-muted">
            <span className="mono">{id}</span> belongs to an earlier snapshot, or the package was reset elsewhere.
          </p>
          <button
            className="btn btn-secondary btn-sm mt-2"
            onClick={() => {
              if (onClose) {
                // In the drawer: close it and have the package view reload itself.
                onClose();
                window.dispatchEvent(new Event("keel:reload-package"));
              } else router.push("/");
            }}
          >
            Reload package
          </button>
        </div>
      </div>
    );
  }
  if (errFor && !shown) {
    return (
      <div className={layout === "drawer" ? "p-7" : ""}>
        <ErrorBlock title={`Could not load finding ${id}`} message={errFor} onRetry={() => load()} />
      </div>
    );
  }
  if (!shown) {
    return (
      <div className={layout === "drawer" ? "p-7" : ""}>
        <div className="eyebrow mb-2">Finding</div>
        <div className="mono text-[20px] text-ink mb-5">{id}</div>
        <LoadingBlock lines={6} />
      </div>
    );
  }
  return (
    <FindingCardView
      key={shown.finding.finding_id}
      card={shown}
      mode={config?.mode}
      project={project}
      onRefresh={() => {
        load();
        onPending?.();
      }}
      layout={layout}
      onClose={onClose}
      onResult={onResult}
      onSelectRelated={onSelect ? onSelectRelated : undefined}
    />
  );
}
