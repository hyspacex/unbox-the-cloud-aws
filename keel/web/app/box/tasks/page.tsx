import Link from "next/link";
import { Ago } from "@/components/Ago";
import { initials } from "@/components/Glyph";
import { tasksForUser } from "@/lib/fakebox/core";
import { actingUser } from "@/lib/session";
import { CompleteButton } from "./CompleteButton";

export const dynamic = "force-dynamic";

export default async function Tasks({ searchParams }: { searchParams: Promise<{ task?: string }> }) {
  const { task: focus } = await searchParams;
  const { me } = await actingUser();
  const tasks = me ? tasksForUser(me.id) : [];
  const open = tasks.filter((t) => t.assignment.resolution_state === "incomplete");
  const done = tasks.filter((t) => t.assignment.resolution_state !== "incomplete");
  const card = ({ task, assignment }: (typeof tasks)[number]) => (
    <div key={assignment.id} className={`taskcard${task.id === focus ? " focus" : ""}${assignment.resolution_state !== "incomplete" ? " done" : ""}`} data-testid="box-task">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div className="row">
          <span className="avatar light">{initials(task.created_by.name)}</span>
          <div>
            <div style={{ fontWeight: 600, color: "var(--ink)" }}>{task.created_by.name} assigned you a task</div>
            <div className="muted" style={{ fontSize: 13 }}>on <Link href={`/box/files/${task.item.id}`} style={{ textDecoration: "underline" }}>{task.item.name}</Link> · <Ago iso={task.created_at} />{task.due_at ? ` · due ${task.due_at.slice(0, 10)}` : ""}</div>
          </div>
        </div>
        {assignment.resolution_state === "incomplete" ? <CompleteButton assignmentId={assignment.id} /> : <span className="pill">Completed</span>}
      </div>
      <pre>{task.message}</pre>
    </div>
  );
  return (
    <>
      <h1 className="title" style={{ marginTop: 0 }}>Tasks</h1>
      <p className="muted" style={{ fontSize: 14 }}>Assigned to {me?.name}</p>
      <div style={{ display: "grid", gap: 16, marginTop: 20 }}>
        {open.length ? open.map(card) : <p className="muted">No open tasks.</p>}
      </div>
      {done.length > 0 && <><h2 className="section">Completed</h2><div style={{ display: "grid", gap: 16 }}>{done.map(card)}</div></>}
    </>
  );
}
