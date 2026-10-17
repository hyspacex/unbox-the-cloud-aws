import { shortHash } from "@/lib/ui/format";

export function Mono({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <span className={`mono ${className}`}>{children}</span>;
}

/** Truncated hash with the full value on hover. */
export function Hash({ value, className = "" }: { value?: string | null; className?: string }) {
  if (!value) return <span className="text-faint">none</span>;
  return (
    <span className={`mono cursor-help ${className}`} title={value}>
      {shortHash(value)}
    </span>
  );
}

export function Field({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`min-w-0 ${className}`}>
      <div className="eyebrow mb-0.5">{label}</div>
      <div className="text-[14px] text-ink-2 leading-snug break-words">{children}</div>
    </div>
  );
}
