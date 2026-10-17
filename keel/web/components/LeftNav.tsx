"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function LeftNav({ folders }: { folders: { id: string; name: string; state: "ok" | "blue" | "alert" | "none" }[] }) {
  const path = usePathname();
  return (
    <nav className="lnav">
      <Link href="/" className="logo"><i>K</i><span>Keel<small>Decisions &amp; compliance</small></span></Link>
      <Link href="/" className={path === "/" ? "on" : ""}>All folders</Link>
      <div className="group">Connected folders</div>
      {folders.map((f) => (
        <Link key={f.id} href={`/folders/${f.id}`} className={path.startsWith(`/folders/${f.id}`) ? "on" : ""}>
          <span className={`dot${f.state === "ok" ? " ok" : f.state === "blue" ? " blue" : ""}`} style={f.state === "none" ? { background: "var(--line-2)" } : undefined} />
          {f.name}
        </Link>
      ))}
      <div className="foot">Files live in Box. <a href="/box" target="_blank" rel="noreferrer">Open Box ↗</a></div>
    </nav>
  );
}
