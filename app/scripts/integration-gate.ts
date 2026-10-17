/**
 * Integration gate (spec section 12, 0:00 to 0:30). Prints PASS / FAIL / SKIP per capability.
 *
 *   cd app && npx tsx scripts/integration-gate.ts            # read-only
 *   cd app && npx tsx scripts/integration-gate.ts --write    # also metadata write/read-back and a task round trip
 *   flags: --bedrock (try the default AWS credential chain even with no AWS_* env), --json
 *
 * Without credentials every live check prints SKIP with the exact env var it needs. Any FAIL means:
 * drop that claim now, capture the local baseline, pick the fallback beat (spec section 12).
 */
import { createHash } from "node:crypto";
import { Checklist, flag, has, loadEnv, fixtureText } from "./_shared";
import { RealBoxAdapter, checkTemplateFields, missingBoxEnv, templateSpec } from "../src/lib/box/real";
import { probeBedrock, bedrockConfigFromEnv } from "../src/lib/agent/evaluator";
import { DeciderGate, gateLabel } from "../src/lib/agent/decider";
import { quoteValid } from "../src/lib/engine/normalize";
import type { BoxFolderItem } from "../src/lib/box/adapter";

type Row = { status: "PASS" | "FAIL" | "SKIP"; reason: string };
type ProbeBox = Pick<RealBoxAdapter, "readFolderMetadata" | "writeFolderMetadata" | "deleteFolderMetadata">;

/**
 * Write keel_snapshot_id=GATE-<ts>, read it back, then restore the exact prior state in finally:
 * an instance the probe created is deleted; a field that was absent is removed; a prior value is
 * rewritten. Restoration is read back too, and a failed restoration is a FAIL (Codex finding 15).
 */
export async function metadataProbe(box: ProbeBox, folderId: string, templateKey: string, now = Date.now()): Promise<Row> {
  const before = await box.readFolderMetadata(folderId, templateKey);
  const prior = before ? before.keel_snapshot_id ?? null : undefined; // undefined: no instance at all
  const probe = `GATE-${now}`;
  let roundTrip: Row | null = null;
  let restore = "";
  try {
    const w = await box.writeFolderMetadata(folderId, templateKey, { keel_snapshot_id: probe });
    if (!w.ok) roundTrip = { status: "FAIL", reason: `${w.error.code}: ${w.error.message}` };
    else {
      const after = await box.readFolderMetadata(folderId, templateKey);
      roundTrip = after?.keel_snapshot_id === probe ? { status: "PASS", reason: `wrote and read back keel_snapshot_id=${probe}` } : { status: "FAIL", reason: `read back ${JSON.stringify(after?.keel_snapshot_id)} instead of ${probe}` };
    }
  } catch (e) {
    roundTrip = { status: "FAIL", reason: `round trip threw: ${e instanceof Error ? e.message : String(e)}` };
  } finally {
    try {
      const r = prior === undefined ? await box.deleteFolderMetadata(folderId, templateKey) : await box.writeFolderMetadata(folderId, templateKey, { keel_snapshot_id: prior });
      const check = await box.readFolderMetadata(folderId, templateKey);
      const restored = prior === undefined ? check === null : (check?.keel_snapshot_id ?? null) === prior;
      // Judged by the read-back state: a 404 on deleting an instance that was never created is fine.
      restore = restored
          ? prior === undefined
            ? "probe instance deleted (none existed before)"
            : prior === null
              ? "keel_snapshot_id removed again (it was absent)"
              : `restored keel_snapshot_id=${prior}`
          : `restore did not take${r.ok ? "" : ` (${r.error.code}: ${r.error.message})`}: read back ${JSON.stringify(check === null ? null : check.keel_snapshot_id ?? null)}, expected ${prior === undefined ? "no instance" : JSON.stringify(prior)}`;
    } catch (e) {
      restore = `restore failed: ${e instanceof Error ? e.message : String(e)}`;
    }
  }
  const restoredOk = !/failed|did not take/.test(restore);
  if (!restoredOk) return { status: "FAIL", reason: `${roundTrip?.reason ?? ""}; ${restore}. Fix the folder's keelReview instance before the demo` };
  return { status: roundTrip!.status, reason: `${roundTrip!.reason}; ${restore}` };
}

type TaskBox = Pick<RealBoxAdapter, "createTask" | "assignTask" | "listTaskAssignments" | "findTaskByMessage" | "deleteTask">;

/**
 * Create a probe review task, assign it to KEEL_REVIEWER_LOGIN, list assignments, reconcile it with
 * findTaskByMessage, then delete it. FAIL unless Box resolves the assignee to that login
 * (case-insensitive, as live authorization compares it) and the lookup finds the same task.
 */
