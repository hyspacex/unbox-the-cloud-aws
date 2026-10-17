/**
 * Typed fetchers for every route in docs/CONTRACTS.md. The UI talks to the API only
 * through this module; it never imports service.ts.
 */
import type {
  ActionRequest,
  ActionResponse,
  AppConfig,
  BoxTask,
  BoxTaskResponse,
  ExportManifest,
  FindingCard,
  Ledger,
  PackageView,
  SubmitRequest,
  SubmitResponse,
  Trace,
  TraceStep,
} from "@/lib/types";

export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, message: string, body?: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    cache: "no-store",
    ...init,
    headers: { Accept: "application/json", ...(init?.body ? { "Content-Type": "application/json" } : {}), ...init?.headers },
  });
  const text = await res.text();
  let body: unknown = text;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    /* plain text */
  }
  if (!res.ok) {
    let msg = `${res.status} ${res.statusText}`;
    if (body && typeof body === "object") {
      const b = body as { error?: unknown; message?: unknown; explanation?: unknown };
      const e = b.error;
      if (e && typeof e === "object" && "message" in e) msg = String((e as { message: unknown }).message);
      else if (typeof e === "string") msg = e;
      else if (typeof b.explanation === "string") msg = b.explanation;
      else if (typeof b.message === "string") msg = b.message;
    } else if (typeof body === "string" && body) msg = body.slice(0, 300);
    throw new ApiError(res.status, msg, body);
  }
  return body as T;
}

const post = <T>(path: string, data?: unknown) =>
  req<T>(path, { method: "POST", body: data === undefined ? "{}" : JSON.stringify(data) });

export type RunState = Trace & { done: boolean; compressed_timing?: boolean; error?: string };

/** /api/tasks shape is loose in the contract; normalize to a flat list. */
export type TaskItem = BoxTask & {
  status?: "open" | "completed" | string;
  resolution_state?: BoxTaskResponse["resolution_state"];
  response?: BoxTaskResponse | null;
  created_at?: string;
  completed_at?: string;
};

export type RunSummary = {
  run_id: string;
  mode_label: "Live" | "Replay" | "Mock";
  snapshot_id: string;
  prior_snapshot_id?: string;
  started_at: string;
  total_duration_ms?: number;
  status?: string;
  step_count?: number;
  compressed_timing?: boolean;
  scenario?: string;
  error?: string;
};

export type DraftAuthorMessage = { text: string; drafted_by: "box_ai_text_gen" | "template" | string };

export const api = {
  config: () => req<AppConfig>("/api/config"),
  package: () => req<PackageView>("/api/package"),
  finding: (id: string) => req<FindingCard>(`/api/finding/${encodeURIComponent(id)}`),
  submit: (body: SubmitRequest) => post<SubmitResponse>("/api/submit", body),
  run: (runId: string) => req<RunState>(`/api/run/${encodeURIComponent(runId)}`),
  runs: async (): Promise<RunSummary[]> => {
    const b = await req<{ runs?: RunSummary[] } | RunSummary[]>("/api/runs");
    return Array.isArray(b) ? b : b.runs ?? [];
  },
  action: (body: ActionRequest) => post<ActionResponse>("/api/action", body),
  draftAuthorMessage: (finding_id: string, reason: string) =>
    post<DraftAuthorMessage>("/api/draft-author-message", { finding_id, reason }),
  ledger: (control?: string) =>
    req<Ledger>(`/api/ledger${control ? `?control=${encodeURIComponent(control)}` : ""}`),
  exportManifest: () => req<ExportManifest>("/api/export?part=manifest"),
  exportCsvUrl: "/api/export?part=csv",
  exportManifestUrl: "/api/export?part=manifest",
  reset: () => post<unknown>("/api/reset"),
  tasks: async (): Promise<TaskItem[]> => {
    const body = await req<unknown>("/api/tasks");
    if (Array.isArray(body)) return body as TaskItem[];
    if (body && typeof body === "object") {
      const b = body as Record<string, unknown>;
      if (Array.isArray(b.tasks)) return b.tasks as TaskItem[];
      const open = Array.isArray(b.open) ? (b.open as TaskItem[]).map((t) => ({ status: "open", ...t })) : [];
      const done = Array.isArray(b.completed)
        ? (b.completed as TaskItem[]).map((t) => ({ status: "completed", ...t }))
        : [];
      return [...open, ...done];
    }
    return [];
  },
};

/** Trace steps nest substeps either at `substeps` or `detail.substeps` (fixture). */
export function substepsOf(step: TraceStep): TraceStep[] {
  if (Array.isArray(step.substeps)) return step.substeps;
  const d = step.detail as { substeps?: TraceStep[] } | undefined;
  return d && Array.isArray(d.substeps) ? d.substeps : [];
}

/**
 * Follow a run: SSE first, polling every 400 ms as fallback. Calls onStep for each new
 * TraceStep (deduplicated by seq or index) and onDone once. Returns a cancel function.
 */
export function followRun(
  runId: string,
  handlers: {
    onStep: (step: TraceStep, index: number) => void;
    onDone: (run?: RunState) => void;
    onError?: (err: unknown) => void;
    onMeta?: (run: RunState) => void;
  },
): () => void {
  let cancelled = false;
  let seen = 0;
  let es: EventSource | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let finished = false;

  const finish = async (run?: RunState) => {
    if (finished || cancelled) return;
    finished = true;
    es?.close();
    if (!run) {
      try {
        run = await api.run(runId);
      } catch {
        /* ignore */
      }
    }
    if (run) {
      // Deliver any steps SSE did not carry.
      run.steps.slice(seen).forEach((s, i) => handlers.onStep(s, seen + i));
      seen = Math.max(seen, run.steps.length);
      handlers.onMeta?.(run);
    }
    handlers.onDone(run);
  };

  const poll = async () => {
    if (cancelled || finished) return;
    try {
      const run = await api.run(runId);
      handlers.onMeta?.(run);
      run.steps.slice(seen).forEach((s, i) => handlers.onStep(s, seen + i));
      seen = Math.max(seen, run.steps.length);
      if (run.done) return finish(run);
    } catch (e) {
      handlers.onError?.(e);
    }
    timer = setTimeout(poll, 400);
  };

  const startPolling = () => {
    es?.close();
    es = null;
    if (!cancelled && !finished) poll();
  };

  if (typeof EventSource !== "undefined") {
    try {
      es = new EventSource(`/api/run/${encodeURIComponent(runId)}/stream`);
      let gotAny = false;
      es.onmessage = (ev) => {
        gotAny = true;
        let data: unknown;
        try {
          data = JSON.parse(ev.data);
        } catch {
          return;
        }
        if (data && typeof data === "object" && (data as { event?: string }).event === "done") {
          finish();
          return;
        }
        if (data && typeof data === "object" && "label" in (data as object)) {
          handlers.onStep(data as TraceStep, seen);
          seen += 1;
        }
      };
      es.addEventListener("done", () => finish());
      es.onerror = () => {
        if (finished) return;
        // Stream unavailable or closed early: fall back to polling from where we are.
        if (!gotAny || es?.readyState === EventSource.CLOSED) startPolling();
        else startPolling();
      };
    } catch {
      startPolling();
    }
  } else {
    startPolling();
  }

  return () => {
    cancelled = true;
    es?.close();
    if (timer) clearTimeout(timer);
  };
}
