"use client";

import { useState } from "react";
import type { TimelinePoint } from "@/lib/types";
import { C, prose } from "./parts";

/** "17:03Z" from an ISO time. */
const hhmm = (iso: string) => /T(\d\d:\d\d)/.exec(iso)?.[1]?.concat("Z") ?? "";

const TONE: Record<TimelinePoint["tone"], string> = {
  grey: C.grey,
  blue: C.blue,
  amber: C.amber,
  green: C.green,
  teal: C.teal,
};

/**
 * A horizontal history strip (design v4.1 decision 6): one point per snapshot, the engine's label under each, the
 * current point filled. Hover or focus shows the engine's detail line. Labels and details are the API's text.
 */
export function Timeline({ points, label }: { points: TimelinePoint[]; label: string }) {
  const [hover, setHover] = useState<number | null>(null);
  if (!points.length) return null;
  const n = points.length;
  // Points are named by date; two snapshots on the same day add the UTC time to tell them apart.
  const day = points.map((p) => prose(p.at));
  const when = (i: number) => (day.filter((d) => d === day[i]).length > 1 ? `${day[i]} ${hhmm(points[i].at)}` : day[i]);
  return (
    <div className="relative" onMouseLeave={() => setHover(null)}>
      <ol className="relative grid" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }} aria-label={label}>
        {/* The connecting line runs between the first and last dot. */}
        <span
          aria-hidden
          className="absolute top-[6px] h-[2px]"
          style={{ left: `${50 / n}%`, right: `${50 / n}%`, background: C.border }}
        />
        {points.map((p, i) => {
          const color = TONE[p.tone] ?? C.grey;
          return (
            <li key={p.snapshot_id + i} className="relative flex min-w-0 flex-col items-center px-0.5 text-center">
              <button
                type="button"
                className="relative z-[1] h-[14px] w-[14px] rounded-full"
                style={p.current ? { background: color, boxShadow: `0 0 0 3px ${C.selected}` } : { background: "#FFFFFF", border: `2px solid ${color}` }}
                aria-label={`${when(i)}${p.current ? ", current" : ""}: ${p.detail}`}
                aria-current={p.current ? "step" : undefined}
                onMouseEnter={() => setHover(i)}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
              />
              <span className="mt-1 whitespace-nowrap text-[11px] font-bold" style={{ color: p.current ? C.text : C.secondary }}>
                {when(i)}
              </span>
              <span className="line-clamp-2 text-[11px] leading-[1.3]" style={{ color: p.current ? C.text : C.secondary }}>
                {p.label}
              </span>
            </li>
          );
        })}
      </ol>
      {hover != null ? (
        <div
          role="tooltip"
          className="pointer-events-none absolute top-[-6px] z-10 w-[220px] -translate-y-full rounded-[4px] border bg-white px-2.5 py-1.5 text-[12px] leading-[1.4]"
          style={{
            borderColor: C.border,
            boxShadow: "0 6px 18px rgba(0,0,0,.12)",
            color: C.text,
            ...(hover === 0 ? { left: 0 } : hover === n - 1 ? { right: 0 } : { left: `calc(${((hover + 0.5) / n) * 100}% - 110px)` }),
          }}
        >
          <div className="font-bold">
            {prose(points[hover].at)} · {hhmm(points[hover].at)}
          </div>
          <div>{points[hover].detail}</div>
        </div>
      ) : null}
    </div>
  );
}
