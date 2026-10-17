# Live slice: the one review transaction the live demo runs

This is a self-contained subset of the full Lantern fixture in the parent folder, kept as the fallback for the live demo. It covers one transaction: architecture.md v3 is uploaded, three controls are evaluated, the reviewer returns the hero finding to the author, and the author gets a remediation task.

- **Package:** two documents. `architecture-v2.md` and `architecture-v3.md` are versions of architecture.md, identical to the full set. `runbook.md` is the runbook version current at the reviewed baseline, with the same recovery sentence as the full set.
- **Profile:** `profile-live.json` holds three controls. SEC-ARCH-07 and SEC-ARCH-17 are copied verbatim from profile-us-bank 2026.3. SEC-ARCH-22 is narrowed to "recovery targets and rollback path are documented", and its BIA consistency check is marked pilot scope. Each control has `required_clauses`.
- **Snapshots:** S2 is the reviewed baseline, captured on 2026-10-07. S4 is the live upload. Live timestamps are the placeholder `LIVE`, and the app re-chains those events when the real time is known.
- **Seed:** the ARB decision ARB-2026-0338 on 2026-10-07. Dana Okafor verified SEC-ARCH-22 and SEC-ARCH-17 on 2026-10-07, and Priya Natarajan verified SEC-ARCH-07 on 2026-10-08T10:32Z.

| Control | Machine assessment | Change | Expected display |
| --- | --- | --- | --- |
| SEC-ARCH-07 | evidence_weakened | weakened | Needs review: key-management evidence missing |
| SEC-ARCH-22 | evidence_found | moved | Verified, stale: evidence moved, re-review due |
| SEC-ARCH-17 | evidence_found | unchanged | Verified |

For SEC-ARCH-22, the runbook quote already existed, so support did not move; only the selected binding did. For SEC-ARCH-07, clause support shows encryption at rest supported and the key model, rotation, custodians and AES-256 unsupported.

The human actions are as follows:

1. Keel creates Box task A for Dana Okafor, carrying the finding id and snapshot id.
2. Dana completes it with her reason: "Encrypted is stated; the key model and rotation are not. Requirement IS-STD-014 §5.1 needs the KMS CMK statement restored." The disposition becomes returned_to_author.
3. Keel then creates task B for J. Park (Eng), due 2026-10-23T17:00Z, quoting the lost clause.

The ledger records both task ids, the reviewer identity as returned by Box, and the freshness check.

| File | Contents |
| --- | --- |
| `profile-live.json` | Three controls, ten fields each, including required_clauses. |
| `snapshots.json` | S2 and S4 manifests with file ids, version ids, content hashes and manifest hashes. |
| `ledger.json` | Seed and live events, hash-chained. |
| `expected-findings.json` | Three findings, with clause support. |
| `agent-trace.json` | About 12 s. Steps are tagged as app or agent events. |

The files in this folder are written by `../scripts/gen.py`. Edit the parent documents, not these copies.
