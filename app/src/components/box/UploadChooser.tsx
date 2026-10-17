"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useFocusTrap } from "@/lib/ui/useFocusTrap";
import { AnimatePresence, motion } from "motion/react";
import type { PackageFile } from "@/lib/types";
import type { UploadVersionRequest } from "@/components/KeelStateProvider";
import { FileTypeIcon, IconClose } from "./icons";

/** The route's decoded size limit (KEEL_UPLOAD_MAX_BYTES default); checked before reading so a large file fails fast. */
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/** The fixture's prepared upload in mock mode (decision 11): the v3 rewrite of architecture.md. */
const MOCK_CHOICE = { file_name: "architecture.md", title: "architecture.md (v3 draft)", note: "Section 4 rewrite", scenario: "architecture_v3" };

/** Reads a file as base64 with an abortable FileReader (the chooser aborts it on close). */
function readBase64(file: File, onReader: (r: FileReader) => void): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    onReader(r);
    r.onerror = () => reject(r.error ?? new Error("The file could not be read."));
    r.onabort = () => reject(new DOMException("aborted", "AbortError"));
    r.onload = () => {
      const s = String(r.result ?? "");
      resolve(s.slice(s.indexOf(",") + 1));
    };
    r.readAsDataURL(file);
  });
}

/** A small Box modal: choose the file that becomes the new version, then Upload. */
export function UploadChooser(props: {
  open: boolean;
  /** Live: the file preselected as the one that receives the version (from a row's ⋯ menu). */
  initialTarget?: string;
  /** The control that opened the chooser; focus returns to it on close (codex #19). */
  openerSelector?: string;
  isMock: boolean;
  files: PackageFile[];
  onClose: () => void;
  onUpload: (req: UploadVersionRequest) => void;
}) {
  // Rendered into <body> so the whole app root can be made inert behind it.
  if (typeof document === "undefined") return null;
  return createPortal(<AnimatePresence>{props.open ? <ChooserDialog key="chooser" {...props} /> : null}</AnimatePresence>, document.body);
}

