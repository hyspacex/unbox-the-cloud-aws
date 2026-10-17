import { Bell } from "@/components/Bell";
import { LeftNav } from "@/components/LeftNav";
import { UserSwitcher } from "@/components/UserSwitcher";
import { folderState, latestCompleted, listFolders } from "@/lib/keel/data";
import { actingUser } from "@/lib/session";

export default async function KeelLayout({ children }: { children: React.ReactNode }) {
  const { me, users } = await actingUser();
  const folders = listFolders().map((f) => ({ id: f.folder_id, name: f.name, state: folderState(latestCompleted(f.folder_id)) }));
  return (
    <div className="app">
      <LeftNav folders={folders} />
      <div style={{ minWidth: 0 }}>
        <header className="appbar">
          <div className="search">⌕ Search decisions, checks and files</div>
          <div className="spacer" />
          <Bell />
          {me && <UserSwitcher users={users} current={me.id} label="" />}
        </header>
        {children}
      </div>
    </div>
  );
}
