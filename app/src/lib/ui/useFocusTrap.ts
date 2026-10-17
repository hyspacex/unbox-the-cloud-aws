"use client";

import { useEffect, type RefObject } from "react";

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Keeps Tab and Shift+Tab inside `ref` while `active`, focuses the first control on open,
 * and returns focus to whatever had it before when it closes.
 */
export function useFocusTrap(ref: RefObject<HTMLElement | null>, active: boolean, initialFocus?: string) {
  useEffect(() => {
    if (!active) return;
    const el = ref.current;
    const focused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    // The opener is whatever had focus outside the dialog (an autofocused child is not the opener).
    const prev = focused && !(el && el.contains(focused)) ? focused : null;
    const t = setTimeout(() => {
      const node = ref.current;
      if (!node) return;
      const first = (initialFocus ? node.querySelector<HTMLElement>(initialFocus) : null) ?? node.querySelector<HTMLElement>(FOCUSABLE);
      (first ?? node).focus({ preventScroll: true });
    }, 30);
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab" || !el) return;
      const items = Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((n) => n.offsetParent !== null || n === document.activeElement);
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const cur = document.activeElement as HTMLElement | null;
      if (e.shiftKey && (cur === first || !el.contains(cur))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (cur === last || !el.contains(cur))) {
        e.preventDefault();
        first.focus();
      }
    };
    el?.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(t);
      el?.removeEventListener("keydown", onKey);
      if (prev) setTimeout(() => prev.isConnected && prev.focus({ preventScroll: true }), 0);
    };
  }, [active, ref, initialFocus]);
}
