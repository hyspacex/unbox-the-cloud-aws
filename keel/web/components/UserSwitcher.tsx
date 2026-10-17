"use client";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { setActingUser } from "@/app/actions";
import { initials } from "./Glyph";

export function UserSwitcher({ users, current, label = "Signed in as" }: { users: { id: string; name: string; title: string | null }[]; current: string; label?: string }) {
  const router = useRouter();
  const [, start] = useTransition();
  const me = users.find((u) => u.id === current);
  return (
    <label className="userchip" title="Local stand-in for Box sign-in">
      <span className="muted" style={{ fontSize: 12 }}>{label}</span>
      <span className="avatar">{initials(me?.name)}</span>
      <select
        data-testid="user-switcher"
        value={current}
        onChange={(e) => start(async () => { await setActingUser(e.target.value); router.refresh(); })}
      >
        {users.map((u) => <option key={u.id} value={u.id}>{u.name}{u.title ? ` · ${u.title}` : ""}</option>)}
      </select>
    </label>
  );
}
