"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function Tabs({ base }: { base: string }) {
  const path = usePathname();
  const tabs = [
    { href: base, label: "Checks", on: path === base || path.startsWith(`${base}/runs`) },
    { href: `${base}/history`, label: "Run history", on: path.startsWith(`${base}/history`) },
    { href: `${base}/packs`, label: "Rule packs", on: path.startsWith(`${base}/packs`) },
  ];
  return (
    <nav className="tabs">
      {tabs.map((t) => <Link key={t.href} href={t.href} className={t.on ? "on" : ""}>{t.label}</Link>)}
    </nav>
  );
}
