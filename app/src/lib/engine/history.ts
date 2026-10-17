/**
 * UI v4.1 read models (docs/research/51-ui-v4-1-team-review.md, "API additions"): the rule-source chip
 * from the control profile, the dashboard tiles, and the package and per-control history strips.
 * Everything is computed from the profile, the displayed outcomes and the ledger; nothing decides a status.
 * Every generated string passes the wording filter.
 */
import type { Store } from "../store";
import type { ControlProfile, DashboardTile, Snapshot, TimelinePoint } from "../types";
import { capWords } from "./display";
import { buildRows, snapshotEvaluationState, type RowWithState } from "./state";
import { changedFiles, hasRecordedDecision, holdRows, needsDecision } from "./summary";
import { bannedWords } from "./wording";

export { ORIGIN_LABEL, parseStandard, ruleSource, ruleName, RULE_NAME_MAX_WORDS } from "./rule-source";

// ------------------------------------------------------------------------------------------------
// Dashboard
// ------------------------------------------------------------------------------------------------

/** Hold / Need you / Recorded, from displayed outcomes and decision flags. Grey when 0. */
export function dashboardTiles(store: Store, rows: RowWithState[]): DashboardTile[] {
  const acked = (id: string) => rows.some((r) => r.control_id === id && hasRecordedDecision(store, r));
  const hold = holdRows(rows, acked).length;
  const need = rows.filter((r) => needsDecision(store, r)).length;
  const recorded = rows.filter((r) => hasRecordedDecision(store, r)).length;
  return [
    { key: "hold", label: "Hold", value: hold, tone: hold ? "teal" : "grey" },
    { key: "need_you", label: "Need you", value: need, tone: need ? "amber" : "grey" },
    { key: "recorded", label: "Recorded", value: recorded, tone: recorded ? "blue" : "grey" },
  ];
}

// ------------------------------------------------------------------------------------------------
// Timelines
// ------------------------------------------------------------------------------------------------

export const TIMELINE_LABEL_MAX_WORDS = 4;
export const TIMELINE_DETAIL_MAX_WORDS = 12;

