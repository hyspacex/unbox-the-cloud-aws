"use client";

import { motion } from "motion/react";
import type { FindingReceipt } from "@/lib/types";
import { C, CheckIcon, DUR, EASE_OUT, toneColor } from "./parts";

/** The three-line receipt under a recorded decision (design 2.4, decision 4). Lines come from the engine. */
export function Receipt({ receipt }: { receipt: FindingReceipt }) {
  // Green only for a human Verified: the engine sets tone "green" only then.
  const color = receipt.tone === "green" ? C.green : receipt.tone === "blue" ? C.blue : toneColor("grey");
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: DUR.inline, ease: EASE_OUT }}
      className="flex gap-2"
      role="status"
      data-tone={receipt.tone}
    >
      <span className="mt-[2px]">
        <CheckIcon size={15} color={color} />
      </span>
      <div className="min-w-0 text-[13px] leading-[1.5]">
        <div className="font-bold" style={{ color }}>
          {receipt.line1}
        </div>
        <div style={{ color: C.secondary }}>{receipt.line2}</div>
        <div style={{ color: C.secondary }}>{receipt.line3}</div>
      </div>
    </motion.div>
  );
}