export async function taskRoundTrip(box: TaskBox, f: { fileId: string; fileName: string }, reviewerLogin: string, now = Date.now()): Promise<Row> {
  const probeMessage = `Keel integration gate probe ${now}. Safe to ignore; deleted automatically.`;
  const { task_id } = await box.createTask(f.fileId, probeMessage, "review", new Date(now + 86_400_000).toISOString());
  try {
    const a = await box.assignTask(task_id, { login: reviewerLogin });
    const mine = (await box.listTaskAssignments(task_id)).find((x) => x.assignment_id === a.assignment_id);
    if (!mine) return { status: "FAIL", reason: `assignment ${a.assignment_id} not listed on task ${task_id}` };
    if (mine.assigned_to.login.toLowerCase() !== reviewerLogin.toLowerCase())
      return { status: "FAIL", reason: `assignment ${a.assignment_id} resolved to ${mine.assigned_to.login || "(no login)"} id ${mine.assigned_to.id}, not KEEL_REVIEWER_LOGIN ${reviewerLogin}; live authorization compares logins case-insensitively (or set KEEL_REVIEWER_BOX_USER_ID), so responses on this task would be rejected` };
    const found = await box.findTaskByMessage(f.fileId, probeMessage);
    if (found?.task_id !== task_id) return { status: "FAIL", reason: `findTaskByMessage returned ${JSON.stringify(found)} instead of task ${task_id}; an ambiguous task creation could not be reconciled` };
    return {
      status: "PASS",
      reason: `task ${task_id} on ${f.fileName}, assignment ${a.assignment_id} to ${mine.assigned_to.name} <${mine.assigned_to.login}> id ${mine.assigned_to.id}, state ${mine.resolution_state}; login matches KEEL_REVIEWER_LOGIN; findTaskByMessage finds it. Identity check: have ${reviewerLogin} approve one real task in Box and confirm assigned_to is that user, not the service account`,
    };
  } finally {
    await box.deleteTask(task_id).catch(() => undefined);
  }
}

/** Read-only template check: every field present with the right type and all twelve enum codes. */
export function templateRow(have: { key: string; type: string; options?: { key: string }[] }[] | null, profile: { controls: { id: string }[] }, templateKey: string): Row {
  if (!have) return { status: "FAIL", reason: `template ${templateKey} does not exist; rerun with --write to create it (needs Manage enterprise properties)` };
  const c = checkTemplateFields(have, templateSpec(profile));
  const issues = [
    ...c.incompatible.map((i) => `${i.key} is ${i.have}, needs ${i.want} (cannot be fixed in place: delete the template or set BOX_METADATA_TEMPLATE_KEY)`),
    ...c.missingFields.map((f) => `missing field ${f.key}`),
    ...c.missingOptions.map((m) => `${m.fieldKey} lacks ${m.keys.join(", ")}`),
  ];
  if (!issues.length) return { status: "PASS", reason: `${templateKey} has all ${have.length} fields with the right types and all twelve codes` };
  return { status: "FAIL", reason: issues.join("; ") + (c.incompatible.length ? "" : "; rerun with --write to add them") };
}

