# Demo scenario: Meridian Trust Bank, Project Lantern (full fixture)

Meridian Trust Bank is a fictional mid-size US bank. Project Lantern: Customer Support AI Assistant is application APM-20417, Tier 1 and NPI (GLBA) scoped. It reads support tickets and account notes and drafts replies for card servicing agents. The Box folder "Project Lantern - ARB package" holds five files from the baseline onward, and every snapshot pins all five. ARB decision ARB-2026-0338 approved the package with conditions on 2026-10-07, chaired by R. Alvarez. The eight controls in profile-us-bank 2026.3 were verified on Oct 7 and 8:

- **Marcus Hale:** SEC-ARCH-01, 02, 04 and 20.
- **Dana Okafor:** SEC-ARCH-05, 17 and 22.
- **Priya Natarajan:** SEC-ARCH-07, at 2026-10-08T10:32Z.

This full fixture drives the explainer page and the primary demo. The smaller live slice in `live-slice/` is the fallback.

## The v3 upload (snapshot S4)

svc-confluence-export uploads architecture.md v3. The version comment is "Section 4 rewrite for clarity", the Confluence editor is J. Park (Eng), and the Jira ticket is LAN-2291. The AI-polished section 4 does exactly two things that matter:

- **SEC-ARCH-07 weakened.** The sentence "All customer data at rest is encrypted using AWS KMS customer-managed keys, rotated annually; key custodians are the Card Servicing Platform leads." is gone, and so is the AES-256 sentence. §4.3 ¶2 still says data is protected with "industry-standard encryption". One of five required clauses is supported, so the outcome is evidence_weakened, change classification weakened. The expected display is "Needs review: key-management evidence missing".
- **SEC-ARCH-22 binding moved.** The rollback, RTO and RPO sentence is gone from the architecture document, but the runbook already stated it verbatim. Support did not move; only the binding did. The outcome is evidence_found and moved, with a binding_changed event that needs a low-severity acknowledgment.

Everything else is harmless rewording, and TLS 1.2 is untouched. The other six controls are evidence_found and unchanged. Each gets a verification_holds event, because staleness is keyed to the evidence binding and High and Medium tiers hold when the cited quote is unchanged.

The human actions follow:

1. Keel creates Box task A for Dana Okafor.
2. Dana answers: "Encrypted is stated; the key model and rotation are not. IS-STD-014 §5.1 requires the KMS CMK statement restored." Her disposition is returned_to_author.
3. Keel creates task B for J. Park (Eng), due 2026-10-23T17:00Z, quoting the lost clauses.
4. Dana takes 30 seconds to acknowledge SEC-ARCH-22 on the runbook binding.

Every human event records the identity as returned by Box and a freshness check.

## Which file evidences which control

| File | Box versions | Controls |
| --- | --- | --- |
| `architecture-v1.md` | architecture.md v1, Oct 3 | 02 and 20 found. 07 weakened. 04, 05 and 17 absent. |
| `architecture-v2.md` | architecture.md v2, Oct 7, verified package | All eight, with one quotable sentence each (01 points to the services list). |
| `architecture-v3.md` | architecture.md v3, demo day | 02, 04, 05, 17, 20 unchanged. 07 weakened. The 22 sentence is gone. |
| `data-flow-and-classification.md` | v1 | 02: per-store labels, NPI (GLBA), PCI scope boundary, records class CS-210. |
| `runbook-v1.md`, `runbook.md` | runbook.md v1 Oct 3, v2 Oct 12 (escalation contact only) | 22: the rollback, RTO and RPO sentence verbatim, plus vault-locked backups. |
| `vendor-contract-summary.md` | v1 | 20: Corvid TPRM-2026-0412, Tier 2, current to 2027-03. Consistent with the architecture. |
| `approved-services-and-exceptions.md` | v1 | 01: every AWS service and component, with catalog status and exception EXC-2026-0117. |

## Data files

| File | Contents |
| --- | --- |
| `profile-us-bank.json` | Default profile, version 2026.3. Eight controls with id, title, requirement, standard, applicability, evidence, tier, framework_map, reviewer_role and required_clauses. A `materiality` object sets what happens when an evidencing file changes. Framework mappings are illustrative. |
| `profile-eu.json` | Alternate GDPR and DORA profile in the same shape. |
| `snapshots.json` | Four manifests: S1 baseline, S2 verified package, S3 runbook minor edit, S4 v3 upload. |
| `ledger.json` | Append-only and hash-chained, in time order. Contents are listed below. |
| `expected-findings.json` | Eight S4 findings, KEEL-2026-0401 to 0408. Details are listed below. |
| `agent-trace.json` | The S4 run, about 13 s. Each step is tagged as an app event or an agent event. |
| `fixtures/` | The cross-file vendor contradiction, kept as an optional acceptance case. |

The ledger contains:

- the S1 baseline, with one unreadable-file downgrade to not_evaluated and a successful retry;
- the S2 evaluation, the ARB decision and the eight verifications;
- the S3 evaluation where nothing changed, with one hold;
- the S4 evaluation, holds, binding change, metadata writes, both tasks and both human actions.

Every event carries the MRM model id, the normalization rule and a Box deep link. Every finding carries:

- basis bullets;
- evidence with section and page;
- clause support;
- prior evidence with the verifier;
- the expected display, which is a UI test oracle and not a stored status;
- the model, inference profile, prompt and MRM ids;
- a Box deep link and a suggested action.

The displayed status is computed by the UI from the machine assessment and the human disposition. The Box deep links and the MRM id MRM-AI-0271 are placeholders.

## Regenerating

```
python3 -I demo-data/lantern/scripts/derive.py demo-data/lantern   # only after editing architecture-v2.md or runbook.md
python3 -I demo-data/lantern/scripts/gen.py demo-data/lantern      # full fixture and live slice
```

`gen.py` checks every quote against its pinned version and recomputes the hashes. It checks the claimed search results and the hash chains. It fails if the JSON contains "satisfied", "regressed" or "confidence".
