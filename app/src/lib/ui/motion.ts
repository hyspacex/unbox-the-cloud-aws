/** Shared motion presets. Durations 180 to 420 ms, ease-out. */
export const EASE_OUT: [number, number, number, number] = [0.22, 1, 0.36, 1];
export const T_FAST = { duration: 0.18, ease: EASE_OUT };
export const T_BASE = { duration: 0.28, ease: EASE_OUT };
export const T_SLOW = { duration: 0.42, ease: EASE_OUT };
export const T_LAYOUT = { type: "spring" as const, stiffness: 420, damping: 38, mass: 0.9 };
