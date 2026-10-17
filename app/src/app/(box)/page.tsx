import { BoxShell } from "@/components/box/BoxShell";
import { FolderTable } from "@/components/box/FolderTable";
import { OwlDock } from "@/components/owl/OwlDock";
import { Panel } from "@/components/panel/Panel";

/** UI v4: the reviewer never leaves Box. The Box folder, the owl, and one panel. */
export default function Home() {
  return (
    <>
      <BoxShell>
        <FolderTable />
      </BoxShell>
      <OwlDock />
      <Panel />
    </>
  );
}
