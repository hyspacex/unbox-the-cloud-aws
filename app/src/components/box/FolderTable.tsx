"use client";

import Link from "next/link";
import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { PackageFile } from "@/lib/types";
import { useKeelState, type UploadState } from "@/components/KeelStateProvider";
import { DetailsPane } from "./DetailsPane";
import { BoxDropdown, UploadMenu } from "./UploadMenu";
import { UploadChooser } from "./UploadChooser";
import { boxDate, boxSize } from "./format";
import { Toast } from "./Toast";
import { FileTypeIcon, IconChevronRight, IconInfo, IconMore } from "./icons";

const CRUMBS = ["All Files", "Project Lantern"];
const FOLDER = "Security Review Package";
/** Grid template lives in globals.css (.box-grid): container queries keep Name at 260 px and drop Actions, Size, then Updated. */
const COLS = "box-grid";

/** The Box folder list: breadcrumb, toolbar, and the file table driven by GET /api/package `files`. */
export function FolderTable() {
  const { pkg, pkgError, busy, isMock, uploadVersion, upload, uploadError, dismissUploadError } = useKeelState();
  const [chooser, setChooser] = useState(false);
  const [details, setDetails] = useState(false);
  const files = pkg?.files;

  return (
    <div className="flex min-w-0 flex-1">
      <section className="flex min-w-0 flex-1 flex-col">
        <div className="box-bar flex h-[72px] shrink-0 items-center gap-4 px-8">
          <nav aria-label="Breadcrumb" className="flex min-w-0 flex-1 items-center gap-1.5 text-[16px]">
            {CRUMBS.map((c) => (
              <span key={c} className="box-crumb flex shrink-0 items-center gap-1.5">
                <Link href="/" className="rounded px-0.5 text-[#767676] hover:text-[#0061D5] hover:underline">
                  {c}
                </Link>
                <IconChevronRight size={12} className="text-[#A7A7A7]" />
              </span>
            ))}
            <h1 className="min-w-[120px] truncate text-[20px] font-bold text-[#222222]" title={FOLDER}>
              {FOLDER}
            </h1>
          </nav>
          <div className="flex shrink-0 items-center gap-2">
            <BoxDropdown label="New" variant="primary" items={[{ label: "Folder" }, { label: "Box Note" }, { label: "Box Canvas" }]} />
            <UploadMenu disabled={busy || !files} onNewVersion={() => setChooser(true)} />
            <button
              type="button"
              aria-label="Details"
              aria-pressed={details}
              onClick={() => setDetails((d) => !d)}
              className={`box-icon-btn ${details ? "bg-[#E8F0FE] text-[#0061D5]" : ""}`}
              data-testid="details-toggle"
            >
              <IconInfo size={22} />
            </button>
          </div>
        </div>

        <Toast text={uploadError} onClose={dismissUploadError} />

        <div className="min-h-0 flex-1 overflow-y-auto px-8 pb-24">
          <div className="box-table" role="table" aria-label="Files">
          <div role="row" className={`grid ${COLS} h-10 items-center border-b border-[#E8E8E8] text-[13px] font-bold text-[#767676]`}>
            <span role="columnheader" className="pl-14">
              Name
            </span>
            <span role="columnheader" className="col-updated">
              Updated
            </span>
            <span role="columnheader">Version</span>
            <span role="columnheader" className="col-size">
              Size
            </span>
            <span role="columnheader" className="col-actions sr-only">
              Actions
            </span>
          </div>
          {files ? (
            files.map((f) => <FileRow key={f.file_id} file={f} upload={upload?.file_name === f.file_name ? upload : null} />)
          ) : pkgError ? (
            <p className="py-6 text-[14px] text-[#767676]">This folder could not be loaded. Try again in a moment.</p>
          ) : (
            <SkeletonRows />
          )}
          </div>
        </div>
      </section>

      <AnimatePresence initial={false}>
        {details ? <DetailsPane key="details" pkg={pkg} folderName={FOLDER} onClose={() => setDetails(false)} /> : null}
      </AnimatePresence>

      <UploadChooser
        open={chooser}
        isMock={isMock}
        files={files ?? []}
        onClose={() => setChooser(false)}
        onUpload={(req) => {
          setChooser(false);
          uploadVersion(req);
        }}
      />
    </div>
  );
}

