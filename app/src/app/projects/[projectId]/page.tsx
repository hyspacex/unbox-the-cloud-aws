"use client";

import { Suspense, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

function DesktopProjectLanding() {
  const router = useRouter();
  const params = useParams<{ projectId: string }>();
  const [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    void fetch("/api/auth/session", { cache: "no-store" })
      .then(async response => {
        if (!response.ok) throw new Error("Cannot read the project session.");
        return response.json() as Promise<{ projectId: string; user: unknown }>;
      })
      .then(session => {
        if (cancelled) return;
        if (!session.user || params.projectId !== session.projectId) { router.replace("/connect"); return; }
        const control = location.hash.slice(1);
        router.replace(/^SEC-ARCH-\d+$/.test(control) ? `/finding/${encodeURIComponent(control)}` : "/");
      })
      .catch(error => { if (!cancelled) setError(error instanceof Error ? error.message : "Cannot open project."); });
    return () => { cancelled = true; };
  }, [params.projectId, router]);
  return <p className="p-8" role={error ? "alert" : "status"}>{error || "Opening project evidence..."}</p>;
}

export default function DesktopProjectPage() {
  return <Suspense fallback={<p className="p-8">Opening project...</p>}><DesktopProjectLanding /></Suspense>;
}
