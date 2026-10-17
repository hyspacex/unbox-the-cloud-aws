import { BoxPush } from "@/components/box/BoxPush";
import { OwlDock } from "@/components/owl/OwlDock";
import { Panel } from "@/components/panel/Panel";

/**
 * UI v4: the reviewer never leaves Box. The folder list ("/") and the file preview ("/files/[fileId]") share this
 * layout, so the Keel panel stays open, the owl stays docked and the push layout holds while navigating between them.
 */
export default function BoxLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <BoxPush>{children}</BoxPush>
      <OwlDock />
      <Panel />
    </>
  );
}
