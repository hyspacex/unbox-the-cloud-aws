/**
 * Append-only, hash-chained ledger compatible with the fixture (spec 3 step 9; CONTRACTS.md).
 *   chain_hash = sha256(prev_chain_hash + canonicalJSON(event without chain_hash))
 * canonicalJSON reproduces Python json.dumps(obj, sort_keys=True) with default separators
 * (", " and ": ") and ensure_ascii=True, which is how scripts/gen.py chained the 98 fixture events.
 */
import { createHash } from "node:crypto";
import type { Actor, HumanDisposition, LedgerEvent, LedgerEventType, PriorVerification } from "../types";
import { NORMALIZATION } from "./normalize";
import { sanitizeMachineEvent } from "./wording";

export const GENESIS = "0".repeat(64);
export const CHAIN_ALGORITHM = "sha256(previous chain_hash + canonical JSON of event without chain_hash)";

/** Python json.dumps string escaping with ensure_ascii=True (lowercase \uXXXX, surrogate pairs as two escapes). */
function pyStr(s: string): string {
  let o = '"';
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    const ch = s[i];
    if (ch === '"') o += '\\"';
    else if (ch === "\\") o += "\\\\";
    else if (c === 10) o += "\\n";
    else if (c === 13) o += "\\r";
    else if (c === 9) o += "\\t";
    else if (c === 8) o += "\\b";
    else if (c === 12) o += "\\f";
    else if (c < 0x20 || c > 0x7e) o += "\\u" + c.toString(16).padStart(4, "0");
    else o += ch;
  }
  return o + '"';
}

/** Python float repr for non-integers: shortest round-trip digits; exponent below 1e-4 or from 1e16. */
export class CanonicalNumberError extends Error {}

/**
 * Numeric contract (Codex finding 19), enforced: ledger numbers are safe integers or finite
 * non-integral floats. Negative zero, NaN, Infinity and unsafe integers are rejected because Python
 * prints them differently ("-0.0", "NaN", exact big ints) or JSON cannot carry them. Integral floats
 * cannot be told apart from integers after JSON parsing; the engine never writes them.
 */
function pyNumber(n: number): string {
  if (!Number.isFinite(n)) throw new CanonicalNumberError(`canonicalJSON: non-finite number ${n} is outside the ledger numeric contract`);
  if (Object.is(n, -0)) throw new CanonicalNumberError("canonicalJSON: negative zero is outside the ledger numeric contract");
  if (Number.isInteger(n) && !Number.isSafeInteger(n)) throw new CanonicalNumberError(`canonicalJSON: unsafe integer ${n} is outside the ledger numeric contract`);
  // JSON parsing cannot tell 1 from 1.0; the fixture only holds ints and short floats (0.03, 0.91).
  if (Number.isInteger(n) && Math.abs(n) < 1e21) return String(n);
  const abs = Math.abs(n);
  if (abs !== 0 && (abs < 1e-4 || abs >= 1e16)) {
    const [mant, exp] = n.toExponential().split("e");
    const e = Number(exp);
    return `${mant}e${e < 0 ? "-" : "+"}${String(Math.abs(e)).padStart(2, "0")}`;
  }
  return String(n);
}

/** Python sorts str keys by Unicode code point; JS sort compares UTF-16 units, which differs for astral characters. */
function byCodePoint(a: string, b: string): number {
  const A = Array.from(a);
  const B = Array.from(b);
  for (let i = 0; i < Math.min(A.length, B.length); i++) {
    const d = A[i].codePointAt(0)! - B[i].codePointAt(0)!;
    if (d) return d;
  }
  return A.length - B.length;
}

/**
 * Canonical JSON = Python json.dumps(v, sort_keys=True). Keys with undefined values are dropped (JSON semantics).
 *
 * Supported value domain (restriction, documented): strings, booleans, null, arrays, objects, safe
 * integers and finite non-integral floats. JSON parsing cannot distinguish 1 from 1.0 or 0 from -0.0,
 * so events must not carry integral floats or negative zero (Python would print "1.0" / "-0.0"); the
 * engine only writes integers and probabilities such as 0.03. Keys sort by Unicode code point as Python does.
 */
