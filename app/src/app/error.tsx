"use client";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-[760px] px-6 pt-16">
      <div className="rounded-[10px] border border-red-line bg-red-bg px-5 py-4 text-red-ink">
        <div className="font-semibold">This screen failed to render</div>
        <p className="mt-1 mono text-[12.5px] break-words">{error.message}</p>
        <button className="btn btn-secondary btn-sm mt-3" onClick={reset}>
          Try again
        </button>
      </div>
    </div>
  );
}
