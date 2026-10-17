"use client";

import { useId, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import type { TimelinePoint } from "@/lib/types";
import { C, prose } from "./parts";

const TONE: Record<TimelinePoint["tone"], string> = {
  grey: C.grey,
  blue: C.blue,
  amber: C.amber,
  green: C.green,
  teal: C.teal,
};

/** "17:03Z" from an ISO time. */
const hhmm = (iso: string) => /T(\d\d:\d\d)/.exec(iso)?.[1]?.concat("Z") ?? "";

const SIZE = {
  compact: { dot: 14, track: 2, top: 6, ring: 3, date: "text-[11px]", label: "text-[11px]" },
  hero: { dot: 20, track: 4, top: 10, ring: 4, date: "text-[13px]", label: "text-[12.5px]" },
} as const;

/**
 * A horizontal history scrubber (design v4.1 decision 6, animated in v4.2): one point per snapshot, the engine's
 * label under each. On mount the track draws left to right in the tones of the points it joins and the dots pop in
 * one after another; the current point pulses. With onSelect, a marker slides to the clicked point. Hover or focus
 * shows the engine's detail line. Labels and details are the API's text.
 */
export function Timeline({
  points,
  label,
  selected = null,
  onSelect,
  size = "compact",
}: {
  points: TimelinePoint[];
  label: string;
  /** The selected point's snapshot id (a past point the panel is showing); null when showing now. */
  selected?: string | null;
  /** With onSelect, clicking a point selects it; clicking the current or the selected point returns to now. */
  onSelect?: (snapshotId: string | null) => void;
  size?: keyof typeof SIZE;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const reduce = useReducedMotion();
  const markerId = useId();
  if (!points.length) return null;
  const n = points.length;
  const z = SIZE[size];
  const step = reduce ? 0 : 0.22; // per-point stagger of the draw-on
  // Points are named by date; two snapshots on the same day add the UTC time to tell them apart.
  const day = points.map((p) => prose(p.at));
  const when = (i: number) => (day.filter((d) => d === day[i]).length > 1 ? `${day[i]} ${hhmm(points[i].at)}` : day[i]);
  const focus = selected ?? points.find((p) => p.current)?.snapshot_id ?? null;
  const half = 50 / n;

  return (
    <div className="relative" onMouseLeave={() => setHover(null)}>
      <ol className="relative grid" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }} aria-label={label}>
        {/* Base track, then one coloured segment per gap that draws on in turn. */}
        <span aria-hidden className="absolute rounded-full" style={{ top: z.top + z.dot / 2 - z.track / 2, left: `${half}%`, right: `${half}%`, height: z.track, background: C.border }} />
        {points.slice(0, -1).map((p, i) => (
          <motion.span
            key={`seg-${p.snapshot_id}`}
            aria-hidden
            className="absolute origin-left rounded-full"
            style={{
              top: z.top + z.dot / 2 - z.track / 2,
              left: `${half + (100 / n) * i}%`,
              width: `${100 / n}%`,
              height: z.track,
              background: `linear-gradient(90deg, ${TONE[p.tone] ?? C.grey}, ${TONE[points[i + 1].tone] ?? C.grey})`,
              opacity: 0.55,
            }}
            initial={{ scaleX: reduce ? 1 : 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: reduce ? 0 : 0.45, delay: 0.1 + step * (i + 1), ease: [0.22, 1, 0.36, 1] }}
          />
        ))}
        {points.map((p, i) => {
          const color = TONE[p.tone] ?? C.grey;
          const filled = focus === p.snapshot_id;
          return (
            <li key={p.snapshot_id + i} className="relative flex min-w-0 flex-col items-center px-0.5 text-center" style={{ paddingTop: z.top }}>
              <span className="relative flex items-center justify-center" style={{ width: z.dot, height: z.dot }}>
                {filled ? (
                  <motion.span
                    layoutId={`tl-marker-${markerId}`}
                    aria-hidden
                    className="absolute rounded-full"
                    style={{ inset: -z.ring - 2, boxShadow: `0 0 0 ${z.ring}px ${color}33`, background: `${color}14` }}
                    transition={{ type: "spring", stiffness: 380, damping: 30 }}
                  />
                ) : null}
                {p.current && !reduce ? (
                  <motion.span
                    aria-hidden
                    className="absolute inset-0 rounded-full"
                    style={{ background: color }}
                    initial={{ scale: 1, opacity: 0 }}
                    animate={{ scale: [1, 2.4], opacity: [0.45, 0] }}
                    transition={{ duration: 1.8, repeat: Infinity, ease: "easeOut", delay: 0.4 + step * n }}
                  />
                ) : null}
                <motion.button
                  type="button"
                  className={`relative z-[1] rounded-full ${onSelect ? "cursor-pointer" : "cursor-default"}`}
                  style={{
                    width: z.dot,
                    height: z.dot,
                    ...(filled ? { background: color } : { background: "#FFFFFF", border: `${size === "hero" ? 3 : 2}px solid ${color}` }),
                    transition: "background-color 250ms",
                  }}
                  initial={{ scale: reduce ? 1 : 0 }}
                  animate={{ scale: 1 }}
                  whileHover={onSelect && !reduce ? { scale: 1.25 } : undefined}
                  whileTap={onSelect && !reduce ? { scale: 0.92 } : undefined}
                  transition={{ type: "spring", stiffness: 500, damping: 22, delay: reduce ? 0 : 0.1 + step * i }}
                  aria-label={`${when(i)}${p.current ? ", current" : ""}: ${p.detail}`}
                  aria-current={p.current ? "step" : undefined}
                  aria-pressed={onSelect ? selected === p.snapshot_id : undefined}
                  onClick={onSelect ? () => onSelect(selected === p.snapshot_id || p.current ? null : p.snapshot_id) : undefined}
                  onMouseEnter={() => setHover(i)}
                  onFocus={() => setHover(i)}
                  onBlur={() => setHover(null)}
                />
              </span>
              <motion.span
                className="flex min-w-0 flex-col items-center"
                initial={{ opacity: reduce ? 1 : 0, y: reduce ? 0 : 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: reduce ? 0 : 0.3, delay: reduce ? 0 : 0.2 + step * i }}
              >
                <span className={`mt-1.5 whitespace-nowrap font-bold ${z.date}`} style={{ color: filled ? C.text : C.secondary, transition: "color 250ms" }}>
                  {when(i)}
                </span>
                <span className={`line-clamp-2 leading-[1.3] ${z.label}`} style={{ color: filled ? C.text : C.secondary, transition: "color 250ms" }}>
                  {p.label}
                </span>
              </motion.span>
            </li>
          );
        })}
      </ol>
      {hover != null ? (
        <div
          className="pointer-events-none absolute top-[-6px] z-10 w-[220px] -translate-y-full"
          style={hover === 0 ? { left: 0 } : hover === n - 1 ? { right: 0 } : { left: `calc(${((hover + 0.5) / n) * 100}% - 110px)` }}
        >
          <motion.div
            key={hover}
            role="tooltip"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: reduce ? 0 : 0.15 }}
            className="rounded-[4px] border bg-white px-2.5 py-1.5 text-[12px] leading-[1.4]"
            style={{ borderColor: C.border, boxShadow: "0 6px 18px rgba(0,0,0,.12)", color: C.text }}
          >
            <div className="font-bold">
              {prose(points[hover].at)} · {hhmm(points[hover].at)}
            </div>
            <div>{points[hover].detail}</div>
          </motion.div>
        </div>
      ) : null}
    </div>
  );
}