export function canonicalJSON(v: unknown): string {
  if (v === null || v === undefined) return "null";
  if (v === true) return "true";
  if (v === false) return "false";
  if (typeof v === "number") return pyNumber(v);
  if (typeof v === "string") return pyStr(v);
  if (Array.isArray(v)) return "[" + v.map((x) => canonicalJSON(x === undefined ? null : x)).join(", ") + "]";
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    const keys = Object.keys(o)
      .filter((k) => o[k] !== undefined)
      .sort(byCodePoint);
    return "{" + keys.map((k) => pyStr(k) + ": " + canonicalJSON(o[k])).join(", ") + "}";
  }
  throw new Error(`canonicalJSON: unsupported value ${typeof v}`);
}

export const sha256Hex = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");

export function eventBody(e: LedgerEvent | Record<string, unknown>): Record<string, unknown> {
  const b: Record<string, unknown> = {};
  for (const k of Object.keys(e)) if (k !== "chain_hash") b[k] = (e as Record<string, unknown>)[k];
  return b;
}

export function chainHash(prev: string, e: LedgerEvent | Record<string, unknown>): string {
  return sha256Hex(prev + canonicalJSON(eventBody(e)));
}

export interface ChainVerification {
  ok: boolean;
  verified: number;
  total: number;
  head: string;
  first_bad_event_id?: string;
}

/** Recompute every link. Stops counting at the first mismatch. */
export function verifyChain(events: LedgerEvent[], genesis = GENESIS): ChainVerification {
  let prev = genesis;
  let verified = 0;
  for (const e of events) {
    if (chainHash(prev, e) !== e.chain_hash) {
      return { ok: false, verified, total: events.length, head: prev, first_bad_event_id: e.event_id };
    }
    verified++;
    prev = e.chain_hash;
  }
  return { ok: true, verified, total: events.length, head: prev };
}

// ---------------------------------------------------------------------------------------------
// Appending
// ---------------------------------------------------------------------------------------------

export interface LedgerState {
  genesis: string;
  head: string;
  events: LedgerEvent[];
}

/** Everything a caller may pass; the envelope is filled in by appendEvent. */
export type EventInput = {
  event_type: LedgerEventType;
  actor: Actor | (Omit<Actor, "type"> & { type: string });
  snapshot_id: string | null;
  phase?: LedgerEvent["phase"];
  ts?: string;
} & Partial<Omit<LedgerEvent, "event_id" | "chain_hash" | "event_type" | "actor" | "snapshot_id" | "phase" | "ts">> &
  Record<string, unknown>;

/** Machine events about one control must carry current_disposition + prior_verification (spec 4, v3.4). */
const MACHINE_CONTROL_EVENTS: LedgerEventType[] = [
  "control_evaluated",
  "evaluation_error",
  "verification_holds",
  "verification_requires_acknowledgment",
  "binding_changed",
];

const ENVELOPE_KEYS = [
  "event_id",
  "ts",
  "phase",
  "snapshot_id",
  "control_id",
  "event_type",
  "machine_assessment",
  "prior_machine_assessment",
  "change_classification",
  "actor",
  "fileId",
  "fileName",
  "versionId",
  "contentHash",
  "quote",
  "basis",
  "clause_support",
  "prompt_hash",
  "projection",
  "mrm_model_id",
  "normalization",
  "box_deep_link",
] as const;

export const FIXTURE_FOLDER_ID = "318840021";

/** gen.py deep_link: file version link when a file is known, else the package folder. */
export function deepLink(fileId: string | null | undefined, versionId: string | null | undefined, folderId = FIXTURE_FOLDER_ID): string {
  if (fileId) return versionId ? `https://app.box.com/file/${fileId}?version=${versionId}` : `https://app.box.com/file/${fileId}`;
  return `https://app.box.com/folder/${folderId}`;
}

/** UTC now, second precision ("2026-10-17T15:30:00Z"), as the fixture writes timestamps. */
export function utcNow(d: Date = new Date()): string {
  return d.toISOString().replace(/\.\d{3}Z$/, "Z");
}

export function nextEventId(events: LedgerEvent[]): string {
  let max = 0;
  for (const e of events) {
    const n = Number(/^EVT-(\d+)$/.exec(e.event_id)?.[1] ?? 0);
    if (n > max) max = n;
  }
  return `EVT-${String(max + 1).padStart(4, "0")}`;
}

