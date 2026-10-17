# Live slice: the one review transaction the live demo runs (design v3.2)

This is a self-contained subset of the full Lantern fixture in the parent folder, kept as the fallback for the live demo. It covers one transaction: architecture.md v3 is uploaded, three controls are evaluated, the reviewer returns the hero finding to the author, and the author gets a remediation task.

- **Package:** two documents. `architecture-v2.md` and `architecture-v3.md` are versions of architecture.md, identical to the full set. `runbook.md` is the runbook version current at the reviewed baseline, with the same recovery sentence as the full set.
- **Profile:** `profile-live.json` holds three controls with the same ten fields as the full profile. SEC-ARCH-07 and SEC-ARCH-17 are copied verbatim, including their `required_clauses` and hint terms. SEC-ARCH-22 is narrowed to two clauses: RTO and RPO stated, and rollback path described. Its BIA consistency check is pilot scope.
- **Snapshots:** S2 is the reviewed baseline, captured on 2026-10-07. S4 is the live upload. Live timestamps are the placeholder `LIVE`, and the app re-chains those events when the real time is known.
- **Seed:** the ARB decision ARB-2026-0338 on 2026-10-07. Dana Okafor verified SEC-ARCH-22 and SEC-ARCH-17 on 2026-10-07, and Priya Natarajan verified SEC-ARCH-07 on 2026-10-08T10:32Z.

| Control | Machine assessment | Change | Expected display |
| --- | --- | --- | --- |
| SEC-ARCH-07 | evidence_weakened | weakened | Needs review: key-management evidence missing |
| SEC-ARCH-22 | evidence_found | moved | Verified, stale: evidence moved, re-review due |
| SEC-ARCH-17 | evidence_found | unchanged | Verified |

Code derives each assessment from clause support. For SEC-ARCH-07, encryption at rest is supported and the key model, rotation, custodians and AES-256 are unsupported, so the result is weakened rather than absent. For SEC-ARCH-22, the runbook quote already existed, so support did not move; only the selected binding did.

The human actions are as follows (tasks A, B and C):

1. Keel creates Box task A for Dana Okafor, carrying the finding id and snapshot id.
2. Dana completes it with her reason: "Encrypted is stated; the key model and rotation are not. Requirement IS-STD-014 §5.1 needs the KMS CMK statement restored." The disposition becomes returned_to_author.
3. Keel then creates task B for J. Park (Eng), due 2026-10-23T17:00Z, quoting the lost clause.

Keel records returned_to_author only after task B exists. The ledger records both task ids, the reviewer identity as returned by Box, the freshness check, and a folder-level projection after each change.

Keel also creates review task C for SEC-ARCH-22, assigned to Dana. She approves it with the attestation phrase, and SEC-ARCH-22 is re-verified on runbook.md, so it ends the slice as "Verified". The count line after the human actions is "3 controls on snapshot S4: 1 Verified holds, 1 Verified, 1 Returned to author".

| File | Contents |
| --- | --- |
| `profile-live.json` | Three controls, ten fields each, plus materiality and the attestation phrase. |
| `snapshots.json` | S2 and S4 manifests with file ids, version ids, content hashes and manifest hashes. |
| `ledger.json` | Seed and live events, hash-chained. |
| `expected-findings.json` | Three findings, with clause support. |
| `agent-trace.json` | About 12 s. Steps are tagged as app or agent events. |

The files in this folder are written by `../scripts/gen.py`. Edit the parent documents, not these copies.