/** Label words: "·" and bare numbers are not counted ("architecture v3 · 3 need you" is four words). */
export function labelWords(s: string): number {
  return s.split(/\s+/).filter((w) => w && w !== "·" && !/^\d+$/.test(w)).length;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const prose = (iso: string) => {
  const m = /^(\d{4})-(\d\d)-(\d\d)/.exec(iso);
  return m ? `${MONTHS[Number(m[2]) - 1]} ${Number(m[3])}` : iso;
};
const stem = (fileName: string) => fileName.replace(/\.[^.]+$/, "");
const clean = (t: string, fallback: string) => (bannedWords(t).length ? fallback : t);
const detailOf = (t: string, fallback: string) => clean(capWords(t, TIMELINE_DETAIL_MAX_WORDS), fallback);

function snapshotChange(store: Store, snap: Snapshot) {
  const prior = store.previousSnapshot(snap.snapshot_id);
  const label = (f: Snapshot["files"][number]) => f.versionLabel ?? store.versionLabel(f.fileId, f.versionId);
  const ch = changedFiles(snap, prior, label);
  const tag = (names: string[]) => {
    if (names.length !== 1) return names.length ? `${names.length} files` : "";
    const f = snap.files.find((x) => x.fileName === names[0]);
    return `${stem(names[0])}${f && label(f) ? ` ${label(f)}` : ""}`;
  };
  const phrase = (names: string[]) => names.map((n) => {
    const f = snap.files.find((x) => x.fileName === n);
    return `${n}${f && label(f) ? ` ${label(f)}` : ""}`;
  }).join(", ");
  return { prior, names: ch.names, tag, phrase };
}

/** One point per snapshot of the package: when, because of which file, the status after. */
export function packageTimeline(store: Store, profile: ControlProfile): TimelinePoint[] {
  const current = store.data.current_snapshot_id;
  return store.data.snapshots.map((snap) => {
    const id = snap.snapshot_id;
    const { prior, names, tag, phrase } = snapshotChange(store, snap);
    const base = { snapshot_id: id, at: snap.captured_at, changed_files: names, current: id === current };
    const state = snapshotEvaluationState(store.events, id).state;
    const rows = buildRows(store, profile, id, { withPrior: false });
    const n = rows.length;
    const t = tag(names);
    const withTag = (s: string) => (t && labelWords(`${t} · ${s}`) <= TIMELINE_LABEL_MAX_WORDS ? `${t} · ${s}` : s);
    if (state === "pending") return { ...base, label: "re-checking", detail: detailOf(`Re-checking ${n} controls…`, "Re-checking…"), tone: "grey" as const };
    if (!prior) return { ...base, label: "baseline", detail: detailOf(`First snapshot: ${snap.files.length} files pinned.`, "First snapshot."), tone: "grey" as const };
    const changedText = names.length ? `${phrase(names)} changed.` : "No file changed.";
    const open = rows.filter((r) => needsDecision(store, r)).length;
    const verifiedHere = rows.filter((r) => r.status.kind === "verified").length;
    const recorded = rows.filter((r) => hasRecordedDecision(store, r)).length;
    const holds = rows.filter((r) => r.status.kind === "verified_holds").length;
    if (state === "error") return { ...base, label: withTag("check stopped"), detail: detailOf(`${changedText} The check stopped; nothing was decided.`, "The check stopped."), tone: "grey" as const };
    if (open) return { ...base, label: withTag(`${open} need you`), detail: detailOf(`${changedText} ${open} ${open === 1 ? "needs" : "need"} your decision.`, `${open} need your decision.`), tone: "amber" as const };
    if (verifiedHere === n) {
      const who = [...new Set(rows.map((r) => r.state.current_disposition?.actor.name).filter((x): x is string => !!x))];
      return { ...base, label: `${n} verified`, detail: detailOf(`${n} controls verified by ${who.join(", ")}.`, `${n} controls verified.`), tone: "blue" as const };
    }
    if (recorded) return { ...base, label: withTag("recorded"), detail: detailOf(`${changedText} All ${n} recorded.`, `All ${n} recorded.`), tone: "blue" as const };
    if (holds === n) return { ...base, label: withTag("holds"), detail: detailOf(`${changedText} ${n} verifications hold.`, `${n} verifications hold.`), tone: "teal" as const };
    return { ...base, label: withTag("checked"), detail: detailOf(changedText, "Checked."), tone: "grey" as const };
  });
}

function controlWord(row: RowWithState): string {
  const k = row.status.kind;
  if (k === "verified") return `verified by ${(row.state.current_disposition?.actor.name ?? "").split(" ")[0]}`.trim();
  if (k === "returned_to_author") return "returned to author";
  if (k === "verified_holds") return /^Acknowledged by /.test(row.status.detail ?? "") ? "acknowledged" : "holds";
  if (k === "acknowledge") return "acknowledge";
  if (k.startsWith("needs_review")) return "needs review";
  if (k === "not_evaluated") return "not evaluated";
  if (k === "pending_review") return "pending review";
  if (k === "pending_recheck") return "re-checking";
  return capWords(row.status.label.toLowerCase(), TIMELINE_LABEL_MAX_WORDS);
}

const CONTROL_TONE: Record<string, TimelinePoint["tone"]> = { grey: "grey", blue: "blue", amber: "amber", red: "amber", teal: "teal", green: "green" };

/** One point per snapshot for one control: verified, holds, needs review, returned, acknowledged. */
export function controlTimeline(store: Store, profile: ControlProfile, controlId: string): TimelinePoint[] {
  const current = store.data.current_snapshot_id;
  return store.data.snapshots.flatMap((snap) => {
    const id = snap.snapshot_id;
    const row = buildRows(store, profile, id, { withPrior: false }).find((r) => r.control_id === controlId);
    if (!row) return [];
    const { names, tag, phrase } = snapshotChange(store, snap);
    // Files relevant to this control: its evidencing file now, and the file its verification was on.
    const mine = names.filter((n) => n === row.evidencing?.fileName || n === row.state.prior_verification?.fileName);
    const word = controlWord(row);
    const t = tag(mine);
    const label = t && labelWords(`${t} · ${word}`) <= TIMELINE_LABEL_MAX_WORDS ? `${t} · ${word}` : word;
    const d = row.state.current_disposition;
    const who =
      row.status.kind === "verified" && d
        ? `Verified by ${d.actor.name} on ${d.binding.fileName} ${store.versionLabel(d.binding.fileId, d.binding.versionId) ?? ""}`.trim()
        : row.status.kind === "returned_to_author" && d
          ? `Returned by ${d.actor.name}${d.due_at ? `; due ${prose(d.due_at)}` : ""}`
          : (row.status.short ?? row.status.label);
    const detail = detailOf(mine.length ? `${phrase(mine)} changed. ${who}.` : `${who}.`, "See the record.");
    let tone = CONTROL_TONE[row.status.tone] ?? "grey";
    if (tone === "green" && id !== current) tone = "blue"; // green only for a Verified on the current snapshot
    return [{ snapshot_id: id, at: snap.captured_at, label: clean(label, word), detail, tone, changed_files: mine, current: id === current }];
  });
}
