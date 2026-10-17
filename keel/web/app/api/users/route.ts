import { listUsers } from "@/lib/fakebox/core";

// Local-only helper for demos and tests: the people who can sign in.
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(listUsers().filter((u) => u.kind !== "service").map((u) => ({ id: u.id, name: u.name })));
}
