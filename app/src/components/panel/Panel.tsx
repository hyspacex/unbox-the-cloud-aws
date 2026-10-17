"use client";

/**
 * The Keel side panel (design 50-ui-v4 section 2.4). 420 px, full height, fixed right, over the Box page (no dim,
 * no reflow). Level 1 lists what needs the reviewer; level 2 is one control or one menu screen. Esc closes level 2
 * first, then the panel; focus is trapped while open and returns to the owl on close.
 */
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useKeelState, type PanelView } from "@/components/KeelStateProvider";
import { useFocusTrap } from "@/lib/ui/useFocusTrap";
import { OwlMark } from "@/components/owl";
import { Level1 } from "./Level1";
import { Level2 } from "./Level2";
import { MENU_TITLES, MenuScreenView } from "./MenuScreens";
import { PanelMenu } from "./PanelMenu";
import { C, Chevron, DUR, EASE_OUT } from "./parts";

const viewKey = (v: PanelView) => (v.kind === "level1" ? "level1" : v.kind === "control" ? `control:${v.controlId}` : `menu:${v.screen}`);

/** Scoped overrides so the reused full-page screens fit 420 px. Viewport breakpoints do not apply inside the panel. */
const PANEL_CSS = `
.kp-root .kp-one-col section { grid-template-columns: minmax(0,1fr) !important; }
.kp-root .kp-compact > div { padding: 0 !important; margin: 0 !important; max-width: none !important; }
.kp-root .kp-compact .eyebrow { display: none; }
.kp-root .kp-compact h1 { font-size: 16px !important; line-height: 1.3 !important; }
.kp-root .kp-compact h2 { font-size: 14px !important; }
.kp-root .kp-compact p, .kp-root .kp-compact li, .kp-root .kp-compact dd, .kp-root .kp-compact dt { font-size: 12.5px !important; }
.kp-root .kp-compact [class*="md:grid-cols-"] { grid-template-columns: minmax(0,1fr) !important; }
.kp-root .kp-compact li[id^="rule-"] { grid-template-columns: 24px minmax(0,1fr) !important; padding: 8px 10px !important; column-gap: 8px !important; }
.kp-root .kp-compact li[id^="rule-"] > span:last-child { grid-column-start: 2 !important; }
.kp-root .kp-compact .mt-10 { margin-top: 20px !important; }
.kp-root .kp-compact .mt-6 { margin-top: 12px !important; }
.kp-root .kp-compact .chip { font-size: 11.5px !important; }
.kp-root .kp-export .panel { border-radius: 4px; }
`;

export function Panel() {
  const { panel, closePanel, back, owlRef } = useKeelState();
  const ref = useRef<HTMLElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const view = panel.view;
  const depth = panel.history.length;
  const key = viewKey(view);
  // Slide direction and menu reset follow the view; adjusted during render (no effect, no ref read).
  const [nav, setNav] = useState({ key, depth, dir: 1 });
  if (nav.key !== key || nav.depth !== depth) {
    setNav({ key, depth, dir: depth >= nav.depth ? 1 : -1 });
    if (menuOpen) setMenuOpen(false);
  }
  const dir = nav.dir;

  const close = () => {
    setMenuOpen(false);
    closePanel();
    setTimeout(() => owlRef?.current?.focus(), 40);
  };

  useFocusTrap(ref, panel.open);

  // Esc: menu first, then level 2 (back), then the panel.
  useEffect(() => {
    if (!panel.open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      e.preventDefault();
      if (menuOpen) {
        setMenuOpen(false);
        ref.current?.querySelector<HTMLElement>("[data-panel-menu-button]")?.focus();
      } else if (view.kind !== "level1") back();
      else close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  // Each level opens at the top.
  const bodyRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bodyRef.current?.scrollTo({ top: 0 });
  }, [key]);

  const title = view.kind === "control" ? view.controlId : view.kind === "menu" ? MENU_TITLES[view.screen] : "Keel";

  return (
    <AnimatePresence>
      {panel.open ? (
        <motion.aside
          key="keel-panel"
          ref={ref}
          role="dialog"
          aria-modal="false"
          aria-label="Keel"
          initial={{ x: 420 }}
          animate={{ x: 0 }}
          exit={{ x: 420 }}
          transition={{ duration: DUR.panel, ease: EASE_OUT }}
          className="kp-root box-root fixed right-0 top-0 z-50 flex h-full w-[420px] max-w-full flex-col border-l bg-white font-[inherit]"
          style={{ borderColor: C.border, boxShadow: "-8px 0 24px rgba(0,0,0,.06)", color: C.text }}
          data-view={key}
        >
          <style>{PANEL_CSS}</style>
          <header className="relative flex h-14 flex-none items-center gap-2 border-b px-3" style={{ borderColor: C.border }}>
            {view.kind === "level1" ? (
              <span className="flex items-center gap-2 pl-1">
                <OwlMark />
                <span className="text-[15px] font-bold">Keel</span>
              </span>
            ) : (
              <>
                <button type="button" onClick={back} aria-label="Back" className="inline-flex h-8 w-8 items-center justify-center rounded-[4px] hover:bg-[#F4F6FA]" style={{ color: C.text }}>
                  <Chevron dir="left" size={16} />
                </button>
                <span className={`min-w-0 truncate text-[15px] font-bold ${view.kind === "control" ? "mono !text-[14px]" : ""}`}>{title}</span>
              </>
            )}
            <span className="ml-auto flex items-center gap-1">
              <button
                type="button"
                data-panel-menu-button
                aria-label="Keel menu"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen((o) => !o)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-[4px] hover:bg-[#F4F6FA]"
                style={{ color: C.secondary, background: menuOpen ? C.hover : undefined }}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
                  <circle cx="3.5" cy="8" r="1.4" fill="currentColor" />
                  <circle cx="8" cy="8" r="1.4" fill="currentColor" />
                  <circle cx="12.5" cy="8" r="1.4" fill="currentColor" />
                </svg>
              </button>
              <button type="button" onClick={close} aria-label="Close Keel" className="inline-flex h-8 w-8 items-center justify-center rounded-[4px] hover:bg-[#F4F6FA]" style={{ color: C.secondary }}>
                <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
                  <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
              </button>
            </span>
            <AnimatePresence>{menuOpen ? <PanelMenu key="menu" onClose={() => setMenuOpen(false)} /> : null}</AnimatePresence>
          </header>
          <div ref={bodyRef} className="relative min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
            <AnimatePresence initial={false} mode="popLayout" custom={dir}>
              <motion.div
                key={key}
                custom={dir}
                variants={{
                  enter: (d: number) => ({ x: 40 * d, opacity: 0 }),
                  center: { x: 0, opacity: 1 },
                  exit: (d: number) => ({ x: -40 * d, opacity: 0 }),
                }}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: DUR.level, ease: EASE_OUT }}
              >
                {view.kind === "level1" ? <Level1 /> : view.kind === "control" ? <Level2 controlId={view.controlId} /> : <MenuScreenView screen={view.screen} />}
              </motion.div>
            </AnimatePresence>
          </div>
        </motion.aside>
      ) : null}
    </AnimatePresence>
  );
}

export default Panel;
