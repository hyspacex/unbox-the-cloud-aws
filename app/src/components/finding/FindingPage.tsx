"use client";

import { use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FindingContainer } from "./FindingContainer";

/** Full-page finding card for deep links to /finding/[id]. */
export function FindingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const decoded = decodeURIComponent(id);
  return (
    <div className="mx-auto max-w-[1240px] px-6 lg:px-10 pt-6 pb-16">
      <Link href="/" className="inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-ink mb-4">
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
          <path d="M7.5 2.5 4 6l3.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Package view
      </Link>
      <FindingContainer id={decoded} layout="page" onSelect={(next) => router.replace(`/finding/${encodeURIComponent(next)}`)} />
    </div>
  );
}
