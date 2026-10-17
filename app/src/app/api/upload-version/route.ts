import { handle, readJson } from "@/lib/http";
import { uploadVersion, ServiceError, type UploadVersionRequest } from "@/lib/service";

/** The same scenarios POST /api/submit accepts (mock); live ignores the scenario except for the architecture.md v3 fixture text. */
const SCENARIOS = ["none", "architecture_v3", "contradiction", "injection", "unreadable", "fabricated_quote", "missing_finding", "unknown_control", "disposition_field"];

/**
 * POST /api/upload-version { file_name, file_id?, scenario?, content_base64? } -> SubmitResponse (202).
 * Mock: submit with scenario ?? "architecture_v3". Live: upload the new version to Box, then submit.
 */
export async function POST(req: Request) {
  return handle(async () => {
    const body = await readJson<UploadVersionRequest>(req);
    if (body.scenario && !SCENARIOS.includes(body.scenario)) throw new ServiceError("BAD_SCENARIO", `scenario must be one of ${SCENARIOS.join(", ")}`, 400);
    if (body.content_base64 !== undefined && typeof body.content_base64 !== "string") throw new ServiceError("BAD_CONTENT", "content_base64 must be a base64 string", 400);
    const { done: _done, ...res } = await uploadVersion(body);
    return res;
  }, 202);
}
