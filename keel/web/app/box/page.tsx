import Link from "next/link";
import { listAccessibleFolders, listFolderItems } from "@/lib/fakebox/core";
import { actingUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function BoxHome() {
  const { me } = await actingUser();
  const folders = me ? listAccessibleFolders(me.id) : [];
  return (
    <>
      <h1 className="title" style={{ marginTop: 0 }}>All Files</h1>
      <table className="files" style={{ marginTop: 24 }}>
        <thead><tr><th>Name</th><th>Items</th><th>Owner</th></tr></thead>
        <tbody>
          {folders.map((f) => (
            <tr key={f.id}>
              <td><Link href={`/box/folders/${f.id}`} className="fname" data-testid="box-folder"><span className="fileicon" style={{ borderRadius: 4, background: "var(--ink)" }} />{f.name}</Link></td>
              <td>{listFolderItems(me!.id, f.id).total_count}</td>
              <td className="muted">{f.owned_by === me!.id ? "You" : "Shared with you"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!folders.length && <p className="muted">No folders. Seed the demo with <span className="mono">./dev.sh --seed</span>.</p>}
    </>
  );
}
