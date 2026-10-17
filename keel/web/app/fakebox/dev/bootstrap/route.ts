import { resetDb } from "@/lib/fakebox/db";
import { createUser, listUsers } from "@/lib/fakebox/core";
import { env } from "@/lib/env";

// Local-only: wipe Fake Box and create the demo enterprise's users. Real Box has no equivalent;
// users and the service account are provisioned in the Admin Console.
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (env("FAKEBOX_DEV_ROUTES", "true") === "false") return new Response("disabled", { status: 404 });
  const auth = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (auth !== env("FAKEBOX_SERVICE_TOKEN")) return new Response("unauthorized", { status: 401 });
  resetDb();
  createUser("Keel", "AutomationUser_2215893_kEeLsVc@boxdevedition.com", "service", "Service account");
  createUser("Maya Chen", "maya.chen@meridiantrust.example", "admin", "Product lead");
  createUser("J. Park", "j.park@meridiantrust.example", "user", "Engineer");
  createUser("Dana Okafor", "dana.okafor@meridiantrust.example", "user", "Security architect");
  createUser("Priya Natarajan", "priya.natarajan@meridiantrust.example", "user", "Privacy lead");
  return Response.json({ entries: listUsers() });
}
