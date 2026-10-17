import Link from "next/link";
import { notFound } from "next/navigation";
import { Ago } from "@/components/Ago";
import { initials } from "@/components/Glyph";
import { BoxError, getFolder, listCollaborators, listFolderItems, peekInstance, recentDeliveries, serializeFile } from "@/lib/fakebox/core";
import { db } from "@/lib/fakebox/db";
import { actingUser } from "@/lib/session";
import { Uploader } from "./Uploader";

export const dynamic = "force-dynamic";

export default async function BoxFolder({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { me } = await actingUser();
  let folder;
  try { folder = getFolder(me!.id, id); } catch (e) { if (e instanceof BoxError) notFound(); throw e; }
  const items = listFolderItems(me!.id, id).entries as { id: string }[];
  const files = items.map((i) => serializeFile(db().prepare("SELECT * FROM files WHERE id = ?").get(i.id) as never));
  const versions = (fid: string) => (db().prepare("SELECT COUNT(*) c FROM file_versions WHERE file_id = ?").get(fid) as { c: number }).c;
  const md = peekInstance("folders", id, "enterprise", "keelChecks");
  const people = listCollaborators(id);
  const deliveries = recentDeliveries(6) as { id: number; trigger: string; source_name: string; status: string; attempts: number; last_status_code: number; created_at: string }[];
  const v = md?.data as Record<string, string | number> | undefined;

  return (
    <>
      <div className="crumbs"><Link href="/box">All Files</Link><span className="sep">/</span><span>{folder.name}</span></div>
      <h1 className="title">{folder.name}</h1>
      <div className="boxgrid" style={{ marginTop: 24 }}>
        <div>
          <Uploader folderId={id} />
          <table className="files" style={{ marginTop: 12 }} data-testid="box-files">
            <thead><tr><th>Name</th><th>Version</th><th>Updated</th><th /></tr></thead>
            <tbody>
              {files.map((f) => (
                <tr key={f.id} data-testid={`box-file-${f.name}`}>
                  <td><Link href={`/box/files/${f.id}`} className="fname"><span className="fileicon">{f.name.split(".").pop()?.toUpperCase().slice(0, 4)}</span>{f.name}</Link></td>
                  <td><span className="ver">V{versions(f.id)}</span></td>
                  <td className="muted"><Ago iso={f.modified_at} /> by {f.modified_by.name}</td>
                  <td style={{ textAlign: "right" }}><Link className="linkish" href={`/box/files/${f.id}/edit`}>Edit</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <aside>
          <div className="sidecard" data-testid="box-metadata">
            <h3>Metadata · Keel checks</h3>
            {v ? (
              <>
                <div className="mdrow"><span>Status</span><span data-testid="md-status" style={{ textTransform: "capitalize" }}>{String(v.status)}</span></div>
                <div className="mdrow"><span>Checks passing</span><span>{v.passing ?? "—"}</span></div>
                <div className="mdrow"><span>Checks failing</span><span>{v.failing ?? "—"}</span></div>
                <div className="mdrow"><span>Run</span><span>#{v.runNumber}</span></div>
                <div className="mdrow"><span>Checked</span><span>{v.checkedAt ? <Ago iso={String(v.checkedAt)} /> : "—"}</span></div>
                {v.runUrl && <a className="btn ghost small" style={{ marginTop: 12 }} href={String(v.runUrl)} target="_blank" rel="noreferrer">Run details ↗</a>}
              </>
            ) : <div className="muted">No Keel metadata on this folder.</div>}
          </div>
          <div className="sidecard">
            <h3>Collaborators</h3>
            {people.map((p) => (
              <div key={p.user.id} className="row" style={{ padding: "5px 0" }}>
                <span className={`avatar${p.user.kind === "service" ? " light" : ""}`}>{initials(p.user.name)}</span>
                <span style={{ flex: 1 }}>{p.user.name}{p.user.kind === "service" ? " (service account)" : ""}</span>
                <span className="muted" style={{ fontSize: 12 }}>{p.role}</span>
              </div>
            ))}
          </div>
          <div className="sidecard">
            <h3>Webhook deliveries</h3>
            {deliveries.length ? deliveries.map((d) => (
              <div key={d.id} className="mdrow" style={{ fontSize: 12.5 }}>
                <span>{d.trigger} · {d.source_name}</span>
                <span>{d.status === "delivered" ? `${d.last_status_code}` : d.status}</span>
              </div>
            )) : <div className="muted">None yet.</div>}
          </div>
        </aside>
      </div>
    </>
  );
}
