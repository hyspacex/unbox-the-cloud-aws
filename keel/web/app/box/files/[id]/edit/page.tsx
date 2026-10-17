import Link from "next/link";
import { getFile, versionContent } from "@/lib/fakebox/core";
import { actingUser } from "@/lib/session";
import { Editor } from "./Editor";

export const dynamic = "force-dynamic";

export default async function EditFile({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { me } = await actingUser();
  const file = getFile(me!.id, id) as { name: string; parent: { id: string; name: string } };
  const text = versionContent(me!.id, id).content.toString("utf8");
  return (
    <>
      <div className="crumbs">
        <Link href={`/box/folders/${file.parent.id}`}>{file.parent.name}</Link><span className="sep">/</span>
        <Link href={`/box/files/${id}`}>{file.name}</Link><span className="sep">/</span><span>Edit</span>
      </div>
      <h1 className="title">{file.name}</h1>
      <p className="muted" style={{ fontSize: 14 }}>Saving uploads a new version, exactly like uploading the file again.</p>
      <Editor fileId={id} folderId={file.parent.id} initial={text} />
    </>
  );
}
