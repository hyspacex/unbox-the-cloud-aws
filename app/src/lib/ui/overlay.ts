"use client";

import { useEffect, type RefObject } from "react";

/**
 * Overlay stack: while any overlay is open the app root is inert, and every overlay except the
 * top one is inert too, so only the top dialog takes focus and input (Codex 18).
 */
const stack: HTMLElement[] = [];

function sync() {
  const root = document.getElementById("keel-app-root");
  if (root) root.inert = stack.length > 0;
  stack.forEach((el, i) => {
    el.inert = i !== stack.length - 1;
  });
}

export function useOverlay(ref: RefObject<HTMLElement | null>, open: boolean) {
  useEffect(() => {
    if (!open) return;
    // The element mounts inside an AnimatePresence child; wait a frame for the ref.
    let el: HTMLElement | null = null;
    const raf = requestAnimationFrame(() => {
      el = ref.current;
      if (!el) return;
      stack.push(el);
      sync();
    });
    return () => {
      cancelAnimationFrame(raf);
      if (el) {
        const i = stack.indexOf(el);
        if (i >= 0) stack.splice(i, 1);
        el.inert = false;
      }
      sync();
    };
  }, [open, ref]);
}

/** True when `el` is the top overlay (Escape and Tab handling belong to it alone). */
export function isTopOverlay(el: HTMLElement | null): boolean {
  return !!el && stack[stack.length - 1] === el;
}
