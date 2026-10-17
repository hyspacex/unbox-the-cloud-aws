import Link from "next/link";
import { notFound } from "next/navigation";
import { FolderLive } from "@/components/FolderLive";
import { Tabs } from "@/components/Tabs";
import { getFolder } from "@/lib/keel/data";
import { RunButton } from "./RunButton";

export default async function FolderLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  const folder = getFolder(id);
  if (!folder) notFound();
  return (
    <main className="page">
      <div className="crumbs"><Link href="/">Folders</Link><span className="sep">/</span><span>{folder.name}</span></div>
      <div className="folderhead">
        <div>
          <h1 className="display">{folder.name}</h1>
          <div className="muted" style={{ fontSize: 14, marginTop: 10 }}>Box folder · owned by {folder.owner?.name}</div>
        </div>
        <div className="row">
          <FolderLive folderId={folder.folder_id} />
          <a className="btn ghost" href={`/box/folders/${folder.folder_id}`} target="_blank" rel="noreferrer">Open in Box ↗</a>
          <RunButton folderId={folder.folder_id} />
        </div>
      </div>
      <Tabs base={`/folders/${id}`} />
      {children}
    </main>
  );
}
