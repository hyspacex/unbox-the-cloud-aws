"use client";

import { useEffect, useRef } from "react";
import { useFocusTrap } from "@/lib/ui/useFocusTrap";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { T_FAST, T_SLOW } from "@/lib/ui/motion";

export function Drawer({
  open,
  onClose,
  children,
  width = "min(1100px, 94vw)",
  label = "Finding card",
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  width?: number | string;
  label?: string;
}) {
  const panelRef = useRef<HTMLElement>(null);
  useFocusTrap(panelRef, open);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !document.querySelector("[data-keel-modal]")) onClose();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (typeof document === "undefined") return null;
  return createPortal(
    <AnimatePresence>
      {open ? (
        <motion.div key="drawer-root" className="fixed inset-0 z-[60]" aria-label={label}>
          <motion.div
            className="absolute inset-0 bg-[rgb(23_25_28/0.18)]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={T_FAST}
            onClick={onClose}
          />
          <motion.aside
            ref={panelRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-label={label}
            className="absolute right-0 top-0 h-full bg-paper overflow-y-auto scroll-quiet outline-none"
            style={{ width, maxWidth: "100vw", boxShadow: "var(--shadow-drawer)" }}
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={T_SLOW}
          >
            {children}
          </motion.aside>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}
