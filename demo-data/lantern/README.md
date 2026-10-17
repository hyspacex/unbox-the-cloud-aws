# Demo scenario: Meridian Trust Bank, Project Lantern (full fixture, design v3.2)

Meridian Trust Bank is a fictional mid-size US bank. Project Lantern: Customer Support AI Assistant is application APM-20417, Tier 1 and NPI (GLBA) scoped. The Box folder "Project Lantern - ARB package" holds five files from the baseline onward, and every snapshot pins all five. ARB decision ARB-2026-0338 approved the package with conditions on 2026-10-07, chaired by R. Alvarez. The verifications on 2026-10-07 and 2026-10-08 bind to snapshot S2:

- **Marcus Hale:** SEC-ARCH-01, 02, 04 and 20.
- **Dana Okafor:** SEC-ARCH-05, 17 and 22.
- **Priya Natarajan:** SEC-ARCH-07, at 2026-10-08T10:32Z.

The spec is `docs/research/30-design-v3.md`. This fixture drives the explainer page and the primary demo. `live-slice/` is the fallback.

## Timeline

| Snapshot | Trigger | Outcome |
| --- | --- | --- |
| S1, Oct 3 | Baseline v1 | Attempt 1 cannot read approved-services-and-exceptions.md, so SEC-ARCH-01 is not_evaluated. Attempt 2 succeeds. 04, 05 and 17 are evidence_absent, and 07 is evidence_weakened. |
| S2, Oct 7 | architecture.md v2 | All eight evidence_found. ARB decision, then eight verifications through Box tasks. |
| S3, Oct 12 | runbook.md v2 (escalation contact only) | Nothing changes. The no-change evaluation is recorded, and all eight controls get verification_holds events. |
| S4, demo day | architecture.md v3 from svc-confluence-export | See below. |

The S4 upload carries the version comment "Section 4 rewrite for clarity", the Confluence editor J. Park (Eng), and Jira LAN-2291. It changes exactly two things that matter:

- **SEC-ARCH-07, Critical.** The customer-managed key sentence and the AES-256 sentence are gone. "industry-standard encryption" still supports the encryption clause, so one of five required clauses is supported. The outcome is evidence_weakened and weakened, displayed as "Needs review: key-management evidence missing".
- **SEC-ARCH-22, High.** The rollback, RTO and RPO sentence left the architecture document, and the runbook already had it. The outcome is evidence_found and moved, with a binding_changed event and a low-severity acknowledgment. Displayed: "Needs review: evidence binding changed".

TLS is untouched: section 4.4 is identical in v2 and v3. The other six controls are evidence_found and unchanged, and each gets a verification_holds event. The top line before the human action reads "6 Verified holds, 1 Needs review (Low), 1 Needs review (Critical)".

Human actions, following design section 3 step 10:

1. Keel creates review task A (SEC-ARCH-07) and review task C (SEC-ARCH-22), both assigned to Dana Okafor.
2. Dana rejects task A with the message "Encrypted is stated; the key model and rotation are not. IS-STD-014 §5.1 requires the KMS CMK statement restored."
3. Keel creates author task B for J. Park (Eng), due 2026-10-23T17:00Z (5 business days), quoting the lost clauses.
4. Only after task B exists does Keel record returned_to_author.
5. Dana approves task C with the attestation phrase in about 30 seconds. SEC-ARCH-22 is re-verified on runbook.md v2.

The top line after the human actions reads "6 Verified holds, 1 Verified, 1 Returned to author". Each human event records the identity as returned by Box, both the Box completion time and Keel's ingestion time, the dedup key, and a freshness check.

## Which file evidences which control

| File | Box versions | Controls |
| --- | --- | --- |
| `architecture-v1.md` | architecture.md v1, Oct 3 | 02 and 20 found. 07 weakened. 04, 05 and 17 absent. |
| `architecture-v2.md` | architecture.md v2, Oct 7 | 02, 04, 05, 07, 17, 20, 22 (01 points to the services list). |
| `architecture-v3.md` | architecture.md v3, demo day | 02, 04, 05, 17 and 20 unchanged. 07 weakened. 22's sentence is gone. |
| `data-flow-and-classification.md` | v1 | 02 (per-store labels under IS-STD-003). |
| `runbook-v1.md`, `runbook.md` | runbook.md v1, then v2 | 22 after S4: RTO, RPO and rollback in §3, Vault Lock in §4. |
| `vendor-contract-summary.md` | v1 | Corvid TPRM-2026-0412, consistent with architecture §7. |
| `approved-services-and-exceptions.md` | v1 | 01. |

## Rules implemented in `scripts/gen.py`

- **Assessment from clause support.** All required clauses supported gives evidence_found, some gives evidence_weakened, and none gives evidence_absent. An unreadable evidence location gives not_evaluated. The mock judge only says which quote supports which clause. Code derives the assessment.
- **Change classification.** It compares the prior and new evidence binding, and returns none, unchanged, moved, weakened or removed.
- **Staleness.** Staleness is keyed to the binding, with the profile's `materiality` applied by tier.
- **Projection codes.** Codes such as VERIFIED_HOLDS and NEEDS_REVIEW_WEAKENED come from the ordered display rules in design section 4.
- **Diff hints.** Prior-quote diff hints use each required clause's `hint_terms` from the profile. They are hints, not verdicts.

## Data files

| File | Contents |
| --- | --- |
| `profile-us-bank.json` | Default profile, version 2026.3. It has ten fields per control, in order: id, title, requirement, required_clauses, standard, applicability, evidence, tier, framework_map, reviewer_role. Profile-level fields are materiality, the attestation phrase, the remediation window and the assessment rule. |
| `profile-eu.json` | Alternate GDPR and DORA profile in the same shape. |
| `snapshots.json` | S1 to S4 manifests, each tagged with an era. |
| `ledger.json` | Append-only and hash-chained, in time order. It has evaluation attempts, coverage, clause support, holds, the binding change, folder-level projections with pointer checks, tasks, task responses and dispositions. |
| `expected-findings.json` | Eight S4 findings, KEEL-2026-0401 to 0408. Each has the expected display and projection code before and after the human actions. |
| `agent-trace.json` | The S4 run, about 13.4 s, with each step tagged app or agent. |
| `fixtures/` | The cross-file vendor contradiction. Expected: SEC-ARCH-20 evidence_contradicted. |

The Box deep links, `keel_record_url` and MRM-AI-0271 are placeholders. Seed verifications reference their review task ids, but the seed task-creation events are omitted.

```
python3 -I demo-data/lantern/scripts/derive.py demo-data/lantern   # only after editing architecture-v2.md or runbook.md
python3 -I demo-data/lantern/scripts/gen.py demo-data/lantern      # full fixture and live slice
```
