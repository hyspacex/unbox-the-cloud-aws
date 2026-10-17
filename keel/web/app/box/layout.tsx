import Link from "next/link";
import { LiveRefresh } from "@/components/LiveRefresh";
import { UserSwitcher } from "@/components/UserSwitcher";
import { tasksForUser } from "@/lib/fakebox/core";
import { actingUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function BoxLayout({ children }: { children: React.ReactNode }) {
  const { me, users } = await actingUser();
  const open = me ? tasksForUser(me.id).filter((t) => t.assignment.resolution_state === "incomplete").length : 0;
  return (
    <div className="boxapp">
      <LiveRefresh url="/api/state?scope=box" interval={1200} />
      <header className="topbar">
        <Link href="/box" className="boxmark">box</Link>
        <span className="pill soft" title="Fake Box implements the subset of the Box API that Keel uses">Local stand-in</span>
        <div className="spacer" />
        {me && <UserSwitcher users={users} current={me.id} label="Viewing as" />}
      </header>
      <div className="boxshell">
        <nav className="boxnav">
          <Link href="/box">All Files</Link>
          <Link href="/box/tasks" data-testid="box-tasks-link">Tasks{open ? <span className="count">{open}</span> : null}</Link>
          <div className="boxnav-foot">Keel ↗ <a href="/" target="_blank" rel="noreferrer">Open Keel</a></div>
        </nav>
        <main className="boxmain">{children}</main>
      </div>
    </div>
  );
}
