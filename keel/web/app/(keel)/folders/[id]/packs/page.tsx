import { latestCompleted } from "@/lib/keel/data";
import { runnerApi } from "@/lib/keel/runner";
import { PackCard, type CatalogPack } from "./PackCard";

export const dynamic = "force-dynamic";

export default async function Packs({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { packs } = await runnerApi<{ packs: CatalogPack[] }>("/packs");
  const installed = new Map((latestCompleted(id)?.rules?.uses ?? []).map((u) => [u.split("@")[0], u.split("@")[1]]));
  return (
    <>
      <p className="lede" style={{ marginTop: 34 }}>Install a standard as a set of checks. A pack is pinned by version in this folder’s <span className="mono">keel-rules.md</span>, so results stay reproducible until you choose to upgrade.</p>
      <p className="note" style={{ marginTop: 18 }}>Passing a pack means the folder’s documents state what the standard asks for, consistently. It is not a certification.</p>
      <h2 className="section">Catalog</h2>
      <div className="grid2">
        {packs.map((p) => <PackCard key={p.id} folderId={id} pack={p} installedVersion={installed.get(p.id) ?? null} />)}
      </div>
    </>
  );
}
