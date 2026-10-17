import { createHash, randomBytes } from "node:crypto";
import { cookies, headers } from "next/headers";
import { getConfig, FIXTURE_IDENTITIES, identityMatches } from "./config";
import { ServiceError } from "./service";

export const SESSION_COOKIE = "keel_session";
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const token = () => randomBytes(32).toString("base64url");
export type DemoRole = "author" | "reviewer";
export interface UserSession {
  id: string;
  user: { id: string; name: string; login: string };
  mode: "mock" | "live";
  expiresAt: number;
  boxToken?: string;
}
interface Ticket { sessionId: string; projectId: string; expiresAt: number }
interface AuthStore {
  sessions: Map<string, UserSession>;
  tickets: Map<string, Ticket>;
  desktop: Map<string, Ticket>;
  oauth: Map<string, { origin: string; expiresAt: number }>;
}
declare global { var __keelAuth: AuthStore | undefined }
function authStore(): AuthStore {
  return globalThis.__keelAuth ??= { sessions: new Map(), tickets: new Map(), desktop: new Map(), oauth: new Map() };
}
export function projectId(): string {
  const value = process.env.KEEL_PROJECT_ID || "lantern";
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(value)) throw new ServiceError("PROJECT_CONFIG", "Invalid configured project ID.", 503);
  return value;
}
export function appOrigin(request?: Request): string {
  const configured = process.env.KEEL_BASE_URL;
  if (!configured && !getConfig().mockMode) throw new ServiceError("ORIGIN_CONFIG", "Set KEEL_BASE_URL to the registered HTTPS application origin in live mode.", 503);
  const requestUrl = request ? new URL(request.url) : null;
  const requestedOrigin = requestUrl && request?.headers.get("host")
    ? `${requestUrl.protocol}//${request.headers.get("host")}`
    : requestUrl?.origin;
  const value = configured || requestedOrigin || "http://127.0.0.1:3000";
  const url = new URL(value);
  const local = ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
  if ((url.protocol !== "https:" && !(local && url.protocol === "http:")) || url.username || url.password || url.pathname !== "/") {
    throw new ServiceError("ORIGIN_CONFIG", "Use an HTTPS application origin, or loopback HTTP for local development.", 503);
  }
  return url.origin;
}
export function checkOrigin(origin: string | null, expected: string): void {
  if (origin && origin !== expected) throw new ServiceError("CROSS_ORIGIN", "Cross-origin action rejected.", 403);
}
function prune(): void {
  const store = authStore(), now = Date.now();
  for (const map of [store.tickets, store.desktop, store.oauth]) {
    for (const [key, value] of map) if (value.expiresAt <= now) map.delete(key);
  }
  for (const [key, value] of store.sessions) if (value.expiresAt <= now) store.sessions.delete(key);
}
function createSession(user: UserSession["user"], mode: UserSession["mode"], boxToken?: string, seconds = 3600) {
  prune();
  const raw = token();
  const session: UserSession = { id: hash(raw), user, mode, expiresAt: Date.now() + Math.min(seconds, 3600) * 1000, boxToken };
  authStore().sessions.set(session.id, session);
  return { raw, session };
}
export function demoSignIn(role: DemoRole) {
  if (!getConfig().mockMode) throw new ServiceError("MOCK_DISABLED", "Demo identities are disabled in live mode.", 403);
  const identity = role === "author" ? FIXTURE_IDENTITIES.jpark : FIXTURE_IDENTITIES.dana;
  return createSession({ id: identity.box_user_id, name: identity.name, login: identity.login }, "mock");
}
export function sessionForToken(raw: string | undefined): UserSession | null {
  prune();
  if (!raw) return null;
  return authStore().sessions.get(hash(raw)) ?? null;
}
export function desktopSession(raw: string | undefined, requestedProject = projectId()): UserSession {
  prune();
  const grant = raw ? authStore().desktop.get(hash(raw)) : undefined;
  if (!grant || grant.projectId !== requestedProject || requestedProject !== projectId()) throw new ServiceError("UNAUTHORIZED", "Sign in and open a fresh project connection link.", 401);
  const session = authStore().sessions.get(grant.sessionId);
  if (!session || session.expiresAt <= Date.now() || session.mode !== (getConfig().mockMode ? "mock" : "live")) {
    throw new ServiceError("SESSION_EXPIRED", "Your session expired. Sign in again.", 401);
  }
  return session;
}
export function issueTicket(session: UserSession): string {
  prune();
  const raw = token();
  authStore().tickets.set(hash(raw), { sessionId: session.id, projectId: projectId(), expiresAt: Date.now() + 60_000 });
  return raw;
}
export function exchangeTicket(code: string, requestedProject: string) {
  prune();
  const key = hash(code), ticket = authStore().tickets.get(key);
  authStore().tickets.delete(key);
  if (!ticket || ticket.projectId !== requestedProject || requestedProject !== projectId()) throw new ServiceError("INVALID_CODE", "Connection link expired or was already used.", 401);
  const session = authStore().sessions.get(ticket.sessionId);
  if (!session || session.expiresAt <= Date.now()) throw new ServiceError("SESSION_EXPIRED", "Sign in again.", 401);
  const raw = token(), expiresIn = Math.max(1, Math.floor((session.expiresAt - Date.now()) / 1000));
  authStore().desktop.set(hash(raw), { sessionId: session.id, projectId: requestedProject, expiresAt: session.expiresAt });
  return { projectId: requestedProject, accessToken: raw, expiresIn };
}
export async function requireSession(): Promise<UserSession> {
  const h = await headers();
  const bearer = h.get("authorization");
  const session = bearer?.startsWith("Bearer ")
    ? desktopSession(bearer.slice(7))
    : sessionForToken((await cookies()).get(SESSION_COOKIE)?.value);
  if (!session || session.mode !== (getConfig().mockMode ? "mock" : "live")) throw new ServiceError("UNAUTHORIZED", "Sign in at /connect to access this project.", 401);
  if (!bearer) {
    const host = h.get("host") || "";
    const expected = process.env.KEEL_BASE_URL || `${h.get("x-forwarded-proto") || "http"}://${host}`;
    checkOrigin(h.get("origin"), new URL(expected).origin);
  }
  return session;
}
export async function writeSessionCookie(raw: string, origin: string): Promise<void> {
  (await cookies()).set(SESSION_COOKIE, raw, { httpOnly: true, secure: origin.startsWith("https:"), sameSite: "lax", path: "/", maxAge: 3600 });
}
export async function signOut(): Promise<void> {
  const jar = await cookies();
  const raw = jar.get(SESSION_COOKIE)?.value;
  if (raw) authStore().sessions.delete(hash(raw));
  jar.delete(SESSION_COOKIE);
}
export function canReview(session: UserSession): boolean {
  const config = getConfig();
  return config.reviewers.some(identity => identityMatches(identity, session.user, config.mockMode));
}
export function beginBoxSignIn(origin: string) {
  const clientId = process.env.BOX_OAUTH_CLIENT_ID || process.env.BOX_CLIENT_ID;
  if (!clientId) throw new ServiceError("OAUTH_NOT_CONFIGURED", "Configure BOX_OAUTH_CLIENT_ID and BOX_OAUTH_CLIENT_SECRET on the server.", 503);
  prune();
  const state = token();
  authStore().oauth.set(hash(state), { origin, expiresAt: Date.now() + 5 * 60_000 });
  const url = new URL("https://account.box.com/api/oauth2/authorize");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", `${origin}/api/auth/box/callback`);
  url.searchParams.set("state", state);
  return { url: url.href, state };
}
export async function completeBoxSignIn(code: string, state: string, browserState: string | undefined) {
  const saved = authStore().oauth.get(hash(state));
  authStore().oauth.delete(hash(state));
  if (!saved || saved.expiresAt < Date.now() || browserState !== state || !code) throw new ServiceError("OAUTH_STATE", "The sign-in request expired. Start again.", 401);
  const clientId = process.env.BOX_OAUTH_CLIENT_ID || process.env.BOX_CLIENT_ID;
  const secret = process.env.BOX_OAUTH_CLIENT_SECRET || process.env.BOX_CLIENT_SECRET;
  if (!clientId || !secret) throw new ServiceError("OAUTH_NOT_CONFIGURED", "Box OAuth is not configured on the server.", 503);
  const response = await fetch("https://api.box.com/oauth2/token", {
    method: "POST", redirect: "error", signal: AbortSignal.timeout(20_000),
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "authorization_code", code, client_id: clientId, client_secret: secret, redirect_uri: `${saved.origin}/api/auth/box/callback` })
  });
  if (!response.ok) throw new ServiceError("BOX_OAUTH", `Box sign-in failed (HTTP ${response.status}). Check the app's OAuth configuration.`, 401);
  const data = await response.json() as { access_token?: unknown; expires_in?: unknown };
  if (typeof data.access_token !== "string" || typeof data.expires_in !== "number") throw new ServiceError("BOX_OAUTH", "Box returned an invalid sign-in response.", 502);
  const auth = { Authorization: `Bearer ${data.access_token}` };
  const me = await fetch("https://api.box.com/2.0/users/me", { headers: auth, redirect: "error", signal: AbortSignal.timeout(20_000) });
  if (!me.ok) throw new ServiceError("BOX_IDENTITY", "Could not verify the Box user.", 401);
  const user = await me.json() as { id?: unknown; name?: unknown; login?: unknown };
  if (typeof user.id !== "string" || typeof user.login !== "string" || typeof user.name !== "string") throw new ServiceError("BOX_IDENTITY", "Invalid Box user identity.", 502);
  const config = getConfig();
  const identity = { id: user.id, login: user.login };
  if (![config.author, ...config.reviewers].some(member => identityMatches(member, identity, false))) {
    throw new ServiceError("PROJECT_MEMBERSHIP", "This user is not on the configured demo project author/reviewer list.", 403);
  }
  const access = await fetch(`https://api.box.com/2.0/folders/${encodeURIComponent(getConfig().box.folderId)}?fields=id`, { headers: auth, redirect: "error", signal: AbortSignal.timeout(20_000) });
  if (!access.ok) throw new ServiceError("FOLDER_ACCESS", "This Box user cannot access the configured project folder.", 403);
  return { ...createSession({ id: user.id, name: user.name, login: user.login }, "live", data.access_token, data.expires_in), origin: saved.origin };
}
