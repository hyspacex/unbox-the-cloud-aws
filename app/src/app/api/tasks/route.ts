import { handle } from "@/lib/http";
import { getTasks } from "@/lib/service";

/** GET /api/tasks -> { tasks, open, completed } (Box tasks with their mapping and response) */
export async function GET() {
  return handle(() => getTasks());
}
