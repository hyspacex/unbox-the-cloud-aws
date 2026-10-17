"use server";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import * as box from "@/lib/fakebox/core";
import { runnerApi } from "@/lib/keel/runner";
import { actingUser } from "@/lib/session";

type Result = { ok: true; message?: string } | { ok: false; error: string };
const fail = (e: unknown): Result => ({ ok: false, error: e instanceof Error ? e.message : String(e) });

export async function setActingUser(id: string) {
  (await cookies()).set("keel_user", id, { path: "/", sameSite: "lax", httpOnly: true });
}

// ---------- Keel ----------
export async function runChecks(folderId: string): Promise<Result> {
  try {
    const { me } = await actingUser();
    await runnerApi(`/folders/${folderId}/runs`, { method: "POST", body: { actor_id: me?.id } });
    return { ok: true, message: "Run queued" };
  } catch (e) { return fail(e); }
}

export async function connectFolder(folderId: string): Promise<Result> {
  try {
    const { me } = await actingUser();
    await runnerApi(`/folders`, { method: "POST", body: { folder_id: folderId, actor_id: me?.id } });
    revalidatePath("/");
    return { ok: true };
  } catch (e) { return fail(e); }
}

export async function setPack(folderId: string, packId: string, version: string | null): Promise<Result> {
  try {
    const { me } = await actingUser();
    await runnerApi(`/folders/${folderId}/packs`, { method: "POST", body: { pack_id: packId, version, actor_id: me?.id } });
    return { ok: true, message: version ? "Installed — rerunning checks" : "Removed — rerunning checks" };
  } catch (e) { return fail(e); }
}

// ---------- Fake Box (acting as the signed-in user) ----------
export async function completeAssignment(assignmentId: string): Promise<Result> {
  try {
    const { me } = await actingUser();
    box.resolveAssignment(me!.id, assignmentId, { resolution_state: "completed" });
    revalidatePath("/box/tasks");
    return { ok: true };
  } catch (e) { return fail(e); }
}

export async function trashFile(fileId: string): Promise<Result> {
  try {
    const { me } = await actingUser();
    box.trashFile(me!.id, fileId);
    return { ok: true };
  } catch (e) { return fail(e); }
}

export async function saveText(fileId: string, text: string): Promise<Result> {
  try {
    const { me } = await actingUser();
    box.uploadVersion(me!.id, fileId, Buffer.from(text, "utf8"));
    return { ok: true, message: "Saved as a new version" };
  } catch (e) { return fail(e); }
}
