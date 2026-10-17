"use client";

import { AnimatePresence, motion } from "motion/react";

/** The owl's speech line: fades and rises 6 px in 200 ms, replaces in place, click opens the panel. */
export function Bubble({ text, onOpen }: { text: string | null; onOpen: () => void }) {
  return (
    <div className="pointer-events-none flex justify-end" aria-live="polite" aria-atomic="true">
      {/* mode="wait": the old line leaves (120 ms) before the new one enters, so only one bubble is ever in the DOM. */}
      <AnimatePresence mode="wait" initial={false}>
        {text ? (
          <motion.button
            key={text}
            type="button"
            onClick={onOpen}
            data-testid="owl-bubble"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -2, transition: { duration: 0.12 } }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="box-root pointer-events-auto relative w-max max-w-[300px] rounded-xl border border-[#E8E8E8] bg-white px-3.5 py-2 text-left text-[14px] leading-snug text-[#222222] shadow-[0_6px_20px_rgba(0,0,0,0.12)] hover:border-[#C9D8EE]"
          >
            {text}
            <span
              aria-hidden
              className="absolute -bottom-[6px] right-6 h-3 w-3 rotate-45 border-b border-r border-[#E8E8E8] bg-white"
            />
          </motion.button>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
