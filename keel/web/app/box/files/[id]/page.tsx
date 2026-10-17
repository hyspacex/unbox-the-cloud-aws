import Link from "next/link";
import { notFound } from "next/navigation";
import { Ago } from "@/components/Ago";
import { allVersionsForUi, BoxError, getFile, listFileTasks, versionContent } from "@/lib/fakebox/core";
import { actingUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function BoxFile({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ version?: string }> }) {
  const { id } = await params;
  const { version } = await searchParams;
  const { me } = await actingUser();
  let file;
  try { file = getFile(me!.id, id) as ReturnType<typeof getFile> & { name: string; parent: { id: string; name: string }; file_version: { id: string } }; }
  catch (e) { if (e instanceof BoxError) notFound(); throw e; }
  const versions = allVersionsForUi(id);
  const shownId = version || file.file_version.id;
  const shown = versions.find((v) => v.id === shownId) ?? versions[0];
  const text = versionContent(me!.id, id, shown.id).content.toString("utf8");
  const tasks = listFileTasks(me!.id, id).entries;
  return (
    <>
      <div className="crumbs">
        <Link href="/box">All Files</Link><span className="sep">/</span>
        <Link href={`/box/folders/${file.parent.id}`}>{file.parent.name}</Link><span className="sep">/</span><span>{file.name}</span>
      </div>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-end" }}>
        <h1 className="title">{file.name}</h1>
        <Link className="btn ghost small" href={`/box/files/${id}/edit`}>Edit</Link>
      </div>
      <div className="boxgrid" style={{ marginTop: 22 }}>
        <div>
          {shown.id !== file.file_version.id && <div className="banner" style={{ marginTop: 0, marginBottom: 14 }}>Viewing version {shown.version_number} (not current)</div>}
          <div className="doc" data-testid="box-doc">
            {text.split("\n").map((line, i) => (
              <div key={i} id={`L${i + 1}`} className="ln"><span>{i + 1}</span><span>{line || " "}</span></div>
            ))}
          </div>
        </div>
        <aside>
          <div className="sidecard">
            <h3>Versions</h3>
            {versions.map((v) => (
              <Link key={v.id} href={`/box/files/${id}?version=${v.id}`} className="mdrow" style={{ fontWeight: v.id === shown.id ? 600 : 400 }}>
                <span>V{v.version_number}{v.id === file.file_version.id ? " · current" : ""}</span>
                <span style={{ fontWeight: 400 }}>{v.uploader_display_name} · <Ago iso={v.created_at} /></span>
              </Link>
            ))}
          </div>
          <div className="sidecard">
            <h3>Tasks</h3>
            {tasks.length ? tasks.map((t) => (
              <Link key={t.id} href={`/box/tasks?task=${t.id}`} className="mdrow">
                <span>{t.task_assignment_collection.entries[0]?.assigned_to.name ?? "Unassigned"}</span>
                <span>{t.is_completed ? "Completed" : "Open"}</span>
              </Link>
            )) : <div className="muted">No tasks.</div>}
          </div>
        </aside>
      </div>
    </>
  );
}
