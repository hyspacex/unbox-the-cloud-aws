import { handle } from "@/lib/http";
import { getTasks, poll } from "@/lib/service";

/**
 * POST /api/poll -> { poll, tasks, open, completed, awaiting_drafts }. Live: polls every open Box review
 * task and ingests resolved assignments through the disposition handler (serialized); polling
 * failures are reported in poll.errors, never thrown. Mock: a no-op that returns the task list.
 */
export async function POST() {
  return handle(async () => {
    const p = await poll();
    const t = await getTasks();
    return { ...t, poll: p };
  });
}
