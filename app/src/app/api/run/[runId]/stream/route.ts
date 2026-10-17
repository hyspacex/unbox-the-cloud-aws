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
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let sent = 0;
      let closed = false;
      const close = () => {
        if (closed) return;
        closed = true;
        clearInterval(timer);
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };
      const tick = () => {
        if (closed) return;
        let run: ReturnType<typeof getRun>;
        try {
          run = getRun(runId);
        } catch {
          close(); // run disappeared (reset)
          return;
        }
        while (sent < run.steps.length) controller.enqueue(enc.encode(`data: ${JSON.stringify(run.steps[sent++])}\n\n`));
        if (run.done) {
          const done = { event: "done", run_id: run.run_id, status: run.status, error: run.error, total_duration_ms: run.total_duration_ms };
          controller.enqueue(enc.encode(`event: done\ndata: ${JSON.stringify(done)}\n\n`));
          close();
        }
      };
      const timer = setInterval(tick, 150);
      req.signal.addEventListener("abort", close);
      tick();
    },
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-store, no-transform", Connection: "keep-alive" } });
}
