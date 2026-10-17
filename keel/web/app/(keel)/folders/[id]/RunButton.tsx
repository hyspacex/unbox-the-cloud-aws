"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { runChecks } from "@/app/actions";

export function RunButton({ folderId }: { folderId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [toast, setToast] = useState<string | null>(null);
  return (
    <>
      <button
        className="btn" disabled={pending} data-testid="run-checks"
        onClick={() => start(async () => {
          const r = await runChecks(folderId);
          setToast(r.ok ? "Run queued" : r.error);
          setTimeout(() => setToast(null), 2200);
          router.push(`/folders/${folderId}`);
          router.refresh();
        })}
      >Run checks</button>
      {toast && <div className="toast">{toast}</div>}
    </>
  );
}
