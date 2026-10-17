"use client";

import { useEffect } from "react";
import { AnimatePresence, motion } from "motion/react";
import { IconClose } from "./icons";

/** Box-style notification: top centre under the header, red for errors, dark for warnings, closes itself after 8 s. */
export function Toast({ text, onClose, tone = "error" }: { text: string | null; onClose: () => void; tone?: "error" | "warning" }) {
  useEffect(() => {
    if (!text) return;
    const t = setTimeout(onClose, 8000);
    return () => clearTimeout(t);
  }, [text, onClose]);

  return (
    <div className="pointer-events-none fixed inset-x-0 top-[68px] z-[70] flex justify-center">
      <AnimatePresence>
        {text ? (
          <motion.div
            key={text}
            role={tone === "error" ? "alert" : "status"}
            data-testid="box-toast"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            style={{ background: tone === "error" ? "#ED3757" : "#222222" }}
            className="box-root pointer-events-auto flex max-w-[560px] items-center gap-3 rounded-md py-2.5 pl-4 pr-2 text-[14px] text-white shadow-[0_4px_16px_rgba(0,0,0,0.18)]"
          >
            <span>{text}</span>
            <button type="button" aria-label="Dismiss" onClick={onClose} className="flex h-7 w-7 shrink-0 items-center justify-center rounded hover:bg-white/15">
              <IconClose size={14} />
            </button>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
