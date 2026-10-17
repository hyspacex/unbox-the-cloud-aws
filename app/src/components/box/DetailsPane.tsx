"use client";

import { motion } from "motion/react";
import type { PackageView } from "@/lib/types";
import { boxDate } from "./format";
import { IconClose } from "./icons";

/** Box's right-hand details pane for the folder: folder details, then the keelReview metadata as Box renders it. */
export function DetailsPane({ pkg, folderName, onClose }: { pkg: PackageView | null; folderName: string; onClose: () => void }) {
  const p = pkg?.projection ?? null;
  const files = pkg?.files ?? [];
  const latest = files.map((f) => f.updated_at).filter(Boolean).sort().pop();
  const fields: { label: string; value: string }[] = p
    ? [
        { label: "Keel snapshot id", value: p.keel_snapshot_id },
        ...Object.keys(p.statuses)
          .sort()
          .map((id) => ({ label: `Keel status ${id}`, value: p.statuses[id] })),
        { label: "Keel last human review", value: p.keel_last_human_review ?? "" },
        { label: "Keel record URL", value: p.keel_record_url },
      ]
    : [];

  return (
    <motion.aside
      aria-label="Details"
      initial={{ width: 0, opacity: 0 }}
      animate={{ width: 340, opacity: 1 }}
      exit={{ width: 0, opacity: 0 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      className="h-full shrink-0 overflow-hidden border-l border-[#E8E8E8] bg-white"
      data-testid="details-pane"
    >
      <div className="h-full w-[340px] overflow-y-auto">
        <div className="flex h-14 items-center justify-between border-b border-[#E8E8E8] px-5">
          <h2 className="text-[16px] font-bold">Details</h2>
          <button type="button" aria-label="Close details" onClick={onClose} className="box-icon-btn h-8 w-8">
            <IconClose />
          </button>
        </div>
        <section className="border-b border-[#E8E8E8] px-5 py-4">
          <h3 className="mb-3 text-[14px] font-bold">Folder details</h3>
          <dl className="space-y-3">
            <Field label="Name" value={folderName} />
            {pkg?.header.folderId ? <Field label="Folder ID" value={pkg.header.folderId} /> : null}
            <Field label="Items" value={files.length ? `${files.length} files` : ""} />
            {latest ? <Field label="Modified" value={boxDate(latest)} /> : null}
          </dl>
        </section>
        <section className="px-5 py-4">
          <h3 className="mb-3 text-[14px] font-bold">Metadata</h3>
          {p ? (
            <div className="rounded-md border border-[#E8E8E8]">
              <div className="flex items-center justify-between border-b border-[#E8E8E8] px-4 py-2.5">
                <span className="text-[14px] font-bold">Keel review</span>
                <span className="text-[12px] text-[#767676]">keelReview</span>
              </div>
              <dl className="space-y-3 px-4 py-3">
                {fields.map((f) => (
                  <Field key={f.label} label={f.label} value={f.value} mono={f.label.startsWith("Keel status") || f.label === "Keel snapshot id"} />
                ))}
              </dl>
            </div>
          ) : (
            <p className="text-[13px] text-[#767676]">No metadata on this folder.</p>
          )}
        </section>
      </div>
    </motion.aside>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-[12px] text-[#767676]">{label}</dt>
      <dd className={`mt-0.5 break-words text-[14px] text-[#222222] ${mono ? "tabular-nums" : ""}`}>{value || "—"}</dd>
    </div>
  );
}
