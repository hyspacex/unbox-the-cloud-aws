import { BoxShell } from "@/components/box/BoxShell";
import { FolderTable } from "@/components/box/FolderTable";

/** The Box folder list. The owl and the Keel panel come from the (box) layout. */
export default function Home() {
  return (
    <BoxShell>
      <FolderTable />
    </BoxShell>
  );
}
