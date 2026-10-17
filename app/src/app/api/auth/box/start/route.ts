import { cookies } from "next/headers";
import { connection } from "next/server";
import { appOrigin, beginBoxSignIn } from "@/lib/auth";
import { errorResponse } from "@/lib/http";

export async function GET(req: Request) {
  await connection();
  try {
    const origin = appOrigin(req);
    const { url, state } = beginBoxSignIn(origin);
    (await cookies()).set("keel_oauth_state", state, { httpOnly: true, secure: origin.startsWith("https:"), sameSite: "lax", path: "/", maxAge: 300 });
    return Response.redirect(url, 302);
  } catch (error) { return errorResponse(error); }
}
