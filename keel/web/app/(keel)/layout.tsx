import Link from "next/link";
import { UserSwitcher } from "@/components/UserSwitcher";
import { actingUser } from "@/lib/session";

export default async function KeelLayout({ children }: { children: React.ReactNode }) {
  const { me, users } = await actingUser();
  return (
    <>
      <header className="topbar">
        <Link href="/" className="wordmark">KEEL<small>Checks for Box folders</small></Link>
        <div className="spacer" />
        <nav className="topnav">
          <Link href="/">Folders</Link>
          <a href="/box" target="_blank" rel="noreferrer">Box ↗</a>
        </nav>
        {me && <UserSwitcher users={users} current={me.id} />}
      </header>
      {children}
    </>
  );
}
