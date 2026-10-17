/** Fixture integrity: document hashes, the 98-event hash chain, every quote against its pinned text. */
import { describe, expect, it } from "vitest";
import { documentByVersion, fixture, fixtureIntegrity } from "../src/lib/fixture";
import { canonicalJSON, chainHash, GENESIS, sha256Hex, verifyChain } from "../src/lib/engine/ledger";
import { findQuote, hasTerm, norm, quoteValid, sectionText } from "../src/lib/engine/normalize";
import type { EvidenceRef } from "../src/lib/types";

const textOf = (versionId: string) => {
  const d = documentByVersion(versionId);
  if (!d) throw new Error(`no fixture document for version ${versionId}`);
  return fixture.text(d.path);
};

describe("fixture integrity", () => {
  it("every document's SHA-256 equals snapshots.json contentHash", () => {
    const r = fixtureIntegrity();
    expect(r.documents.length).toBe(8);
    for (const d of r.documents) expect(d.actual, d.path).toBe(d.expected);
    expect(r.ok).toBe(true);
  });

  it("verifies all 98 ledger events and reaches the recorded head", () => {
    const l = fixture.ledger();
    const v = verifyChain(l.events, l.chain.genesis);
    expect(v).toMatchObject({ ok: true, verified: 98, total: 98 });
    expect(v.head).toBe(l.chain.head);
    expect(v.head.startsWith("868fefd1")).toBe(true);
  });

  it("detects a tampered event", () => {
    const events = structuredClone(fixture.ledger().events);
    events[40].quote = (events[40].quote ?? "") + " ";
    const v = verifyChain(events);
    expect(v.ok).toBe(false);
    expect(v.first_bad_event_id).toBe(events[40].event_id);
  });

  it("recomputes every snapshot manifest hash", () => {
    for (const s of fixture.snapshots().snapshots) {
      const body = { snapshot_id: s.snapshot_id, captured_at: s.captured_at, control_profile_version: s.control_profile_version, files: s.files };
      expect("sha256:" + sha256Hex(canonicalJSON(body)), s.snapshot_id).toBe(s.manifest_hash);
    }
  });

  it("every quote in expected-findings and the ledger string-matches its pinned version, at the recorded location", () => {
    const refs: EvidenceRef[] = [];
    for (const f of fixture.expected().findings) {
      refs.push(...f.evidence, ...f.prior_evidence);
      for (const c of f.clause_support) if (c.quote) refs.push(c.quote);
    }
    for (const e of fixture.ledger().events) for (const c of e.clause_support ?? []) if (c.quote) refs.push(c.quote);
    expect(refs.length).toBeGreaterThan(100);
    for (const q of refs) {
      const text = textOf(q.versionId);
      expect(quoteValid(q.quote, text), q.quote).toBe(true);
      expect(findQuote(q.quote, text), q.quote).toEqual({ section: q.section, paragraph: q.paragraph, page: q.page });
    }
  });

  it("the hero sentence is gone from v3 and the weaker one is present; §4.4 is identical", () => {
    const v2 = textOf("1801102232");
    const v3 = textOf("1801102233");
    const hero = "All customer data at rest is encrypted using AWS KMS customer-managed keys, rotated annually; key custodians are the Card Servicing Platform leads.";
    expect(quoteValid(hero, v2)).toBe(true);
    expect(quoteValid(hero, v3)).toBe(false);
    expect(sectionText(v2, "All network connections use TLS 1.2 at minimum")).toBe(sectionText(v3, "All network connections use TLS 1.2 at minimum"));
    // SEC-ARCH-05: quote unchanged, section softened.
    const pam = "Privileged access to the Lantern production accounts is brokered through the enterprise PAM vault";
    expect(sectionText(v2, pam)).not.toBe(sectionText(v3, pam));
  });
});

describe("normalization (gen.py norm)", () => {
  it("strips backticks, straightens quotes, unifies hyphens, collapses whitespace, lowercases", () => {
    expect(norm("  `Lantern’s`  “key”\n\tpolicy — non‑standard ")).toBe(`lantern's "key" policy - non-standard`);
  });
  it("hasTerm uses the left word boundary of gen.py", () => {
    expect(hasTerm("Keys are rotated annually", "rotated")).toBe(true);
    expect(hasTerm("unencrypted", "encrypt")).toBe(false);
    expect(hasTerm("encryption", "encrypt")).toBe(true);
  });
});

describe("canonical JSON (Python json.dumps sort_keys, ensure_ascii)", () => {
  it("sorts keys, uses Python separators, escapes non-ASCII including surrogate pairs", () => {
    expect(canonicalJSON({ b: 1, a: [true, null, "x"] })).toBe('{"a": [true, null, "x"], "b": 1}');
    expect(canonicalJSON("§4.3 ¶2 “q”")).toBe('"\\u00a74.3 \\u00b62 \\u201cq\\u201d"');
    expect(canonicalJSON("😀")).toBe('"\\ud83d\\ude00"');
    expect(canonicalJSON({ p: 0.03, q: 0.91, n: 118, small: 0.00001 })).toBe('{"n": 118, "p": 0.03, "q": 0.91, "small": 1e-05}');
    expect(canonicalJSON("tab\tquote\"back\\")).toBe('"tab\\tquote\\"back\\\\"');
  });
  it("chains from the 64-zero genesis", () => {
    const first = fixture.ledger().events[0];
    expect(chainHash(GENESIS, first)).toBe(first.chain_hash);
  });
});
