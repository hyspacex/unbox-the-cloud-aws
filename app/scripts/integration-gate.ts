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
import { RealBoxAdapter, missingBoxEnv, statusFieldKey } from "../src/lib/box/real";
import { probeBedrock, bedrockConfigFromEnv } from "../src/lib/agent/evaluator";
import { DeciderGate, gateLabel } from "../src/lib/agent/decider";
import { quoteValid } from "../src/lib/engine/normalize";
import type { BoxFolderItem } from "../src/lib/box/adapter";

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
        return { status: "PASS", reason: `${process.env.BOX_METADATA_SCOPE || "enterprise"}.${templateKey} ${r.created ? "created" : "exists"}${r.added_fields.length && !r.created ? `; added ${r.added_fields.join(", ")}` : ""}` };
      }
      try {
        const t = await box.client().metadataTemplates.getMetadataTemplate(process.env.BOX_METADATA_SCOPE || "enterprise", templateKey);
        const keys = new Set((t.fields ?? []).map((f) => f.key));
        const missing = ["keel_snapshot_id", ...profile.controls.map((c) => statusFieldKey(c.id)), "keel_last_human_review", "keel_record_url"].filter((k) => !keys.has(k));
        return missing.length ? { status: "FAIL", reason: `template exists but lacks ${missing.join(", ")}; rerun with --write to add them` } : { status: "PASS", reason: `${templateKey} has all ${keys.size} fields` };
      } catch (e) {
        const status = (e as { responseInfo?: { statusCode?: number } }).responseInfo?.statusCode;
        if (status === 404) return { status: "FAIL", reason: `template ${templateKey} does not exist; rerun with --write to create it (needs Manage enterprise properties)` };
        throw e;
      }
    });

    // Folder metadata write + read back (restores the previous value)
    if (!write) cl.skip("Box folder metadata write/read", "read-only run; pass --write");
    else if (!folderId) cl.skip("Box folder metadata write/read", "needs BOX_FOLDER_ID");
    else
      await cl.run("Box folder metadata write/read", async () => {
        const before = await box.readFolderMetadata(folderId, templateKey);
        const probe = `GATE-${Date.now()}`;
        const w = await box.writeFolderMetadata(folderId, templateKey, { keel_snapshot_id: probe });
        if (!w.ok) return { status: "FAIL", reason: `${w.error.code}: ${w.error.message}` };
        const after = await box.readFolderMetadata(folderId, templateKey);
        const restored = before?.keel_snapshot_id ? await box.writeFolderMetadata(folderId, templateKey, { keel_snapshot_id: before.keel_snapshot_id }) : { ok: true };
        return after?.keel_snapshot_id === probe
          ? { status: "PASS", reason: `wrote and read back keel_snapshot_id=${probe}; ${before?.keel_snapshot_id ? `restored ${before.keel_snapshot_id}` : "instance created"}${restored.ok ? "" : " (restore failed)"}` }
          : { status: "FAIL", reason: `read back ${JSON.stringify(after?.keel_snapshot_id)} instead of ${probe}` };
      });

    // Task round trip
    if (!write) cl.skip("Box task round trip", "read-only run; pass --write");
    else if (!items.length || !reviewerLogin) cl.skip("Box task round trip", !items.length ? "no files listed" : "needs KEEL_REVIEWER_LOGIN");
    else
      await cl.run("Box task round trip", async () => {
        const f = items[0];
        const { task_id } = await box.createTask(f.fileId, "Keel integration gate probe. Safe to ignore; deleted automatically.", "review", new Date(Date.now() + 86_400_000).toISOString());
        try {
          const a = await box.assignTask(task_id, { login: reviewerLogin });
          const list = await box.listTaskAssignments(task_id);
          const mine = list.find((x) => x.assignment_id === a.assignment_id);
          return mine
            ? { status: "PASS", reason: `task ${task_id} on ${f.fileName}, assignment ${a.assignment_id} to ${a.assigned_to.name} <${a.assigned_to.login}> id ${a.assigned_to.id}, state ${mine.resolution_state}. Identity check: have ${reviewerLogin} approve one task in Box and confirm assigned_to here is that user, not the service account` }
            : { status: "FAIL", reason: `assignment ${a.assignment_id} not listed on task ${task_id}` };
        } finally {
          await box.client().tasks.deleteTaskById(task_id).catch(() => undefined);
        }
      });

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

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
