"use client";

import { useEffect, useRef, useState } from "react";
import type { ControlRow, FindingCard, Ledger, PackageView, Trace, TraceStep } from "@/lib/types";
import { PackageHeader } from "@/components/package/PackageHeader";
import { ControlRows } from "@/components/package/ControlRows";
import { TracePanel } from "@/components/package/TracePanel";
import { FolderProjection } from "@/components/package/FolderProjection";
import { OpenTasks } from "@/components/package/OpenTasks";
import { CountLine } from "@/components/ui/CountLine";
import { StatusChip } from "@/components/ui/StatusChip";
import { FindingCardView } from "@/components/finding/FindingCard";
import { Drawer } from "@/components/ui/Drawer";
import { ExportPanel } from "@/components/ledger/LedgerScreen";

type Props = {
  pkg: PackageView;
  rowsBefore: ControlRow[];
  rowsAfter: ControlRow[];
  rowsPending: ControlRow[];
  countAfter: string;
  trace: Trace;
  heroCard: FindingCard;
  ledger: Ledger;
};

export function DevGallery(p: Props) {
  const [phase, setPhase] = useState<"pending" | "before" | "after">("before");
  const [steps, setSteps] = useState<TraceStep[]>(p.trace.steps);
  const [streaming, setStreaming] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const rows = phase === "pending" ? p.rowsPending : phase === "before" ? p.rowsBefore : p.rowsAfter;
  const count = phase === "after" ? p.countAfter : phase === "pending" ? "8 controls on snapshot S4: 8 Re-check pending" : p.pkg.count_line;

  const stream = () => {
    timers.current.forEach(clearTimeout);
    setSteps([]);
    setStreaming(true);
    setPhase("pending");
    p.trace.steps.forEach((s, i) => timers.current.push(setTimeout(() => setSteps((x) => [...x, s]), 450 * (i + 1))));
    timers.current.push(
      setTimeout(() => {
        setStreaming(false);
        setPhase("before");
      }, 450 * (p.trace.steps.length + 1)),
    );
  };
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const allStatuses = [...p.rowsBefore, ...p.rowsAfter, p.rowsPending[0]].map((r) => r.status);
  const unique = allStatuses.filter((s, i) => allStatuses.findIndex((x) => x.label === s.label) === i);

  return (
    <div className="mx-auto max-w-[1360px] px-6 lg:px-10 pt-8 pb-16 space-y-14">
      <div>
        <div className="eyebrow mb-1">Developer page</div>
        <h1 className="text-[24px] font-semibold text-ink">Components with fixture sample props</h1>
        <p className="text-[13.5px] text-muted mt-1">
          Assembled from demo-data/lantern. Labels here come from the fixture&apos;s test oracle; product screens render the API.
        </p>
      </div>

      <section>
        <h2 className="eyebrow mb-3">Status chips</h2>
        <div className="flex flex-wrap gap-3">
          {unique.map((s) => (
            <StatusChip key={s.label} status={s} />
          ))}
          <StatusChip status={{ rule: 2, kind: "not_evaluated", label: "Not evaluated: input_gate", projection_code: "NOT_EVALUATED", tone: "red" }} />
          <StatusChip status={{ rule: 16, kind: "pending_review", label: "Pending review", projection_code: "PENDING", tone: "grey" }} />
        </div>
      </section>

      <section>
        <h2 className="eyebrow mb-3">Package header</h2>
        <PackageHeader view={p.pkg} />
      </section>

      <section>
        <div className="flex items-center gap-2 mb-3">
          <h2 className="eyebrow mr-3">Rows and count line</h2>
          {(["pending", "before", "after"] as const).map((x) => (
            <button key={x} className={`btn btn-sm ${phase === x ? "btn-primary" : "btn-secondary"}`} onClick={() => setPhase(x)}>
              {x}
            </button>
          ))}
          <button className="btn btn-sm btn-secondary" onClick={stream}>
            stream trace
          </button>
          <button className="btn btn-sm btn-secondary" onClick={() => setDrawer(true)}>
            open hero card in drawer
          </button>
        </div>
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_460px]">
          <div>
            <CountLine text={count} className="text-[18px] mb-3 text-ink" />
            <ControlRows rows={rows} onOpen={() => setDrawer(true)} />
          </div>
          <TracePanel
            steps={steps}
            meta={{ ...p.trace, mode_label: "Mock" }}
            running={streaming}
            gate={p.pkg.gate}
            elapsedMs={streaming ? null : p.trace.total_duration_ms}
          />
        </div>
      </section>

      <section className="grid gap-8 lg:grid-cols-2">
        <FolderProjection projection={p.pkg.projection} currentSnapshotId="S4" />
        <OpenTasks
          tasks={[
            { task_id: "box-task-77120931", assignment_id: "a", action: "review", fileId: "", assignee: "Dana Okafor", assignee_box_user_id: "", finding_id: "KEEL-2026-0405", control_id: "SEC-ARCH-07", snapshot_id: "S4", message: "", status: "completed", resolution_state: "rejected" },
            { task_id: "box-task-77120944", assignment_id: "b", action: "review", kind: "author", fileId: "", assignee: "J. Park (Eng)", assignee_box_user_id: "", finding_id: "KEEL-2026-0405", control_id: "SEC-ARCH-07", snapshot_id: "S4", message: "", due_at: "2026-10-23T17:00:00Z", status: "open" },
            { task_id: "box-task-77120933", assignment_id: "c", action: "review", fileId: "", assignee: "Dana Okafor", assignee_box_user_id: "", finding_id: "KEEL-2026-0404", control_id: "SEC-ARCH-05", snapshot_id: "S4", message: "", status: "open" },
          ]}
        />
      </section>

      <section>
        <h2 className="eyebrow mb-3">Finding card (hero, inline)</h2>
        <div className="panel bg-paper overflow-hidden">
          <FindingCardView card={p.heroCard} mode="mock" layout="drawer" project={p.pkg.header.project} />
        </div>
      </section>

      <section className="max-w-[420px]">
        <h2 className="eyebrow mb-3">Export panel</h2>
        <ExportPanel
          manifest={{
            exported_at: "2026-10-17T15:40:00Z",
            run_ids: [p.trace.run_id],
            snapshot_ids: ["S1", "S2", "S3", "S4"],
            event_count: p.ledger.events.length,
            events_hash: "sha256:" + p.ledger.chain.head,
            chain_head: p.ledger.chain.head,
            limitation: "",
          }}
        />
      </section>

      <Drawer open={drawer} onClose={() => setDrawer(false)}>
        <FindingCardView card={p.heroCard} mode="mock" layout="drawer" onClose={() => setDrawer(false)} project={p.pkg.header.project} />
      </Drawer>
    </div>
  );
}
