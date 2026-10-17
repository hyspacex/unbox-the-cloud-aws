import { BODY_MAX, UploadVersionSchema } from "@/lib/upload-request";
import { handle } from "@/lib/http";
import { uploadVersion, ServiceError } from "@/lib/service";

async function readBounded(req: Request): Promise<unknown> {
  const len = Number(req.headers.get("content-length") ?? NaN);
  if (Number.isFinite(len) && len > BODY_MAX) throw new ServiceError("PAYLOAD_TOO_LARGE", `request body exceeds ${BODY_MAX} bytes`, 413);
  const text = await req.text();
  if (text.length > BODY_MAX) throw new ServiceError("PAYLOAD_TOO_LARGE", `request body exceeds ${BODY_MAX} bytes`, 413);
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    throw new ServiceError("BAD_JSON", "request body is not valid JSON", 400);
  }
}

/**
 * POST /api/upload-version { file_name, file_id?, scenario?, content_base64?, allow_empty? } -> SubmitResponse (202),
 * plus `upload` and `warnings` in live mode. Mock: submit with scenario ?? "architecture_v3". Live: upload the new
 * version's raw bytes to Box, then submit.
 */
export async function POST(req: Request) {
  return handle(async () => {
    const parsed = UploadVersionSchema.safeParse(await readBounded(req));
    if (!parsed.success) {
      const i = parsed.error.issues[0];
      const code = i.path[0] === "scenario" ? "BAD_SCENARIO" : i.path[0] === "content_base64" ? "BAD_CONTENT" : i.path[0] === "file_name" ? "FILE_NAME_REQUIRED" : "BAD_REQUEST";
      throw new ServiceError(code, `${i.path.join(".") || "body"}: ${i.message}`, 400);
    }
    const { done: _done, ...res } = await uploadVersion(parsed.data);
    return res;
  }, 202);
}
