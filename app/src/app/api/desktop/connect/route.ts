import { exchangeTicket } from "@/lib/auth";
import { json, errorResponse } from "@/lib/http";
import { ServiceError } from "@/lib/service";

export async function POST(req: Request) {
  try {
    const body = await req.json() as { projectId?: unknown; code?: unknown };
    if (typeof body.projectId !== "string" || typeof body.code !== "string" || body.code.length > 256) throw new ServiceError("BAD_LINK", "Invalid desktop connection request.", 400);
    return json(exchangeTicket(body.code, body.projectId));
  } catch (error) { return errorResponse(error); }
}
