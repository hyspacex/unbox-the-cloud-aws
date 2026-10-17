"use client";

import type { DashboardTile, RuleSource } from "@/lib/types";
import { C } from "./parts";

/** One-line hover text for a rule source: who set it up, the profile, and the illustrative framework map. */
export function ruleSourceTitle(rs: RuleSource): string {
  const parts = [`${rs.standard}${rs.clause ? ` ${rs.clause}` : ""} · ${rs.origin_label}`, `Set up by ${rs.set_by} · profile ${rs.profile_version}`];
  if (rs.reference) parts.push(rs.reference);
  if (rs.framework_map?.length) parts.push(`Maps to ${rs.framework_map.join(", ")}${rs.framework_map_status ? ` (${rs.framework_map_status})` : ""}`);
  return parts.join("\n");
}

/** The rule-source chip (design v4.1 decision 2): standard clause, then origin. Text from the API. */
export function RuleChip({ rs, title = true }: { rs: RuleSource; title?: boolean }) {
  return (
    <span
      className="inline-flex h-[20px] min-w-0 max-w-full items-center gap-1 overflow-hidden whitespace-nowrap rounded-[4px] border px-1.5 text-[11.5px] leading-none"
      style={{ borderColor: C.border, color: C.text }}
      title={title ? ruleSourceTitle(rs) : undefined}
    >
      <span className="mono truncate font-bold">{rs.chip}</span>
      <span style={{ color: C.secondary }}>·</span>
      <span className="truncate" style={{ color: C.secondary }}>
        {rs.origin_label}
      </span>
    </span>
  );
}

/** The level-2 rule-source row: the chip, who set it up, and the first framework mapping with the rest on hover. */
export function RuleSourceRow({ rs }: { rs: RuleSource }) {
  const map = rs.framework_map ?? [];
  return (
    <div className="text-[12px] leading-[1.45]" style={{ color: C.secondary }}>
      <div className="flex items-center gap-2">
        <RuleChip rs={rs} />
      </div>
      <div className="mt-1" title={ruleSourceTitle(rs)}>
        Set up by {rs.set_by}
        {map.length ? (
          <>
            {" "}
            · maps to {map[0]}
            {map.length > 1 ? <span> (+{map.length - 1} more, illustrative)</span> : rs.framework_map_status ? <span> (illustrative)</span> : null}
          </>
        ) : null}
      </div>
    </div>
  );
}

const TILE_TONE: Record<DashboardTile["tone"], { fg: string; bg: string }> = {
  teal: { fg: C.teal, bg: C.tealBg },
  amber: { fg: C.amber, bg: C.amberBg },
  blue: { fg: C.blue, bg: C.blueBg },
  grey: { fg: C.grey, bg: C.greyBg },
};

/** Three tiles from PackageView.dashboard (design v4.1 decision 4). Value and label are the engine's. */
export function Tiles({ tiles }: { tiles: DashboardTile[] }) {
  if (!tiles.length) return null;
  return (
    <ul className="grid gap-2" style={{ gridTemplateColumns: `repeat(${tiles.length}, minmax(0, 1fr))` }} aria-label="Overview">
      {tiles.map((t) => {
        const tone = TILE_TONE[t.tone] ?? TILE_TONE.grey;
        return (
          <li key={t.key} className="rounded-[6px] px-3 py-2.5 text-center" style={{ background: tone.bg }} data-tile={t.key}>
            <div className="text-[26px] font-bold leading-none tabular-nums" style={{ color: tone.fg }}>
              {t.value}
            </div>
            <div className="mt-1 text-[12px] font-bold" style={{ color: tone.fg }}>
              {t.label}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
