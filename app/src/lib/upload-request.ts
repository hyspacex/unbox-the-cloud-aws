/**
 * POST /api/upload-version request validation (Codex 13): strict schema, strict base64, size limits on
 * the body, the encoded content and the decoded bytes, and no empty upload unless explicitly allowed.
 */
import { z } from "zod";

/** The same scenarios POST /api/submit accepts (mock); live ignores the scenario except for the architecture.md v3 fixture text. */
const SCENARIOS = ["none", "architecture_v3", "contradiction", "injection", "unreadable", "fabricated_quote", "missing_finding", "unknown_control", "disposition_field"] as const;

/** Decoded upload limit (KEEL_UPLOAD_MAX_BYTES, default 10 MiB); the encoded and body limits follow from it. */
export const UPLOAD_MAX_BYTES = Number(process.env.KEEL_UPLOAD_MAX_BYTES ?? 10 * 1024 * 1024);
const ENCODED_MAX = Math.ceil(UPLOAD_MAX_BYTES / 3) * 4;
export const BODY_MAX = ENCODED_MAX + 16 * 1024;
/** Strict base64, linear time: alphabet only, padding only at the end, length a multiple of 4. */
export function isStrictBase64(v: string): boolean {
  return v.length % 4 === 0 && /^[A-Za-z0-9+/]*={0,2}$/.test(v) && !/=[^=]/.test(v);
}

const decodedLength = (b64: string) => (b64.length / 4) * 3 - (b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0);

export const UploadVersionSchema = z
  .object({
    file_name: z.string().trim().min(1, "file_name is required").max(255).refine((n) => !/[\\/\u0000]/.test(n), "file_name must be a plain file name"),
    file_id: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/, "file_id must be a Box id").optional(),
    scenario: z.enum(SCENARIOS).optional(),
    content_base64: z
      .string()
      .max(ENCODED_MAX, `content_base64 exceeds ${UPLOAD_MAX_BYTES} decoded bytes`)
      .refine((v) => v.length <= ENCODED_MAX && isStrictBase64(v), "content_base64 is not valid base64 within the size limit")
      .refine((v) => decodedLength(v) <= UPLOAD_MAX_BYTES, `content exceeds ${UPLOAD_MAX_BYTES} bytes`)
      .optional(),
    /** An empty file replaces evidence with nothing: only when the caller says so explicitly. */
    allow_empty: z.boolean().optional(),
  })
  .strict()
  .refine((b) => b.content_base64 === undefined || b.allow_empty === true || b.content_base64.length > 0, { message: "content_base64 decodes to an empty file; pass allow_empty: true to upload one", path: ["content_base64"] });

