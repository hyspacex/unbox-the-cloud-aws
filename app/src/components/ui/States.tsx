"use client";

export function LoadingBlock({ lines = 3, className = "" }: { lines?: number; className?: string }) {
  return (
    <div className={`space-y-2.5 ${className}`} aria-busy="true">
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="shimmer h-4 rounded" style={{ width: `${92 - i * 14}%` }} />
      ))}
    </div>
  );
}

export function ErrorBlock({ title, message, onRetry }: { title: string; message?: string; onRetry?: () => void }) {
  return (
    <div className="rounded-[10px] border border-red-line bg-red-bg px-4 py-3 text-[14px] text-red-ink">
      <div className="font-medium">{title}</div>
      {message ? <div className="mt-0.5 mono text-[12.5px] opacity-90 break-words">{message}</div> : null}
      {onRetry ? (
        <button className="btn btn-secondary btn-sm mt-2" onClick={onRetry}>
          Retry
        </button>
      ) : null}
    </div>
  );
}
