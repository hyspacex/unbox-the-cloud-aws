"use client";

/**
 * The lighthouse-keeper owl (design 2.3): navy body, cream face, Box-blue keeper's cap. Drawn as parts so the
 * lids, pupils, eyes and cap animate independently. Reduced motion: no loops, every state still drawn.
 */
import { motion, useReducedMotion, type Transition } from "motion/react";
import type { OwlState } from "@/components/KeelStateProvider";

const NAVY = "#1F2A44";
const NAVY_DARK = "#172036";
const CREAM = "#FFF4D6";
const BLUE = "#0061D5";
const BLUE_DARK = "#004CA8";
const BEAK = "#E9A23B";

const EYES = [
  { cx: 24.5, cy: 31 },
  { cx: 39.5, cy: 31 },
];

export function Owl({ state, size = 56, still = false }: { state: OwlState; size?: number; still?: boolean }) {
  const reduce = useReducedMotion() || still;

  // Top lids: 0 open, 1 closed. Idle and attention blink every 4 s (120 ms).
  const blinking = !reduce && (state === "idle" || state === "attention" || state === "clear");
  const lidTop =
    state === "offline" ? 1 : state === "quarantine" ? 0.34 : blinking ? [0, 0, 1, 0] : 0;
  const lidTopT: Transition = blinking
    ? { duration: 4, times: [0, 0.97, 0.985, 1], repeat: Infinity, ease: "linear" }
    : { duration: 0.2 };
  const lidBottom = state === "quarantine" ? 0.22 : state === "offline" ? 0.2 : 0;

  const sweeping = !reduce && state === "working";
  const pupilX = sweeping ? [-2.4, 2.4] : 0;
  const pupilT: Transition = sweeping
    ? { duration: 0.8, repeat: Infinity, repeatType: "mirror", ease: "easeInOut" }
    : { duration: 0.2 };

  const eyeScale = state === "attention" ? [1, 1.16, 1] : 1;
  const capRotate = state === "attention" ? [0, -16, 0] : 0;
  const headY = state === "clear" ? [0, 2.5, 0] : 0;

  return (
    <motion.svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      aria-hidden
      animate={{ filter: state === "offline" ? "grayscale(1) opacity(0.7)" : "grayscale(0) opacity(1)" }}
      transition={{ duration: 0.3 }}
      style={{ overflow: "visible" }}
      data-owl-state={state}
    >
      <motion.g animate={{ y: headY }} transition={{ duration: 0.45, ease: "easeInOut" }}>
        {/* wings */}
        <ellipse cx="14.5" cy="42" rx="4.5" ry="11" fill={NAVY_DARK} />
        <ellipse cx="49.5" cy="42" rx="4.5" ry="11" fill={NAVY_DARK} />
        {/* body */}
        <path d="M14 27C14 15.5 22 10 32 10s18 5.5 18 17v16.5C50 53.5 42 59 32 59s-18-5.5-18-15.5V27Z" fill={NAVY} />
        {/* belly feathers */}
        <ellipse cx="32" cy="48.5" rx="9.5" ry="8" fill="#2A3A5F" />
        <path d="M27.5 46.5l2 1.6 2-1.6M32.5 46.5l2 1.6 2-1.6M30 50.5l2 1.6 2-1.6" stroke={CREAM} strokeOpacity=".45" strokeWidth="1" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        {/* feet */}
        <path d="M27 58.5h3.5M33.5 58.5H37" stroke={BEAK} strokeWidth="2" strokeLinecap="round" />
        {/* face */}
        <path d="M32 24.5c-2-2.6-5-4-8-4a10.5 10.5 0 1 0 8 17.4 10.5 10.5 0 1 0 8-17.4c-3 0-6 1.4-8 4Z" fill={CREAM} />
        {/* eyes */}
        <motion.g animate={{ scale: eyeScale }} transition={{ duration: 0.4, ease: "easeOut" }} style={{ transformBox: "fill-box", transformOrigin: "50% 50%" }}>
          {EYES.map((e, i) => (
            <g key={i}>
              <circle cx={e.cx} cy={e.cy} r="6.2" fill="#FFFFFF" stroke="#E9DDBA" strokeWidth=".8" />
              <motion.g animate={{ x: pupilX }} transition={pupilT}>
                <circle cx={e.cx} cy={e.cy} r="3" fill={NAVY} />
                <circle cx={e.cx + 1} cy={e.cy - 1.1} r=".9" fill="#FFFFFF" />
              </motion.g>
              <motion.ellipse
                cx={e.cx}
                cy={e.cy}
                rx="6.9"
                ry="6.9"
                fill={NAVY}
                initial={false}
                animate={{ scaleY: lidTop }}
                transition={lidTopT}
                style={{ transformBox: "fill-box", transformOrigin: "50% 0%" }}
              />
              <motion.ellipse
                cx={e.cx}
                cy={e.cy}
                rx="6.9"
                ry="6.9"
                fill={NAVY}
                initial={false}
                animate={{ scaleY: lidBottom }}
                transition={{ duration: 0.2 }}
                style={{ transformBox: "fill-box", transformOrigin: "50% 100%" }}
              />
            </g>
          ))}
        </motion.g>
        {/* beak */}
        <path d="M29.6 36.2h4.8L32 40.6Z" fill={BEAK} />
        {/* keeper's cap */}
        <motion.g animate={{ rotate: capRotate }} transition={{ duration: 0.3, ease: "easeOut" }} style={{ transformBox: "fill-box", transformOrigin: "0% 100%" }}>
          <path d="M19 18.5c0-7.5 5.8-11 13-11s13 3.5 13 11Z" fill={BLUE} />
          <rect x="17" y="16.4" width="30" height="4.2" rx="2.1" fill={BLUE_DARK} />
          <path d="M21 20.4c3.6 2.4 7.3 3.2 11 3.2s7.4-.8 11-3.2Z" fill={BLUE_DARK} />
          <circle cx="32" cy="12.6" r="1.8" fill={CREAM} />
        </motion.g>
      </motion.g>
    </motion.svg>
  );
}

/** Static 20 px owl for headers (the panel's "Keel" mark). No animation, decorative. */
export function OwlMark({ size = 20 }: { size?: number }) {
  return (
    <span className="inline-flex shrink-0" aria-hidden>
      <Owl state="idle" size={size} still />
    </span>
  );
}
