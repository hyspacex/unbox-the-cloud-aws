import { appOrigin, issueTicket, projectId, requireSession } from "@/lib/auth";
import { handle } from "@/lib/http";

export async function POST(req: Request) {
  return handle(async () => {
    const code = issueTicket(await requireSession());
    const link = new URL("keel://connect");
    link.searchParams.set("project", projectId());
    link.searchParams.set("server", appOrigin(req));
    link.searchParams.set("code", code);
    return { url: link.href, expiresIn: 60 };
  });
}