async function main() {
  const loaded = loadEnv();
  const write = flag("write");
  const cl = new Checklist();
  console.log(`Keel integration gate  ${new Date().toISOString()}  env: ${loaded.join(", ") || "process env only"}  mode: ${write ? "read + write" : "read-only (pass --write for writes)"}\n`);

  // ---- env ------------------------------------------------------------------
  const boxMissing = missingBoxEnv();
  const folderId = process.env.BOX_FOLDER_ID?.trim() ?? "";
  const templateKey = process.env.BOX_METADATA_TEMPLATE_KEY || "keelReview";
  const reviewerLogin = process.env.KEEL_REVIEWER_LOGIN?.trim() ?? "";
  const awsEnv = ["AWS_PROFILE", "AWS_ACCESS_KEY_ID", "AWS_BEARER_TOKEN_BEDROCK", "AWS_CONTAINER_CREDENTIALS_FULL_URI", "AWS_WEB_IDENTITY_TOKEN_FILE"].filter(has);
  const bcfg = bedrockConfigFromEnv();
  cl.info("env MOCK_MODE", `${process.env.MOCK_MODE ?? "(unset, defaults to true)"}; the app uses the live adapters only when MOCK_MODE=false`);
  if (boxMissing.length) cl.skip("env Box auth", `needs ${boxMissing.join(", ")}`);
  else cl.pass("env Box auth", new RealBoxAdapter().describeAuth());
  folderId ? cl.pass("env BOX_FOLDER_ID", folderId) : cl.skip("env BOX_FOLDER_ID", "needs BOX_FOLDER_ID (the package folder id from the Box URL /folder/<id>)");
  reviewerLogin ? cl.pass("env KEEL_REVIEWER_LOGIN", reviewerLogin) : cl.skip("env KEEL_REVIEWER_LOGIN", "needs KEEL_REVIEWER_LOGIN (a Box user login on the tenant)");
  awsEnv.length
    ? cl.pass("env AWS credentials", `${awsEnv.join(", ")} set; region ${bcfg.region}; inference profile ${bcfg.inferenceProfile}`)
    : cl.skip("env AWS credentials", "needs one of AWS_PROFILE, AWS_ACCESS_KEY_ID(+AWS_SECRET_ACCESS_KEY, AWS_SESSION_TOKEN), AWS_BEARER_TOKEN_BEDROCK (pass --bedrock to try the default chain anyway)");
  has("DECIDER_URL") ? cl.pass("env DECIDER_URL", process.env.DECIDER_URL!) : cl.skip("env DECIDER_URL", "empty: the gate step is omitted from the trace (spec 3 step 5)");

  // ---- Box --------------------------------------------------------------------
  const box = new RealBoxAdapter();
  const boxReady = boxMissing.length === 0;
  const needBox = (name: string) => cl.skip(name, `needs ${boxMissing.join(", ")}`);
  let items: BoxFolderItem[] = [];
  const texts = new Map<string, string>();

  if (!boxReady) {
    for (const n of ["Box current user", "Box list folder items", "Box versions per file", "Box prior versions retained", "Box download by version id", "Box metadata template", "Box folder metadata write/read", "Box task round trip", "Box AI ask (2 files, citations)", "Box AI text gen"]) needBox(n);
  } else {
    await cl.run("Box current user", async () => {
      const u = await box.currentUser();
      return { status: "PASS", reason: `${u.name} <${u.login}> id ${u.id}` };
    });

    if (!folderId) cl.skip("Box list folder items", "needs BOX_FOLDER_ID");
    else
      await cl.run("Box list folder items", async () => {
        items = await box.listFolderItems(folderId);
        return items.length
          ? { status: "PASS", reason: `${items.length} files: ${items.map((i) => `${i.fileName} (${i.fileId}, v ${i.currentVersionId})`).join(", ")}` }
          : { status: "FAIL", reason: "folder has no files; run scripts/seed-box-folder.ts --write" };
      });

    if (!items.length) {
      for (const n of ["Box versions per file", "Box prior versions retained", "Box download by version id"]) cl.skip(n, "no files listed");
    } else {
      await cl.run("Box versions per file", async () => {
        const rows = await Promise.all(items.map(async (i) => ({ i, v: await box.listFileVersions(i.fileId) })));
        const bad = rows.filter((r) => r.v[r.v.length - 1]?.versionId !== r.i.currentVersionId);
        return {
          status: bad.length ? "FAIL" : "PASS",
          reason: rows.map((r) => `${r.i.fileName}: ${r.v.map((v) => `${v.label}=${v.versionId}${v.comment ? ` "${v.comment}"` : ""}`).join(" ")}`).join("; ") + (bad.length ? `; current version mismatch for ${bad.map((b) => b.i.fileName).join(", ")}` : ""),
        };
      });
      await cl.run("Box prior versions retained", async () => {
        const r = await Promise.all(items.map(async (i) => ({ i, p: await box.priorVersionsRetained(i.fileId) })));
        const any = r.filter((x) => x.p.retained);
        return any.length
          ? { status: "PASS", reason: r.map((x) => `${x.i.fileName}: ${x.p.count} prior`).join(", ") }
          : { status: "FAIL", reason: `no prior versions returned (${r[0]?.p.reason ?? "unknown"}); capture the local baseline before the upload (spec section 13)` };
      });
      await cl.run("Box download by version id", async () => {
        const out: string[] = [];
        let failed = 0;
        for (const i of items) {
          const r = await box.downloadVersionText(i.fileId, i.currentVersionId);
          if (!r.ok) {
            failed++;
            out.push(`${i.fileName}: ${r.error.code} ${r.error.message}`);
            continue;
          }
          texts.set(i.fileId, r.text);
          const sha1 = createHash("sha1").update(r.text, "utf8").digest("hex");
          out.push(`${i.fileName}: ${r.text.length} chars ${r.sha256.slice(0, 19)}…${i.sha1 ? (i.sha1 === sha1 ? " sha1 matches Box" : " sha1 differs from Box (non-UTF-8 bytes?)") : ""}`);
        }
        return { status: failed ? "FAIL" : "PASS", reason: out.join("; ") };
      });
    }

    // Metadata template
    const profile = JSON.parse(fixtureText("profile-us-bank.json")) as { controls: { id: string; title: string }[] };
    await cl.run("Box metadata template", async () => {
      if (write) {
        const r = await box.ensureMetadataTemplate(profile, templateKey);
        if (!r.ok) return { status: "FAIL", reason: `${r.error.code}: ${r.error.message}` };
        const added = [...(r.created ? [] : r.added_fields.map((f) => `field ${f}`)), ...r.added_options.map((o) => `${o.fieldKey} options ${o.keys.join(",")}`)];
        return { status: "PASS", reason: `${process.env.BOX_METADATA_SCOPE || "enterprise"}.${templateKey} ${r.created ? "created" : "exists"}${added.length ? `; added ${added.join("; ")}` : ""}` };
      }
      return templateRow(await box.readMetadataTemplate(templateKey), profile, templateKey);
    });

    // Folder metadata write + read back, exact restore in finally
    if (!write) cl.skip("Box folder metadata write/read", "read-only run; pass --write");
    else if (!folderId) cl.skip("Box folder metadata write/read", "needs BOX_FOLDER_ID");
    else await cl.run("Box folder metadata write/read", () => metadataProbe(box, folderId, templateKey));

    // Task round trip
    if (!write) cl.skip("Box task round trip", "read-only run; pass --write");
    else if (!items.length || !reviewerLogin) cl.skip("Box task round trip", !items.length ? "no files listed" : "needs KEEL_REVIEWER_LOGIN");
    else
      await cl.run("Box task round trip", () => taskRoundTrip(box, items[0], reviewerLogin));

    // Box AI ask over two files with citations, validated against the downloaded text
    const two = items.filter((i) => texts.has(i.fileId)).slice(0, 2);
    if (two.length < 2) cl.skip("Box AI ask (2 files, citations)", "needs two downloaded files");
    else
      await cl.run("Box AI ask (2 files, citations)", async () => {
        const r = await box.aiAsk(two.map((i) => i.fileId), "Is there a statement about RTO, RPO or rollback in these files? Quote the exact sentence(s).", { citations: true });
        if (r.unavailable) return { status: "FAIL", reason: `Box AI unavailable: ${r.reason}. search_snapshot will fall back to string search and the trace will say so` };
        const valid = r.citations.filter((c) => texts.has(c.fileId) && quoteValid(c.content, texts.get(c.fileId)!));
        return {
          status: r.citations.length ? "PASS" : "FAIL",
          reason: `${r.citations.length} citations, ${valid.length} validate as whole passages against current text (sentence-level validation runs in search_snapshot); answer: ${JSON.stringify(r.answer.slice(0, 160))}`,
        };
      });

    if (!items.length) cl.skip("Box AI text gen", "no files listed");
    else
      await cl.run("Box AI text gen", async () => {
        const r = await box.aiTextGen([items[0].fileId], "Draft a two-sentence note to the document author asking them to restore the key management statement in section 4.3.");
        return r.unavailable ? { status: "FAIL", reason: `unavailable: ${r.reason}; the author message falls back to the template, labelled` } : { status: "PASS", reason: JSON.stringify(r.text.slice(0, 160)) };
      });
  }

  // ---- Bedrock ------------------------------------------------------------------
  if (!awsEnv.length && !flag("bedrock")) cl.skip("Bedrock Strands call", "needs AWS_PROFILE or AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY (or pass --bedrock to use the default credential chain)");
  else
    await cl.run("Bedrock Strands call", async () => {
      const r = await probeBedrock();
      return r.ok
        ? { status: "PASS", reason: `${r.inferenceProfile} (records model_id ${r.modelId}) replied ${JSON.stringify(r.reply)} in ${r.latencyMs} ms` }
        : { status: "FAIL", reason: `${r.code}: ${r.message}` };
    });

  // ---- Decider ------------------------------------------------------------------
  const gate = new DeciderGate();
  if (!gate.config.url) cl.skip("Decider health + sample", "needs DECIDER_URL (e.g. http://127.0.0.1:8099 after `strands-decider serve ... --port 8099`)");
  else
    await cl.run("Decider health + sample", async () => {
      const h = await gate.health(true);
      if (!h.ok) return { status: "FAIL", reason: `${h.reason}; the gate step will be omitted` };
      const file = { fileId: "sample", fileName: "architecture-v3.md", versionId: "local", contentHash: "" };
      const r = await gate.gate(file, fixtureText("architecture-v3.md"));
      return r ? { status: "PASS", reason: `${String(h.info?.model ?? h.info?.checkpoint ?? "decider")} on ${String(h.info?.device ?? "?")}: ${gateLabel(r)}` } : { status: "FAIL", reason: gate.lastOmissionReason ?? "no result" };
    });

  if (flag("json")) console.log(JSON.stringify(cl.checks, null, 2));
  process.exitCode = cl.summary();
}

if (process.argv[1] && /integration-gate\.ts$/.test(process.argv[1]))
  main().catch((e) => {
    console.error(e);
    process.exitCode = 1;
  });
