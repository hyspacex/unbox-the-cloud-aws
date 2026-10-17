"use client";

import { useCallback, useEffect, useState } from "react";
import type { ActionResponse, ControlRow, FindingCard } from "@/lib/types";
import { api, peekFinding } from "@/lib/client";
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
}: {
  id: string;
  layout: "drawer" | "page";
  onClose?: () => void;
  onSelect?: (id: string) => void;
  onChanged?: (r: ActionResponse) => void;
}) {
  const { config } = useKeel();
  const [card, setCard] = useState<FindingCard | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [project, setProject] = useState<string | undefined>(undefined);

  useEffect(() => {
    api
      .package()
      .then((p) => setProject(p.header.project))
      .catch(() => {});
  }, []);

  const load = useCallback(
    () => {
      return api
        .finding(id)
        .then((c) => {
          setCard(c);
          setErr(null);
        })
        .catch((e: unknown) => setErr(e instanceof Error ? e.message : String(e)));
    },
    [id],
  );

  useEffect(() => {
    load();
  }, [id, load]);

  const onResult = (r: ActionResponse) => {
    onChanged?.(r);
    // Reload so the thread and actions reflect the ledger; the result panel stays.
    setTimeout(() => load(), 350);
  };

  // B5: a prefetched card renders at once; the fresh fetch replaces it.
  const shown = card && (card.finding.finding_id === id || card.finding.control_id === id) ? card : peekFinding(id) ?? null;

  const onSelectRelated = (row: ControlRow) => onSelect?.(row.finding_id ?? row.control_id);

  if (err && !shown) {
    return (
      <div className={layout === "drawer" ? "p-7" : ""}>
        <ErrorBlock title={`Could not load finding ${id}`} message={err} onRetry={() => load()} />
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
      layout={layout}
      onClose={onClose}
      onResult={onResult}
      onSelectRelated={onSelect ? onSelectRelated : undefined}
    />
  );
}
