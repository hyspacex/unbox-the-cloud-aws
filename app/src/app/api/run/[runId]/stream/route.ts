import { connection } from "next/server";
import { errorResponse } from "@/lib/http";
import { getRun } from "@/lib/service";

/**
 * GET /api/run/[runId]/stream -> Server-Sent Events: one `message` per TraceStep as it is recorded,
 * then `event: done` with { event: "done", run_id, status, total_duration_ms }.
 */
export async function GET(req: Request, ctx: { params: Promise<{ runId: string }> }) {
  await connection();
  const { runId } = await ctx.params;
  try {
    getRun(runId);
  } catch (err) {
    return errorResponse(err);
  }
  const enc = new TextEncoder();
  let cleanup: () => void = () => {};
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let sent = 0;
      let closed = false;
      const onAbort = () => cleanup();
      // One cleanup for completion, request abort, body cancel and enqueue failure (Codex finding 20).
      cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(timer);
        req.signal.removeEventListener("abort", onAbort);
        try {
          controller.close();
        } catch {
          /* already closed or cancelled */
        }
      };
      const send = (chunk: string): boolean => {
        try {
          controller.enqueue(enc.encode(chunk));
          return true;
        } catch {
          cleanup();
          return false;
        }
      };
      const tick = () => {
        if (closed) return;
        let run: ReturnType<typeof getRun>;
        try {
          run = getRun(runId);
        } catch {
          cleanup(); // run disappeared (reset)
          return;
        }
        while (sent < run.steps.length) if (!send(`data: ${JSON.stringify(run.steps[sent++])}\n\n`)) return;
        if (run.done) {
          const done = { event: "done", run_id: run.run_id, status: run.status, error: run.error, total_duration_ms: run.total_duration_ms };
          send(`event: done\ndata: ${JSON.stringify(done)}\n\n`);
          cleanup();
        }
      };
      const timer = setInterval(tick, 150);
      req.signal.addEventListener("abort", onAbort);
      tick();
    },
    cancel() {
      cleanup();
    },
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-store, no-transform", Connection: "keep-alive" } });
}
