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

export const isAbort = (e: unknown) => e instanceof DOMException && e.name === "AbortError";

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
  // Abort signals pass through to fetch; an aborted request rejects with an AbortError.
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
    const code = body && typeof body === "object" ? ((body as { error?: { code?: string } }).error?.code ?? null) : null;
    if (body && typeof body === "object") {
      const b = body as { error?: unknown; message?: unknown; explanation?: unknown };
      const e = b.error;
      if (e && typeof e === "object" && "message" in e) msg = String((e as { message: unknown }).message);
      else if (typeof e === "string") msg = e;
      else if (typeof b.explanation === "string") msg = b.explanation;
      else if (typeof b.message === "string") msg = b.message;
    } else if (typeof body === "string" && body) msg = body.slice(0, 300);
    if (code === "PACKAGE_BUSY") msg = "Keel is busy with another operation on this package; try again in a moment.";
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
  /** False for older runs recorded without their final rows: they cannot replay to an outcome. */
  has_outcome?: boolean;
};

/** GET /api/file-text (docs/CONTRACTS.md, Round 6). `match` holds raw offsets into `text` when `q` was given. */
export type FileTextResponse = {
  file_id: string;
  file_name: string;
  version_id: string;
  version_label?: string;
  created_at?: string;
  uploader?: string;
  text: string;
  snapshot_ids?: string[];
  versions?: { version_id: string; version_label?: string; created_at?: string; uploader?: string; snapshot_ids?: string[] }[];
  match?: { start: number; end: number; section?: string; paragraph?: number } | null;
};

export type DraftAuthorMessage = { text: string; drafted_by: "box_ai_text_gen" | "template" | string };

/** Finding cards already fetched, so the drawer opens filled (B5). Cleared on every new run. */
const findingCache = new Map<string, FindingCard>();
export function peekFinding(id: string): FindingCard | undefined {
  return findingCache.get(id);
}
export function clearFindingCache() {
  findingCache.clear();
}
export function prefetchFindings(ids: string[]) {
  ids.forEach((id) => {
    if (!findingCache.has(id)) api.finding(id).catch(() => {});
  });
}

export const api = {
  config: (signal?: AbortSignal) => req<AppConfig>("/api/config", { signal }),
  package: (signal?: AbortSignal) => req<PackageView>("/api/package", { signal }),
  finding: async (id: string, signal?: AbortSignal) => {
    const c = await req<FindingCard>(`/api/finding/${encodeURIComponent(id)}`, { signal });
    findingCache.set(id, c);
    findingCache.set(c.finding.finding_id, c);
    return c;
  },
  submit: (body: SubmitRequest) => post<SubmitResponse>("/api/submit", body),
  /** UI v4: Upload new version. Mock: submit architecture_v3 (or `scenario`). Live: Box upload, then submit. */
  uploadVersion: (body: { file_name: string; file_id?: string; scenario?: SubmitRequest["scenario"] | (string & {}); content_base64?: string }) =>
    post<SubmitResponse>("/api/upload-version", body),
  /** UI v4.1 Box preview: the pinned text of one file version (any snapshot's), its known versions, and an optional `q` match. */
  fileText: (fileId: string, versionId: string, q?: string | null, signal?: AbortSignal) => {
    const qs = new URLSearchParams({ file_id: fileId, version_id: versionId });
    if (q) qs.set("q", q);
    return req<FileTextResponse>(`/api/file-text?${qs}`, { signal });
  },
  run: (runId: string, signal?: AbortSignal) => req<RunState>(`/api/run/${encodeURIComponent(runId)}`, { signal }),
  runs: async (signal?: AbortSignal): Promise<RunSummary[]> => {
    const b = await req<{ runs?: RunSummary[] } | RunSummary[]>("/api/runs", { signal });
    return Array.isArray(b) ? b : b.runs ?? [];
  },
  action: (body: ActionRequest) => post<ActionResponse>("/api/action", body),
  draftAuthorMessage: (finding_id: string, reason: string) =>
    post<DraftAuthorMessage>("/api/draft-author-message", { finding_id, reason }),
  ledger: (control?: string, signal?: AbortSignal) =>
    req<Ledger>(`/api/ledger${control ? `?control=${encodeURIComponent(control)}` : ""}`, { signal }),
  exportManifest: (signal?: AbortSignal) => req<ExportManifest>("/api/export?part=manifest", { signal }),
  exportCsvUrl: "/api/export?part=csv",
  exportManifestUrl: "/api/export?part=manifest",
  reset: () => post<unknown>("/api/reset"),
  tasks: async (signal?: AbortSignal): Promise<TaskItem[]> => {
    const body = await req<unknown>("/api/tasks", { signal });
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
    /** The run no longer exists (404, e.g. after a reset): stop quietly. */
    onGone?: () => void;
  },
): () => void {
  // One follower = one generation. After cancel or finish, no callback runs and no timer is created.
  let live = true;
  let finished = false;
  let seen = 0;
  let es: EventSource | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const ctrl = new AbortController();
  const active = () => live && !finished;

  const stop = () => {
    es?.close();
    es = null;
    if (timer) clearTimeout(timer);
    timer = null;
  };

  const finish = async (run?: RunState) => {
    if (!active()) return;
    finished = true;
    stop();
    if (!run) {
      try {
        run = await api.run(runId, ctrl.signal);
      } catch {
        /* the run may be gone; deliver what we have */
      }
    }
    if (!live) return;
    if (run) {
      run.steps.slice(seen).forEach((s, i) => handlers.onStep(s, seen + i));
      seen = Math.max(seen, run.steps.length);
      handlers.onMeta?.(run);
    }
    if (!live) return;
    handlers.onDone(run);
  };

  const poll = async () => {
    if (!active()) return;
    try {
      const run = await api.run(runId, ctrl.signal);
      if (!active()) return;
      handlers.onMeta?.(run);
      run.steps.slice(seen).forEach((s, i) => handlers.onStep(s, seen + i));
      seen = Math.max(seen, run.steps.length);
      if (run.done) return finish(run);
    } catch (e) {
      if (!active()) return;
      if (e instanceof ApiError && e.status === 404) {
        finished = true;
        stop();
        handlers.onGone?.();
        return;
      }
      handlers.onError?.(e);
    }
    if (active()) timer = setTimeout(poll, 400);
  };

  const startPolling = () => {
    es?.close();
    es = null;
    if (active()) poll();
  };

  if (typeof EventSource !== "undefined") {
    try {
      es = new EventSource(`/api/run/${encodeURIComponent(runId)}/stream`);
      es.onmessage = (ev) => {
        if (!active()) return;
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
        // Stream unavailable or closed early: fall back to polling from where we are.
        if (active()) startPolling();
      };
    } catch {
      startPolling();
    }
  } else {
    startPolling();
  }

  return () => {
    live = false;
    stop();
    ctrl.abort();
  };
}
