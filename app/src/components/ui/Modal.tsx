"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { T_BASE, T_FAST } from "@/lib/ui/motion";

export function Modal({
  open,
  onClose,
  title,
  eyebrow,
  children,
  footer,
  width = 620,
}: {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  eyebrow?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: number;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (typeof document === "undefined") return null;
  return createPortal(
    <AnimatePresence>
      {open ? (
        <motion.div
          key="modal-root"
          className="fixed inset-0 z-[80] flex items-center justify-center p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={T_FAST}
        >
          <div className="absolute inset-0 bg-[rgb(23_25_28/0.32)] backdrop-blur-[2px]" onClick={onClose} />
          <motion.div
            role="dialog"
            aria-modal="true"
            className="relative bg-panel rounded-[14px] max-h-[88vh] flex flex-col"
            style={{ width, maxWidth: "100%", boxShadow: "var(--shadow-modal)" }}
            initial={{ opacity: 0, scale: 0.98, y: 6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: 4 }}
            transition={T_BASE}
          >
            <div className="px-6 pt-5 pb-4 border-b hairline">
              {eyebrow ? <div className="eyebrow mb-1">{eyebrow}</div> : null}
              <div className="flex items-start justify-between gap-4">
                <h2 className="text-[18px] font-semibold tracking-[-0.01em] text-ink">{title}</h2>
                <button onClick={onClose} className="btn btn-ghost btn-sm -mr-2" aria-label="Close">
                  <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
                    <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </button>
              </div>
            </div>
            <div className="px-6 py-5 overflow-y-auto scroll-quiet">{children}</div>
            {footer ? <div className="px-6 py-4 border-t hairline bg-panel-cool rounded-b-[14px]">{footer}</div> : null}
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}
