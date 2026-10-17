"use client";

import { AnimatePresence, motion } from "motion/react";
import { T_BASE } from "@/lib/ui/motion";

/**
 * Renders PackageView.count_line verbatim (computed server-side). Numbers are wrapped
 * so a change morphs the digits; the words are never rewritten by the UI.
 */
export function CountLine({ text, className = "" }: { text: string; className?: string }) {
  const parts = text.split(/(?<![A-Za-z0-9.-])(\d+)(?![A-Za-z0-9.-])/);
  // Key numbers by their position among numbers so each slot animates independently.
  let numIdx = 0;
  return (
    <p className={`tabular-nums ${className}`} aria-live="polite" aria-label={text}>
      {parts.map((p, i) => {
        if (i % 2 === 1 && /^\d+$/.test(p)) {
          const slot = numIdx++;
          return <Digits key={`n${slot}`} value={p} />;
        }
        return (
          <span key={`t${i}`} aria-hidden>
            {p}
          </span>
        );
      })}
    </p>
  );
}

function Digits({ value }: { value: string }) {
  return (
    <span className="relative inline-flex overflow-hidden align-baseline" aria-hidden>
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={value}
          initial={{ y: "45%", opacity: 0 }}
          animate={{ y: "0%", opacity: 1 }}
          exit={{ y: "-45%", opacity: 0 }}
          transition={{ ...T_BASE, duration: 0.16 }}
          className="inline-block font-semibold"
        >
          {value}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}
