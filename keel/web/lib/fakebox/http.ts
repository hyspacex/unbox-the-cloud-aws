import { BoxError, getUser, serviceAccount } from "./core";
import { env } from "../env";

// Resolve the calling identity the way Box does for a server app: a bearer token for the
// service account, optionally acting as another user via the As-User header.
export function caller(req: Request): string {
  const auth = req.headers.get("authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!token || token !== env("FAKEBOX_SERVICE_TOKEN")) throw new BoxError(401, "unauthorized", "Unauthorized");
  const sa = serviceAccount();
  const asUser = req.headers.get("as-user");
  if (asUser) {
    getUser(asUser);
    return asUser;
  }
  return sa.id;
}

export function boxError(e: unknown): Response {
  if (e instanceof BoxError) return Response.json(e.toJSON(), { status: e.status });
  console.error(e);
  return Response.json({ type: "error", status: 500, code: "internal_server_error", message: String(e) }, { status: 500 });
}
