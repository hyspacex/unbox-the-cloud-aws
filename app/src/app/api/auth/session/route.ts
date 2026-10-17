import { connection } from "next/server";
import { cookies } from "next/headers";
import { getConfig } from "@/lib/config";
import { SESSION_COOKIE, sessionForToken, signOut, appOrigin, checkOrigin, projectId } from "@/lib/auth";
import { json, errorResponse } from "@/lib/http";

export async function GET() {
  await connection();
  const session = sessionForToken((await cookies()).get(SESSION_COOKIE)?.value);
  return json({ user: session?.user ?? null, projectId: projectId(), mode: getConfig().mode, oauthConfigured: !!((process.env.BOX_OAUTH_CLIENT_ID || process.env.BOX_CLIENT_ID) && (process.env.BOX_OAUTH_CLIENT_SECRET || process.env.BOX_CLIENT_SECRET)) });
}
export async function DELETE(req: Request) {
  try { checkOrigin(req.headers.get("origin"), appOrigin(req)); await signOut(); return json({ signedOut: true }); }
  catch (error) { return errorResponse(error); }
}
