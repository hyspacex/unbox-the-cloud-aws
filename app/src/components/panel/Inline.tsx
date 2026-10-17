"use client";

import { motion } from "motion/react";
import { C, DUR, EASE_OUT } from "./parts";

/** Inline expand (design 2.4 decision 5, motion section 4): height auto 240 ms, content fades in after 80 ms. */
export function InlineExpand({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <motion.div
      key={label}
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: "auto", opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={{ duration: DUR.inline, ease: EASE_OUT }}
      style={{ overflow: "hidden" }}
      aria-label={label}
      role="region"
    >
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.16, delay: 0.08 }}
        className="mt-3 rounded-[4px] border p-3"
        style={{ borderColor: C.border, background: "#FAFBFC" }}
      >
        {children}
      </motion.div>
    </motion.div>
  );
}

export function ErrorLine({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <p className="mt-1.5 text-[12px] leading-[1.4]" style={{ color: C.red }} role="alert">
      {text}
    </p>
  );
}
