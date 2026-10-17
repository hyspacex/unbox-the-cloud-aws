import { cookies } from "next/headers";
import { listUsers } from "./fakebox/core";

// Local stand-in for "Sign in with Box": the acting user is a cookie holding a Fake Box user id.
export async function actingUser() {
  const users = listUsers().filter((u) => u.kind !== "service").sort((a, b) => (a.kind === "admin" ? -1 : b.kind === "admin" ? 1 : a.name.localeCompare(b.name)));
  const id = (await cookies()).get("keel_user")?.value;
  const me = users.find((u) => u.id === id) ?? users[0] ?? null;
  return { me, users: users.map((u) => ({ id: u.id, name: u.name, title: u.title })) };
}
