import { handle, readJson } from "@/lib/http";
import { submit, ServiceError } from "@/lib/service";
import type { SubmitRequest } from "@/lib/types";

const SCENARIOS = ["architecture_v3", "contradiction", "injection", "unreadable", "fabricated_quote", "missing_finding", "unknown_control", "disposition_field"];

/** POST /api/submit SubmitRequest -> SubmitResponse (202); the run continues in the background. */
export async function POST(req: Request) {
  return handle(async () => {
    const body = await readJson<SubmitRequest & { scenario?: string }>(req);
    if (body.scenario && !SCENARIOS.includes(body.scenario)) throw new ServiceError("BAD_SCENARIO", `scenario must be one of ${SCENARIOS.join(", ")}`, 400);
    const { done: _done, ...res } = await submit(body);
    return res;
  }, 202);
}
