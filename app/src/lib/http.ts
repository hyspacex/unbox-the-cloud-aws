/**
 * Route-handler helpers: JSON responses with no caching, errors as {error: {code, message}}.
 * GET handlers call `await connection()` so that, with cacheComponents enabled, they always run at
 * request time and are never prerendered (Next 16: route segment `dynamic` is not available).
 */
import { connection } from "next/server";
import { ServiceError } from "./service";

const NO_STORE = { "Cache-Control": "no-store, max-age=0" };

export function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: NO_STORE });
}

export function errorResponse(err: unknown): Response {
  if (err instanceof ServiceError) return json({ error: { code: err.code, message: err.message } }, err.status);
  if ((err as { code?: string })?.code === "PACKAGE_BUSY") return json({ error: { code: "PACKAGE_BUSY", message: (err as Error).message } }, 503);
  const message = err instanceof Error ? err.message : String(err);
  console.error("[keel api]", err);
  return json({ error: { code: "INTERNAL", message } }, 500);
}

/** Wrap a handler: request-time only, JSON out, ServiceError mapped to its status. */
export async function handle(fn: () => unknown | Promise<unknown>, status = 200): Promise<Response> {
  await connection();
  try {
    const out = await fn();
    return out instanceof Response ? out : json(out, status);
  } catch (err) {
    return errorResponse(err);
  }
}

export async function readJson<T>(req: Request): Promise<T> {
  try {
    const text = await req.text();
    return (text ? JSON.parse(text) : {}) as T;
  } catch {
    throw new ServiceError("BAD_JSON", "request body is not valid JSON", 400);
  }
}
