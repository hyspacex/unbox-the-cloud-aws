"use client";

import { useSyncExternalStore } from "react";

/** True when the viewport matches `query`. Server render assumes the wide layout. */
export function useMedia(query: string, serverValue = true): boolean {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia(query);
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    },
    () => window.matchMedia(query).matches,
    () => serverValue,
  );
}
