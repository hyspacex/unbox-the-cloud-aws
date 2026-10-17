"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useKeelState } from "@/components/KeelStateProvider";
import { Level1 } from "@/components/panel/Level1";

/**
 * The project's welcome screen on the folder page: the panel's overview at page size. Any drill-in (a control, a
 * file, Open in document) opens the side panel, and the welcome screen folds away toward it; the panel's expand
 * button closes the panel and the welcome screen unfolds again.
 */
export function Welcome() {
  const { panel } = useKeelState();
  const reduce = useReducedMotion();
  return (
    <AnimatePresence initial={false}>
      {!panel.open ? (
        <motion.div
          key="welcome"
          initial={{ opacity: 0, height: 0, x: reduce ? 0 : 60, scale: reduce ? 1 : 0.98 }}
          animate={{ opacity: 1, height: "auto", x: 0, scale: 1 }}
          exit={{ opacity: 0, height: 0, x: reduce ? 0 : 120, scale: reduce ? 1 : 0.96 }}
          transition={{ duration: reduce ? 0 : 0.38, ease: [0.22, 1, 0.36, 1] }}
          style={{ transformOrigin: "100% 0%" }}
          className="overflow-hidden"
        >
          <div className="pb-8 pt-1">
            <Level1 variant="page" />
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