function stripUndefined<T>(v: T): T {
  if (Array.isArray(v)) return v.map(stripUndefined) as T;
  if (v && typeof v === "object") {
    const o: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) if (x !== undefined) o[k] = stripUndefined(x);
    return o as T;
  }
  return v;
}

/**
 * Build the next event with the fixed envelope (every envelope key present, null when n/a),
 * the next EVT-NNNN id, a real UTC timestamp, the Box deep link, and the chain hash; push it.
 * Enforces: machine events never carry a human_disposition; machine control events carry
 * current_disposition and prior_verification; human_disposition_recorded comes from a human actor.
 */
export function appendEvent(
  ledger: LedgerState,
  input: EventInput,
  opts: { mrmModelId: string; folderId?: string; now?: Date } = { mrmModelId: "MRM-AI-0271" },
): LedgerEvent {
  const isHuman = input.actor.type === "human";
  if (!isHuman && input.human_disposition !== undefined && input.human_disposition !== null) {
    throw new Error(`ledger: machine event ${input.event_type} must not carry human_disposition`);
  }
  if (input.event_type === "human_disposition_recorded" && !isHuman) {
    throw new Error("ledger: human_disposition_recorded requires a human actor");
  }
  if (!isHuman && input.control_id && MACHINE_CONTROL_EVENTS.includes(input.event_type)) {
    if (!("current_disposition" in input) || !("prior_verification" in input)) {
      throw new Error(`ledger: ${input.event_type} for ${input.control_id} must carry current_disposition and prior_verification`);
    }
  }
  const e: Record<string, unknown> = {
    event_id: nextEventId(ledger.events),
    ts: input.ts ?? utcNow(opts.now),
    phase: input.phase ?? "live",
    snapshot_id: input.snapshot_id ?? null,
    control_id: input.control_id ?? null,
    event_type: input.event_type,
    machine_assessment: input.machine_assessment ?? null,
    prior_machine_assessment: input.prior_machine_assessment ?? null,
    change_classification: input.change_classification ?? null,
    actor: input.actor,
    fileId: input.fileId ?? null,
    fileName: input.fileName ?? null,
    versionId: input.versionId ?? null,
    contentHash: input.contentHash ?? null,
    quote: input.quote ?? null,
    basis: input.basis ?? null,
    clause_support: input.clause_support ?? null,
    prompt_hash: input.prompt_hash ?? null,
    projection: input.projection ?? { box_metadata: "n/a" },
    mrm_model_id: opts.mrmModelId,
    normalization: NORMALIZATION,
    box_deep_link: deepLink((input.fileId as string | null | undefined) ?? null, (input.versionId as string | null | undefined) ?? null, opts.folderId),
  };
  if (isHuman) e.human_disposition = input.human_disposition ?? null;
  for (const [k, v] of Object.entries(input)) {
    if ((ENVELOPE_KEYS as readonly string[]).includes(k) || k === "human_disposition" || k === "chain_hash") continue;
    if (v !== undefined) e[k] = v;
  }
  const clean = sanitizeMachineEvent(stripUndefined(e)) as unknown as LedgerEvent; // wording filter at the persistence boundary
  clean.chain_hash = chainHash(ledger.head, clean);
  ledger.events.push(clean);
  ledger.head = clean.chain_hash;
  return clean;
}

// ---------------------------------------------------------------------------------------------
// Reading helpers (the fixture stores human_disposition as a string; tolerate the object form)
// ---------------------------------------------------------------------------------------------

/** The disposition value of a human_disposition_recorded event, whichever form it was written in. */
export function dispositionOf(e: LedgerEvent): HumanDisposition | null {
  const hd = e.human_disposition as unknown;
  if (typeof hd === "string") return hd as HumanDisposition;
  if (hd && typeof hd === "object" && "disposition" in hd) return (hd as { disposition: HumanDisposition }).disposition;
  return null;
}

export function priorVerificationFromEvent(e: LedgerEvent): PriorVerification {
  return {
    actor: e.actor.name,
    role: e.actor.role ?? "",
    snapshot_id: e.snapshot_id ?? "",
    fileId: e.fileId ?? "",
    fileName: e.fileName ?? "",
    versionId: e.versionId ?? "",
    verified_at: e.ts,
    event_id: e.event_id,
  };
}

export const MACHINE_TEXT_BANNED = ["satisfied", "compliant", "passed", "regressed"];