/** Mounted only while open, so every opening starts from the prepared choice. */
function ChooserDialog({
  isMock,
  files,
  onClose,
  onUpload,
  initialTarget,
  openerSelector,
}: {
  initialTarget?: string;
  openerSelector?: string;
  isMock: boolean;
  files: PackageFile[];
  onClose: () => void;
  onUpload: (req: UploadVersionRequest) => void;
}) {
  const [picked, setPicked] = useState(true);
  const [target, setTarget] = useState<string>(initialTarget ?? "architecture.md");
  const [file, setFile] = useState<File | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  /** Synchronous guards (codex #21): one submission per opening, nothing after close. */
  const submittingRef = useRef(false);
  const closedRef = useRef(false);
  const readerRef = useRef<FileReader | null>(null);

  // Focus trap inside the dialog; the first control takes focus.
  useFocusTrap(dialogRef, true, 'input, button[data-testid="upload-confirm"]');

  useEffect(() => {
    // (Re)mounted open: StrictMode runs this effect twice in development, so the guards are re-armed here.
    closedRef.current = false;
    submittingRef.current = false;
    // Background inert while open: neither Tab nor a click reaches the Box page or the Keel panel.
    const root = document.getElementById("keel-app-root");
    root?.setAttribute("inert", "");
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey, true);
    const closed = closedRef;
    const reader = readerRef;
    return () => {
      closed.current = true;
      reader.current?.abort();
      document.removeEventListener("keydown", onKey, true);
      root?.removeAttribute("inert");
      // Focus returns to the control that opened the chooser.
      const opener = openerSelector ? document.querySelector<HTMLElement>(openerSelector) : null;
      setTimeout(() => opener?.isConnected && opener.focus({ preventScroll: true }), 0);
    };
  }, [onClose, openerSelector]);

  const targetFile = files.find((f) => f.file_name === target) ?? files[0];
  const canUpload = !reading && (isMock ? picked : Boolean(file && targetFile));

  const submit = async () => {
    if (submittingRef.current || closedRef.current) return;
    submittingRef.current = true;
    if (isMock) {
      onUpload({ file_name: MOCK_CHOICE.file_name, scenario: MOCK_CHOICE.scenario });
      return;
    }
    if (!file || !targetFile) {
      submittingRef.current = false;
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      submittingRef.current = false;
      setErr("This file is larger than 10 MB. Choose a smaller file.");
      return;
    }
    setReading(true);
    try {
      const content_base64 = await readBase64(file, (r) => (readerRef.current = r));
      if (closedRef.current) return; // cancelled while reading
      // An empty file is sent only as an explicit empty upload (the route rejects it otherwise).
      onUpload({ file_name: targetFile.file_name, file_id: targetFile.file_id, content_base64, ...(file.size === 0 ? { allow_empty: true } : {}) });
    } catch (e) {
      if (closedRef.current) return;
      submittingRef.current = false;
      setReading(false);
      setErr(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <motion.div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <motion.div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="upload-chooser-title"
        initial={{ opacity: 0, y: 8, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 8, scale: 0.98 }}
        transition={{ duration: 0.18 }}
        className="box-root w-[440px] rounded-lg bg-white shadow-[0_12px_40px_rgba(0,0,0,0.2)]"
      >
        <div className="flex items-center justify-between px-6 pt-5 pb-3">
          <h2 id="upload-chooser-title" className="text-[18px] font-bold text-[#222222]">
            Upload new version
          </h2>
          <button type="button" aria-label="Close" onClick={onClose} className="box-icon-btn h-8 w-8">
            <IconClose />
          </button>
        </div>
        <div className="px-6 pb-2">
          <p className="mb-3 text-[13px] text-[#767676]">Choose a file</p>
          {isMock ? (
            <label className={`flex cursor-pointer items-start gap-3 rounded-md border px-3 py-3 transition-colors ${picked ? "border-[#0061D5] bg-[#F2F7FD]" : "border-[#E8E8E8] hover:bg-[#F4F6FA]"}`}>
              <input
                type="radio"
                name="upload-choice"
                checked={picked}
                onChange={() => setPicked(true)}
                className="mt-2 accent-[#0061D5]"
                data-testid="upload-choice"
              />
              <FileTypeIcon size={32} />
              <span className="flex flex-col">
                <span className="text-[14px] font-bold text-[#222222]">{MOCK_CHOICE.title}</span>
                <span className="text-[12px] text-[#767676]">{MOCK_CHOICE.note}</span>
              </span>
            </label>
          ) : (
            <div className="space-y-3">
              <label className="block">
                <span className="mb-1 block text-[12px] text-[#767676]">Replace</span>
                <select
                  value={targetFile?.file_name ?? ""}
                  disabled={reading}
                  onChange={(e) => setTarget(e.target.value)}
                  className="h-9 w-full rounded-md border border-[#D3D3D3] bg-white px-2 text-[14px]"
                >
                  {files.map((f) => (
                    <option key={f.file_id} value={f.file_name}>
                      {f.file_name} {f.version_label ? `(${f.version_label})` : ""}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-[12px] text-[#767676]">New version from this computer</span>
                <input
                    type="file"
                  disabled={reading}
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  className="block w-full text-[13px] file:mr-3 file:rounded-md file:border file:border-[#D3D3D3] file:bg-white file:px-3 file:py-1.5 file:text-[13px] file:font-bold"
                  data-testid="upload-file-input"
                />
              </label>
            </div>
          )}
          {err ? <p className="mt-2 text-[12px] text-[#C62828]">{err}</p> : null}
        </div>
        <div className="flex justify-end gap-2 px-6 pt-3 pb-5">
          <button type="button" className="box-btn box-btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="box-btn box-btn-primary" disabled={!canUpload} onClick={submit} data-testid="upload-confirm" aria-busy={reading || undefined}>
            {reading ? "Reading…" : "Upload"}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
