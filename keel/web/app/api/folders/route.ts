import { listFolders } from "@/lib/keel/data";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(listFolders().map((f) => ({ folder_id: f.folder_id, name: f.name })));
}
