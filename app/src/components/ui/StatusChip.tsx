"use client";

import { AnimatePresence, motion } from "motion/react";
import type { DisplayedStatus } from "@/lib/types";
import { toneClass } from "@/lib/ui/tone";
import { T_BASE } from "@/lib/ui/motion";

/**
 * Renders a DisplayedStatus exactly as the engine computed it. Never decides a label.
 * Cross-fades old to new; during a pending re-check the prior label is shown struck through.
 */
export function StatusChip({
  status,
  size = "md",
  showSeverity = true,
}: {
  status: DisplayedStatus;
  size?: "sm" | "md";
  showSeverity?: boolean;
}) {
  const tone = toneClass(status);
  const pending = status.kind === "pending_recheck";
  return (
    <span className="inline-flex items-center gap-2 align-middle">
      {pending && status.struck ? (
        <motion.span
          key={"struck-" + status.struck}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={T_BASE}
          className="struck text-[13px]"
        >
          {status.struck}
        </motion.span>
      ) : null}
      <span className="relative inline-grid">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={status.label + status.tone}
            initial={{ opacity: 0, y: 4, filter: "blur(2px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: -4, filter: "blur(2px)" }}
            transition={T_BASE}
            className={`chip ${tone} ${size === "sm" ? "!min-h-[22px] !py-0.5 !text-[12px] !px-2" : ""}`}
            data-kind={status.kind}
            data-rule={status.rule}
          >
            <span className={`chip-dot ${pending ? "pulse" : ""}`} aria-hidden />
            {status.label}
          </motion.span>
        </AnimatePresence>
      </span>
      {showSeverity && status.severity ? <SeverityTag severity={status.severity} /> : null}
    </span>
  );
}

export function SeverityTag({ severity }: { severity: string }) {
  return (
    <span className="tag" title="Severity: control tier by application tier">
      <span className="text-faint mr-1">Severity</span>
      {severity}
    </span>
  );
}

export function TierTag({ tier }: { tier: string }) {
  return (
    <span className="tag" title="Control tier">
      {tier}
    </span>
  );
}
