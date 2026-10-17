# Acceptance fixture: cross-file contradiction (not in the main demo)

`vendor-contract-summary-contradiction.md` is an alternate version of `vendor-contract-summary.md`. It is kept for questions and acceptance testing, and none of its events are in the main ledger. To run it, upload it as a new version of `vendor-contract-summary.md` on top of snapshot S4.

The two statements that cannot both be true:

| File | Section | Quote |
| --- | --- | --- |
| architecture.md v2 or v3 | §7 Third-party dependencies | "Lantern uses no third-party processors outside Meridian's AWS accounts." |
| vendor-contract-summary.md (fixture) | §4 Sub-processors | "For Tier 3 escalations, Corvid may transfer Customer Data contained in escalated tickets, including attachments and account information copied into tickets, to Halcyon Support Services, Austin TX, for the purpose of reproducing and resolving the reported defect." |

Expected outcome:

| Profile | Control | Machine assessment | Change classification |
| --- | --- | --- | --- |
| profile-us-bank 2026.3 | SEC-ARCH-20 Third parties named with TPRM assessment id and inherent risk tier | evidence_contradicted | contradicted |
| profile-eu | EU-C6 Processors and sub-processors | evidence_contradicted | contradicted |

Under the US profile, Halcyon is a sub-processor with access to customer data. The design does not name it, it has no TPRM assessment id, and the architecture says no processor outside Meridian's accounts exists. Under the EU profile, the processor list in the design no longer matches the contract.

The fixture keeps the earlier EU-style wording ("DPA", "Customer Data") on purpose, because vendor paper often reads that way. `scripts/gen.py` checks that both quotes still match their files.