function SkeletonRows() {
  return (
    <div aria-busy="true" aria-label="Loading files">
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className={`grid ${COLS} h-12 items-center border-b border-[#F0F0F0]`}>
          <span className="flex items-center gap-3 pl-3">
            <span className="box-skeleton h-8 w-8" />
            <span className="box-skeleton h-3.5" style={{ width: `${46 - i * 4}%` }} />
          </span>
          <span className="col-updated box-skeleton h-3 w-14" />
          <span className="box-skeleton h-3 w-6" />
          <span className="col-size box-skeleton h-3 w-10" />
          <span className="col-actions" />
        </div>
      ))}
    </div>
  );
}

/** Hover text for the row dot, from the file's computed counts. */
function dotTitle(f: PackageFile): string | null {
  if (f.open_decisions > 0) return `Keel: ${f.open_decisions} control${f.open_decisions === 1 ? " needs" : "s need"} your decision`;
  if (f.recorded_decisions > 0) return `Keel: ${f.recorded_decisions} decision${f.recorded_decisions === 1 ? "" : "s"} recorded on this file`;
  return null;
}

function FileRow({ file: f, upload }: { file: PackageFile; upload: UploadState }) {
  const tone = f.open_decisions > 0 ? "amber" : f.recorded_decisions > 0 ? "blue" : null;
  const title = dotTitle(f);
  const uploading = upload?.phase === "uploading";

  return (
    <div
      role="row"
      data-file={f.file_name}
      className={`group grid ${COLS} h-12 items-center border-b border-[#F0F0F0] transition-colors hover:bg-[#F4F6FA]`}
    >
      <span role="cell" className="flex min-w-0 items-center gap-3 pl-3 pr-4">
        <FileTypeIcon size={32} />
        <Link href="/" onClick={(e) => e.preventDefault()} className="truncate text-[14px] font-bold text-[#222222] hover:text-[#0061D5] hover:underline">
          {f.file_name}
        </Link>
        <AnimatePresence>
          {tone ? (
            <motion.span
              key="dot"
              role="img"
              aria-label={title ?? undefined}
              title={title ?? undefined}
              data-testid={`dot-${f.file_name}`}
              data-tone={tone}
              initial={{ scale: 0 }}
              animate={{ scale: 1, backgroundColor: tone === "amber" ? "#F59E0B" : "#1D4ED8" }}
              exit={{ scale: 0 }}
              transition={{ scale: { duration: 0.2 }, backgroundColor: { duration: 0.3 } }}
              className="h-2 w-2 shrink-0 cursor-default rounded-full"
            />
          ) : null}
        </AnimatePresence>
      </span>

      {upload ? (
        <span role="cell" className="col-progress flex min-w-0 items-center gap-3 pr-6" aria-live="polite">
          <span className="relative h-1.5 w-[160px] min-w-[80px] shrink overflow-hidden rounded-full bg-[#E8E8E8]">
            <motion.span
              className="absolute inset-y-0 left-0 rounded-full bg-[#0061D5]"
              initial={{ width: "0%" }}
              animate={{ width: uploading ? (upload.durationMs ? "100%" : "88%") : "100%" }}
              transition={{ duration: uploading ? (upload.durationMs ? upload.durationMs / 1000 : 6) : 0.15, ease: upload.durationMs ? "linear" : "easeOut" }}
            />
          </span>
          <span className="text-[13px] text-[#767676]">{uploading ? "Uploading new version…" : "Upload complete"}</span>
        </span>
      ) : (
        <>
          <span role="cell" className="col-updated text-[14px] text-[#767676]">
            <Fade k={f.updated_at ?? ""}>{boxDate(f.updated_at)}</Fade>
          </span>
          <span role="cell" className="text-[14px] text-[#222222]">
            <Fade k={f.version_label ?? f.version_id}>{f.version_label ?? ""}</Fade>
          </span>
          <span role="cell" className="col-size text-[14px] text-[#767676]">
            <Fade k={String(f.size_bytes ?? "")}>{boxSize(f.size_bytes)}</Fade>
          </span>
        </>
      )}

      <span role="cell" className={`col-actions ${upload ? "!hidden" : ""} flex items-center justify-end gap-1 pr-2 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100`}>
        <button type="button" className="box-btn box-btn-secondary h-8 px-3 text-[13px]">
          Share
        </button>
        <button type="button" aria-label={`More options for ${f.file_name}`} className="box-icon-btn h-8 w-8">
          <IconMore size={18} />
        </button>
      </span>
    </div>
  );
}

/** Version text crossfades when the value changes. */
function Fade({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <AnimatePresence mode="popLayout" initial={false}>
      <motion.span key={k} className="inline-block" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }}>
        {children}
      </motion.span>
    </AnimatePresence>
  );
}
