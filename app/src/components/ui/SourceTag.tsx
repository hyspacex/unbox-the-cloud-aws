import type { TraceSource } from "@/lib/types";
import { LEGEND_SOURCES, SOURCE_META } from "@/lib/ui/tone";

export function SourceSwatch({ source, size = 8 }: { source: TraceSource; size?: number }) {
  const meta = SOURCE_META[source] ?? SOURCE_META.app;
  return (
    <span
      aria-hidden
      className="inline-block flex-none rounded-[2px]"
      style={{ width: size, height: size, background: meta.color }}
    />
  );
}

export function SourceTag({ source }: { source: TraceSource }) {
  const meta = SOURCE_META[source] ?? SOURCE_META.app;
  return (
    <span className="inline-flex items-center gap-1.5 text-[11.5px] font-medium whitespace-nowrap" style={{ color: meta.color }}>
      <SourceSwatch source={source} />
      {meta.label}
    </span>
  );
}

export function SourceLegend({ withHuman = false }: { withHuman?: boolean }) {
  const list: TraceSource[] = withHuman ? [...LEGEND_SOURCES, "human"] : LEGEND_SOURCES;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
      {list.map((s) => (
        <span key={s} className="inline-flex items-center gap-1.5 text-[12px] text-muted">
          <SourceSwatch source={s} />
          {SOURCE_META[s].label}
        </span>
      ))}
    </div>
  );
}
