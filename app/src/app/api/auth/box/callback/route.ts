import { cookies } from "next/headers";
import { connection } from "next/server";
import { completeBoxSignIn, writeSessionCookie } from "@/lib/auth";
import { errorResponse } from "@/lib/http";

export async function GET(req: Request) {
  await connection();
  try {
    const url = new URL(req.url);
    const jar = await cookies();
    const session = await completeBoxSignIn(url.searchParams.get("code") || "", url.searchParams.get("state") || "", jar.get("keel_oauth_state")?.value);
    jar.delete("keel_oauth_state");
    await writeSessionCookie(session.raw, session.origin);
    return Response.redirect(`${session.origin}/connect`, 302);
  } catch (error) { return errorResponse(error); }
}
