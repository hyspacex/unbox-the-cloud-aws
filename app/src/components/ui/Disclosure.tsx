"use client";

import { useId, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { T_BASE } from "@/lib/ui/motion";

export function Caret({ open }: { open: boolean }) {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 10 10"
      aria-hidden
      className="caret flex-none"
      data-open={open}
      style={{ transform: open ? "rotate(90deg)" : undefined }}
    >
      <path d="M3 1.5 6.5 5 3 8.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Labelled progressive disclosure. Content is never hidden without a visible label. */
export function Disclosure({
  label,
  hint,
  defaultOpen = false,
  children,
  className = "",
  buttonClassName = "",
}: {
  label: React.ReactNode;
  hint?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
  className?: string;
  buttonClassName?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  return (
    <div className={className}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        className={`group inline-flex items-center gap-2 text-[13px] font-medium text-ink-2 hover:text-ink ${buttonClassName}`}
      >
        <Caret open={open} />
        <span>{label}</span>
        {hint ? <span className="text-faint font-normal">{hint}</span> : null}
      </button>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            id={id}
            key="content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={T_BASE}
            style={{ overflow: "hidden" }}
          >
            <div className="pt-3">{children}</div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
