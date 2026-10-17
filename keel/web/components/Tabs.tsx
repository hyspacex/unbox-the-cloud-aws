"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function Tabs({ base }: { base: string }) {
  const path = usePathname();
  const tabs = [
    { href: base, label: "Overview", on: path === base },
    { href: `${base}/decisions`, label: "Decisions", on: path.startsWith(`${base}/decisions`) },
    { href: `${base}/checks`, label: "Checks", on: path.startsWith(`${base}/checks`) || path.includes("/rules/") },
    { href: `${base}/packs`, label: "Certifications", on: path.startsWith(`${base}/packs`) },
    { href: `${base}/activity`, label: "Activity", on: path.startsWith(`${base}/activity`) || (path.startsWith(`${base}/runs`) && !path.includes("/rules/")) },
  ];
  return (
    <nav className="tabs">
      {tabs.map((t) => <Link key={t.href} href={t.href} className={t.on ? "on" : ""}>{t.label}</Link>)}
    </nav>
  );
}
