"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { PUSH_QUERY } from "@/components/box/BoxShell";
import { useKeelState, type KeelState } from "@/components/KeelStateProvider";
import { useMedia } from "@/lib/ui/useMedia";
import { Owl } from "./Owl";
import { Bubble } from "./Bubble";

/** Screen-reader name for the owl button, from the state and the engine's badge. */
function owlLabel(s: Pick<KeelState, "owl" | "badge">): string {
  switch (s.owl) {
    case "working":
      return "Keel: working";
    case "attention":
      return `Keel: ${s.badge} decision${s.badge === 1 ? " needs" : "s need"} you`;
    case "clear":
      return "Keel: every decision is recorded";
    case "quarantine":
      return s.badge > 0 ? `Keel: a file was withheld; ${s.badge} decision${s.badge === 1 ? " needs" : "s need"} you` : "Keel: a file was withheld";
    case "offline":
      return "Keel: cannot reach Keel";
    default:
      return "Keel: open the review panel";
  }
}

/**
 * The owl at bottom right: 56 px, 24 px inset, 48 px hit target. When the panel pushes the page the owl slides left
 * of it; when the panel overlays (narrow) the owl hides. The bubble is anchored to the owl button itself and only
 * appears once the dock has stopped moving.
 */
export function OwlDock() {
  const { owlRef, ...s } = useKeelState();
  const pushing = useMedia(PUSH_QUERY);
  const hidden = s.panel.open && !pushing;
  const right = s.panel.open && pushing ? 420 + 24 : 24;
  const [settledAt, setSettledAt] = useState(right);
  const settled = settledAt === right;
  // The bubble shows whenever the owl is on screen and still: with the panel closed, or pushed beside it.
  const bubbleText = settled && s.bubble ? s.bubble.text : null;
  const title = s.pkg?.decision_summary ? `Keel: ${s.pkg.decision_summary}` : owlLabel(s);
  const { openPanel } = s;
  const panelOpen = s.panel.open;

  // "k" opens Keel from anywhere on the Box page (not while typing).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "k" || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey || e.defaultPrevented) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      if (panelOpen || document.querySelector('[aria-modal="true"]')) return;
      e.preventDefault();
      owlRef.current?.focus();
      openPanel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openPanel, owlRef, panelOpen]);
  const badgeShown = s.badge > 0 && (s.owl === "attention" || s.owl === "quarantine");

  return (
    <AnimatePresence>
      {hidden ? null : (
        <motion.div
          key="owl-dock"
          className="fixed bottom-6 z-40"
          initial={{ opacity: 0, right }}
          animate={{ opacity: 1, right }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
          onAnimationComplete={() => setSettledAt(right)}
        >
          <div className="relative">
            <div className="absolute bottom-[calc(100%+12px)] right-0">
              <Bubble text={bubbleText} onOpen={() => s.openPanel()} />
            </div>
            <button
              ref={owlRef}
              type="button"
              aria-label={owlLabel(s)}
              aria-keyshortcuts="k"
              title={title}
              data-testid="owl"
              data-state={s.owl}
              onClick={() => s.openPanel()}
              className="relative flex h-14 w-14 items-center justify-center rounded-full bg-white shadow-[0_6px_20px_rgba(31,42,68,0.18)] ring-1 ring-black/5 transition-shadow hover:shadow-[0_8px_26px_rgba(31,42,68,0.26)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0061D5]"
            >
              <Owl state={s.owl} size={48} />
              <AnimatePresence>
                {badgeShown ? (
                  <motion.span
                    key="badge"
                    data-testid="owl-badge"
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    exit={{ scale: 0 }}
                    transition={{ type: "spring", stiffness: 520, damping: 30 }}
                    className="box-root absolute -right-1 -top-1 flex h-[22px] min-w-[22px] items-center justify-center rounded-full bg-[#F59E0B] px-1.5 text-[12px] font-bold text-white ring-2 ring-white"
                  >
                    {s.badge}
                  </motion.span>
                ) : null}
              </AnimatePresence>
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
