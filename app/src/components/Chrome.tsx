"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useKeel } from "@/components/AppProvider";
import { T_BASE } from "@/lib/ui/motion";

const NAV = [
  { href: "/", label: "Package" },
  { href: "/ledger", label: "Ledger" },
  { href: "/rules", label: "Rules" },
  { href: "/architecture", label: "Architecture" },
];

export function TopBar() {
  return (
    <header className="sticky top-0 z-40 border-b hairline bg-[color-mix(in_srgb,var(--paper)_88%,transparent)] backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-[1360px] items-center gap-6 px-6 lg:px-10">
        <Link href="/" className="flex items-baseline gap-3 min-w-0">
          <Wordmark />
          <span className="hidden xl:inline text-[13px] text-muted truncate">
            Know what changed, and who reviewed that exact evidence.
          </span>
        </Link>
        <Suspense fallback={<nav className="ml-auto" />}>
          <Nav />
        </Suspense>
        <ModeLabel />
      </div>
    </header>
  );
}

export function Wordmark({ size = 19 }: { size?: number }) {
  return (
    <span className="inline-flex items-center gap-2 text-ink" style={{ fontSize: size }}>
      <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden>
        <path d="M3 13.5h14L14.2 17H5.8L3 13.5Z" fill="currentColor" />
        <path d="M10 2.5v9.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        <path d="M10 4.2 15 11H10" fill="currentColor" opacity="0.55" />
      </svg>
      <span className="font-semibold tracking-[-0.02em]">Keel</span>
    </span>
  );
}

function Nav() {
  const pathname = usePathname() ?? "/";
  const active = (href: string) =>
    href === "/" ? pathname === "/" || pathname.startsWith("/finding") : pathname.startsWith(href);
  return (
    <nav className="ml-auto flex items-center gap-1">
      {NAV.map((n) => (
        <Link
          key={n.href}
          href={n.href}
          className={`relative rounded-md px-3 py-1.5 text-[14px] transition-colors ${
            active(n.href) ? "text-ink font-medium" : "text-muted hover:text-ink"
          }`}
        >
          {active(n.href) ? (
            <motion.span
              layoutId="nav-pill"
              className="absolute inset-0 rounded-md bg-paper-2 border hairline"
              transition={T_BASE}
            />
          ) : null}
          <span className="relative">{n.label}</span>
        </Link>
      ))}
    </nav>
  );
}

/** The persistent mode label. Read from GET /api/config and the current run. */
export function ModeLabel() {
  const { config, configError, run } = useKeel();
  let text = "Connecting";
  let tone = "grey";
  if (configError) {
    text = "API unavailable";
    tone = "red";
  } else if (run?.mode_label === "Replay" || config?.mode === "replay") {
    text = `Replay · ${run?.run_id ?? "run"}`;
    tone = "amber";
  } else if (config?.mode === "live") {
    text = "Live";
    tone = "live";
  } else if (config?.mode === "mock") {
    text = "Mock · fixture data";
    tone = "grey";
  }
  const cls =
    tone === "live"
      ? "border-[color:var(--ink)] bg-ink text-white"
      : tone === "amber"
        ? "border-amber-line bg-amber-bg text-amber-ink"
        : tone === "red"
          ? "border-red-line bg-red-bg text-red-ink"
          : "border-line-strong bg-panel text-ink-2";
  return (
    <span
      className={`inline-flex h-7 items-center gap-2 rounded-full border px-3 text-[12.5px] font-medium ${cls}`}
      title="Mode label: what produced the data on screen"
      data-testid="mode-label"
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${tone === "live" ? "bg-[#4ade80] pulse" : "bg-current opacity-60"}`}
        aria-hidden
      />
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span key={text} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={T_BASE}>
          {text}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

export function Footer() {
  const { config, configError } = useKeel();
  const na = configError ? "unavailable" : "loading";
  return (
    <footer className="mt-auto border-t hairline">
      <div className="mx-auto grid max-w-[1360px] gap-2 px-6 lg:px-10 py-6 text-[12.5px] text-muted md:grid-cols-[1fr_auto]">
        <div className="space-y-1">
          <p>
            Synthetic data. Meridian Trust Bank, Project Lantern and every person named here are fictional. No real customer,
            employer or personal content.
          </p>
          <p className="text-[10.5px] text-faint/80" title="docs/research/30-design-v3.md · docs/CONTRACTS.md">
            Design spec v3.4
          </p>
        </div>
        <div className="space-y-1 md:text-right">
          <p>
            Model <span className="mono text-ink-2">{config?.model_id ?? na}</span> · inference profile{" "}
            <span className="mono text-ink-2">{config?.inference_profile ?? na}</span>
          </p>
          <p>
            MRM model id <span className="mono text-ink-2">{config?.mrm_model_id ?? na}</span> · prompt{" "}
            <span className="mono text-ink-2">{config?.prompt_version ?? na}</span>
          </p>
        </div>
      </div>
    </footer>
  );
}
