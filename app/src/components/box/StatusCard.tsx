"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { StatusCard as StatusCardData } from "@/lib/types";
import { C } from "@/components/panel/parts";

const TONE: Record<StatusCardData["tone"], { fg: string; bg: string }> = {
  green: { fg: C.green, bg: C.greenBg },
  teal: { fg: C.teal, bg: C.tealBg },
  blue: { fg: C.blue, bg: C.blueBg },
  amber: { fg: C.amber, bg: C.amberBg },
  grey: { fg: C.grey, bg: C.greyBg },
};

/**
 * The folder's at-a-glance review status: a dot, the engine's headline and detail. With onOpen it is a button that
 * opens the Keel panel; without, a static card (the panel's past-snapshot view).
 */
export function StatusCard({ card, onOpen }: { card: StatusCardData | undefined; onOpen?: () => void }) {
  const reduce = useReducedMotion();
  if (!card) return null;
  const tone = TONE[card.tone] ?? TONE.grey;
  const Tag = onOpen ? "button" : "div";
  return (
    <Tag
      {...(onOpen ? { type: "button" as const, onClick: onOpen } : { role: "group" })}
      aria-label={`Control review: ${card.headline}. ${card.detail}`}
      className={`mb-3 inline-flex max-w-full items-center gap-2.5 rounded-md border px-3 py-1.5 text-left transition-colors ${onOpen ? "hover:brightness-[0.98]" : ""}`}
      style={{ background: tone.bg, borderColor: `${tone.fg}26` }}
      data-testid={onOpen ? "status-card" : "as-of-card"}
      data-tone={card.tone}
    >
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: tone.fg }} />
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={`${card.headline}|${card.detail}`}
          className="flex min-w-0 items-baseline gap-2"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduce ? 0 : 0.25 }}
        >
          <span className="shrink-0 text-[13px] font-bold" style={{ color: tone.fg }}>
            {card.headline}
          </span>
          <span className="truncate text-[13px] text-[#555555]">{card.detail}</span>
        </motion.span>
      </AnimatePresence>
    </Tag>
  );
}
