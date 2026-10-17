import { handle, readJson } from "@/lib/http";
import { act, ServiceError } from "@/lib/service";
import type { ActionRequest } from "@/lib/types";

/** POST /api/action ActionRequest -> ActionResponse */
export async function POST(req: Request) {
  return handle(async () => {
    const body = await readJson<ActionRequest>(req);
    if (!body.control_id && !body.finding_id) throw new ServiceError("BAD_REQUEST", "control_id or finding_id is required", 400);
    if (!["return_to_author", "verify", "acknowledge", "approve_author_draft"].includes(body.action)) throw new ServiceError("BAD_REQUEST", "action must be return_to_author, verify, acknowledge or approve_author_draft", 400);
    return act(body);
  });
}
