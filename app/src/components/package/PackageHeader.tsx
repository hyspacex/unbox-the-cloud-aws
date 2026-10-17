"use client";

import { AnimatePresence, motion } from "motion/react";
import type { PackageView } from "@/lib/types";
import { utc } from "@/lib/ui/format";
import { Hash } from "@/components/ui/Mono";
import { T_BASE } from "@/lib/ui/motion";

/** One compact header: project, then a single meta line with the ARB decision and the snapshot. */
export function PackageHeader({ view }: { view: Pick<PackageView, "header" | "snapshot" | "profile" | "prior_snapshot_id"> }) {
  const { header, snapshot, profile } = view;
  const d = header.arb_decision;
  return (
    <section>
      <div className="eyebrow mb-1.5">
        ARB package in Box{header.folderName ? ` · ${header.folderName}` : ""} ·{" "}
        <span className="mono normal-case tracking-normal">folder {header.folderId}</span>
      </div>
      <h1 className="text-[26px] leading-[1.15] font-semibold tracking-[-0.025em] text-ink text-balance">{header.project}</h1>
      <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13.5px] text-ink-2">
        <span className="mono">{header.application_id}</span>
        <Dot />
        <span>{header.application_tier}</span>
        <Dot />
        <span>{header.regulatory_scope}</span>
        <Dot />
        <span>
          <span className="mono">{d.id}</span> {d.outcome} {d.date}, chair {d.chair}
        </span>
        <Dot />
        <span className="inline-flex items-center gap-1.5">
          Snapshot
          <span className="relative inline-flex overflow-hidden">
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={snapshot.snapshot_id}
                initial={{ y: "45%", opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: "-45%", opacity: 0 }}
                transition={{ ...T_BASE, duration: 0.16 }}
                className="mono font-semibold text-ink rounded-md border border-line-strong bg-panel px-1.5"
                data-testid="header-snapshot"
              >
                {snapshot.snapshot_id}
              </motion.span>
            </AnimatePresence>
          </span>
          <span className="text-muted">
            captured <span className="mono">{utc(snapshot.captured_at)}</span>
          </span>
        </span>
        <Dot />
        <span className="text-muted">
          {snapshot.files.length} files · manifest <Hash value={snapshot.manifest_hash} /> · profile{" "}
          <span className="mono">{profile.profile_version}</span>
        </span>
      </p>
    </section>
  );
}

function Dot() {
  return <span className="text-faint" aria-hidden>·</span>;
}
