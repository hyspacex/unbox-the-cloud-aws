"use client";

import { motion } from "motion/react";
import { useKeelState } from "@/components/KeelStateProvider";
import { useMedia } from "@/lib/ui/useMedia";

/** The Keel side panel width, shared by the panel, the push and the owl dock. */
export const PANEL_WIDTH = 540;

/** The panel pushes the page only when the page keeps room for its file table; narrower, it overlays. */
export const PUSH_MIN_WIDTH = 1300;
export const PUSH_QUERY = `(min-width: ${PUSH_MIN_WIDTH}px)`;

/**
 * Like Box's own sidebar, the open Keel panel pushes the Box page (folder list or file preview) instead of covering
 * it. Lives in the (box) layout so the panel, the owl and this push survive navigation between the two pages.
 */
export function BoxPush({ children }: { children: React.ReactNode }) {
  const { panel } = useKeelState();
  const wide = useMedia(PUSH_QUERY);
  const push = panel.open && wide ? PANEL_WIDTH : 0;
  return (
    <motion.div initial={false} animate={{ paddingRight: push }} transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }} data-testid="box-shell">
      {children}
    </motion.div>
  );
}
