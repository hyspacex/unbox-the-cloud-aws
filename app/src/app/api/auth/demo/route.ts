import { appOrigin, checkOrigin, demoSignIn, writeSessionCookie } from "@/lib/auth";
import { json, errorResponse } from "@/lib/http";
import { ServiceError } from "@/lib/service";

export async function POST(req: Request) {
  try {
    const origin = appOrigin(req);
    checkOrigin(req.headers.get("origin"), origin);
    const body = await req.json() as { role?: unknown };
    if (body.role !== "author" && body.role !== "reviewer") throw new ServiceError("BAD_ROLE", "Choose author or reviewer.", 400);
    const session = demoSignIn(body.role);
    await writeSessionCookie(session.raw, origin);
    return json({ user: session.session.user, mode: "mock" });
  } catch (error) { return errorResponse(error); }
}
