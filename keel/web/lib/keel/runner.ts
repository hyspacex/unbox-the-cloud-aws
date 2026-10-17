import { env } from "../env";

// Client for the Keel application API served by the runner (API Gateway + Lambda in production).
const base = () => `http://127.0.0.1:${env("KEEL_RUNNER_PORT", "8787")}/api`;

export async function runnerApi<T = unknown>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(`${base()}${path}`, {
    method: init?.method ?? "GET",
    headers: { "content-type": "application/json" },
    body: init?.body ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json as { error?: string }).error || `Runner API ${res.status}`);
  return json as T;
}
