# 32. Persona review of Keel v3.3: Dana Okafor, round three, end to end on the fixture

Reviewer: Dana Okafor, Principal Security Architect, Architecture Review Board. Mid-size US bank, about $60B in assets, OCC-supervised.
Inputs: `30-design-v3.md` (full read), `demo-data/lantern/` (README, `profile-us-bank.json`, `expected-findings.json`, `snapshots.json`, `agent-trace.json`, all 91 events in `ledger.json`, the five documents with `architecture-v2.md` and `architecture-v3.md` side by side, `fixtures/README.md`, `live-slice/README.md`).
Date: 2026-10-17.

A casting note first. The fixture has me as "ARB reviewer, Technology Resilience" and Priya Natarajan as the Principal Security Architect. I will live with it. It turns out to expose a real finding (section 1, step 11), so leave it in.

---

## 0. Verdict in one paragraph

This is the first version where I opened the ledger and found what I would need on the first day of an exam: a no-change evaluation on October 12 with eight `verification_holds` events, a failed read on October 3 recorded as attempt one with the error code and a retry, the identity source on every human event, both the Box completion time and Keel's ingestion time, a dedup key, a freshness check, and the sentence "recorded after author task created successfully." The two rules I asked for are implemented and the fixture exercises them correctly on six of eight rows. What is wrong now is at the level of fields and sentences, not architecture. Three things must change before I put this in front of my CISO: the machine-assessment events on S4 carry `human_disposition: verified` on a control that is weakened and unreviewed, which an auditor will read as "a human verified a weakened control"; the narration says Box AI and Decider in five places while the fixture that backs the screens contains neither; and the basis bullet claims a four-term search where the trace shows one query. Fix those and I will sponsor the shadow evaluation.

---

## 1. The review transaction, thirteen steps, as the reviewer

I am sitting down Monday. Snapshot S4 landed Friday at 15:30 UTC. I have two Box tasks.

**Step 1, Intake.** The upload is `architecture.md` version 1801102233 by `svc-confluence-export`, comment "Section 4 rewrite for clarity", Confluence editor J. Park (Eng), Jira LAN-2291. Good. The uploader is a service account, so I check that the author check uses the configured author (J. Park) and not the uploader. The ledger's `checks.reviewer_is_not_author: true` says it does. Distrust: "configured author" is a string in a config file. For the pilot, the author must come from the Confluence page history or the ServiceNow demand, and the ledger should say `author_source`.

**Step 2, Snapshot.** Manifest hash on S4, five files, version ids, SHA-256s. The architecture file hash changed from `ce7586...` to `375c17...`. The other four are identical to S3. Nothing to distrust.

**Step 3, Fetch and coverage.** "Texts fetched by version: coverage 5 of 5 readable. Downloaded: architecture.md. Cached: four files." Distrust: are the four cached texts re-hashed against the manifest before use? If a cached copy is stale, every "unchanged" verdict on it is wrong. One line in the trace, "4 cached texts hash-verified against manifest," closes it.

**Step 4, Prior-quote diff.** Two hints. SEC-ARCH-07: of the four hint terms in Priya's verified sentence, only "encrypt" is still in the file. SEC-ARCH-22: "RTO", "RPO", "roll back" all gone. Labelled "hint for the evaluator, not a verdict." That is exactly right. I would click the SEC-ARCH-07 hint to see where "encrypt" still matches, because I suspect it is the new §4 preamble ("robust data protection") and the §4.3 sentence, not anything that satisfies the clause.

**Step 5, Input gate.** Not in the fixture. No `input_gate` event in the 91. No Decider step in the trace, and no "gate omitted" marker either, which the spec says must appear when Decider is not running. So the mock path, which is the demo's safety net, cannot show what the 0:40 narration describes. Section 5 covers what that does to the room.

**Step 6, Assessment.** One Sonnet 4.6 call, 11.2 seconds, 2,690 output tokens. Tool calls: `get_prior_evidence` for 07, 22, and 17; `search_snapshot("customer-managed keys")` over four files, zero matches; `search_snapshot("RTO")`, one match in `runbook.md` v2 §3. Two things I distrust.

- The tool is a string search. The spec says it is Box AI ask with citations. The trace label would have to say "Box AI ask over 4 files, 0 cited statements" and it says `search_snapshot`. Whichever ran, the screen must say which.
- The basis bullet for SEC-ARCH-07 reads "4 other files searched for customer-managed keys, CipherTrust, rotation and key custodians: 0 candidates." The trace shows one query, "customer-managed keys." Nobody searched for CipherTrust, rotation, custodians, or AES-256. The spec says basis bullets come "from recorded operations." This one does not. An examiner who reads the trace next to the card will find it, and it is the kind of overstatement that makes them distrust the rest. Either run four queries and record four, or write the bullet from what ran: "1 search for customer-managed keys across 4 files: 0 matches."

**Step 7, Validation.** "8 of 8 quotes matched." There are 23 clause-support quote slots across the eight findings, 19 of them filled. Say "19 quotes validated across 8 findings" or "8 findings, all quotes matched." "8 of 8 quotes" undercounts and an auditor will ask which eight.

**Step 8, Staleness.** Six holds, one binding moved, one weakened. Section 2 checks each.

**Step 9, Ledger.** Seventeen events for S4, chain extended. Section 6.

**Step 10, Projection.** Folder metadata with fixed codes, `keel_snapshot_id: S4`, pointer check passed, `keel_last_human_review` encoded as "Priya Natarajan|Principal Security Architect, ARB reviewer|SEC-ARCH-07|S2|2026-10-08T10:32:00Z". After my actions it becomes my SEC-ARCH-22 verification. Correct. Distrust: J. Park and every other collaborator on the folder now sees `NEEDS_REVIEW_WEAKENED` on SEC-ARCH-07. That is what I want; the author should know. It means the folder's collaboration list is a disclosure decision, and the spec's "no comments to externally shared folders" rule must also apply to metadata.

**Step 11, Human disposition.** Task A (box-task-77120931) on `architecture.md`, assigned to me, message: "KEEL-2026-0405 (snapshot S4): SEC-ARCH-07 Encryption at rest needs review. Encryption is still stated in architecture.md v3 §4.3, but the key model, rotation period, custodians and AES-256 have no support. Priya Natarajan verified the v2 sentence on 2026-10-08." That is a good task message. I know what, where, and who, in three sentences.

Here is the casting finding. The profile says SEC-ARCH-07's `reviewer_role` is "ARB reviewer, Security Architecture." The fixture assigns task A to me, "ARB reviewer, Technology Resilience." Priya, the Security Architect who verified it, gets nothing. The ledger's checks block passes with `reviewer_on_configured_list: true` and has no `reviewer_role_matches_control` check at all. For a Return to author, any ARB reviewer may act, so my disposition is defensible. For a Verify on a Critical cryptography control by a resilience reviewer, second line would reject it, and nothing in the system would have stopped me. Add the role check to the checks block, record it even if unenforced in the demo, and default the assignee to the control's reviewer role with the prior verifier first. Routing by `reviewer_role` is why the field exists.

My task A response: reject, with "Encrypted is stated; the key model and rotation are not. IS-STD-014 §5.1 requires the KMS CMK statement restored." Keel ingests it at 15:33:52, twelve seconds after my 15:33:40 completion, identity "as returned by Box (task assignment assigned_to)", dedup key `box-asgn-88120931|2026-10-17T15:33:40Z`. Then task B to J. Park, due 2026-10-23T17:00Z, with my reason quoted, both lost sentences quoted verbatim, and "Restore them or cite where the key model is now documented." Then, and only then, `returned_to_author` with `recorded_after: "author task created successfully"`. That ordering is the single most reassuring line in the ledger. Two nits: the due date rule says five business days and October 17 plus five business days is October 24 unless the day of return counts; define it. And 17:00Z is 13:00 Eastern; a bank sets due times in local business hours.

Task C on `runbook.md`: "SEC-ARCH-22 evidence binding changed (Low). The recovery sentence left architecture.md v3; the same sentence is in runbook.md v2 §3. Confirm the new binding." I approve with "Recovery targets present in runbook §3; binding updated. I attest the cited evidence meets the requirement." Thirty seconds, `attestation_present: true`, `all_clauses_supported: true`, re-verified on runbook.md v2. Correct, and I am the resilience reviewer, so the role matches this one.

Distrust on the attestation: the phrase match is literal. If I type "I attest that the cited evidence meets the requirement," the spec does not say what happens. `approved` without the phrase is undefined. Record it as an acknowledgment with reason "attestation phrase missing" and tell me, or I will think I verified something I did not.

**Step 12, Stale action.** Not exercised in the fixture. Acceptance case 8 covers it. I will believe it when I see the rejection message.

**Step 13, Display.** Before: "8 controls on snapshot S4: 6 Verified holds, 1 Needs review (Low), 1 Needs review (Critical)." After: "6 Verified holds, 1 Verified, 1 Returned to author." The row for SEC-ARCH-07 reads "Returned to author, open." Correct. The secondary line on holding rows is "Verified by [name], [role], on [file] v[version], [UTC time]" and does not show the re-check time. Add "re-checked on S4, 2026-10-17 15:30 UTC, quote unchanged." The re-check is the evidence; the original verification is history.

---

## 2. My two rules, as implemented, against the eight rows

### Staleness keyed to the binding, with per-tier materiality

The profile has `materiality: Critical: acknowledge_on_evidencing_file_change; High: hold_if_unchanged; Medium: hold_if_unchanged`. On S3 (runbook escalation contact changed, October 12), all eight held because no binding was on the runbook, including SEC-ARCH-07 at Critical, with the note "evidencing file version unchanged; another file in the package changed; tier Critical holds without acknowledgment." That is exactly the rule I asked for and exactly the case I asked it for. Eight holds events, zero clicks, recorded.

On S4, control by control, with the v2 and v3 text open:

| Control | Tier | Binding | v3 change in the evidencing section | Rule says | My judgment |
| --- | --- | --- | --- | --- | --- |
| SEC-ARCH-01 Approved services | Medium | `approved-services-and-exceptions.md` v1 | File unchanged | Verified, holds | Agree. |
| SEC-ARCH-02 Classification | High | `architecture.md` §3.2 | §3.2 byte-identical | Verified, holds | Agree. |
| SEC-ARCH-04 Authentication | Medium | `architecture.md` §4.1 | Sentence 2 reworded ("Only tokens issued... are accepted, and group claims in each token govern queue access"); meaning preserved | Verified, holds | Agree. |
| SEC-ARCH-05 Least privilege, PAM | High | `architecture.md` §4.2 | Quote identical. Last paragraph changed: "are not used for operations" became "play no part in day-to-day operations" | Verified, holds | **Disagree.** "Not used for operations" is a prohibition. "No part in day-to-day operations" leaves room for non-day-to-day use. The quote held; the section around it weakened. A High control whose evidencing section changed should ask for an acknowledgment. |
| SEC-ARCH-07 Encryption | Critical | `architecture.md` §4.3 | Both sentences gone; "industry-standard encryption, with keys managed through AWS's native key management capabilities" | Needs review: key-management evidence missing | Agree, and "AWS's native key management capabilities" is worse than silence: it reads as AWS-managed keys, which IS-STD-014 §5.1 says do not meet the requirement. The card should flag that the replacement sentence is not merely weaker but points at a non-compliant option. |
| SEC-ARCH-17 SIEM | High | `architecture.md` §6 | Quote identical; paragraph 2 reworded, meaning preserved | Verified, holds | Agree. |
| SEC-ARCH-20 Third parties | Medium | `architecture.md` §7 | §7 byte-identical | Verified, holds | Agree today. See the expiry point below. |
| SEC-ARCH-22 Recovery | High | moved to `runbook.md` v2 §3 | Architecture §4.6 lost RTO, RPO, and rollback; runbook §3 has the identical sentence and §4 has Vault Lock | Needs review: evidence binding changed, Low | Agree on Low, with a condition below. |

**Is "Verified, holds" the right label for the six?** For five of them, yes. For SEC-ARCH-05, the rule and I disagree, and the disagreement is instructive: `hold_if_unchanged` tests the quote. It should test the quote and the evidencing section. Make the materiality rule three-valued: Critical acknowledges on evidencing file change; High acknowledges on evidencing section change; Medium holds if the quote is unchanged. That costs me one more click on S4 (SEC-ARCH-05) and it would have caught the root-credentials rewording that the hold rule let through.

**Would my board accept six holding without a click when the architecture file changed?** Yes, provided three things appear on the row: the re-check time, the words "quote unchanged," and the materiality rule that applied. The board's objection is never "the machine held it." It is "I cannot see that it was re-checked." The `verification_holds` event has all three. Put them on the row.

**Is SEC-ARCH-22 at Low right?** Yes, because `runbook.md §2 to §4` is a listed evidence location for the control and the runbook is in the ARB package. The condition: a `moved` to a file that is not in the control's `evidence` list should be Medium, and the task should ask me to confirm that the new file is authoritative. In this fixture the architecture document, which the board approved, dropped its recovery targets and now says "designed for resilience in line with its Tier 1 classification." I accept the move at Low because the runbook is the right home for RTO and RPO and I am the runbook's reviewer. If it had moved to a meeting note, Low would be wrong.

**The row the rules miss entirely: evidence with a date in it.** SEC-ARCH-20 clause 20.4, "assessment current," is supported by the string "assessment current to 2027-03" and "assessment current to 2026-12." On 2027-01-01 the AWS assessment is expired, the string is unchanged, the quote matches, and the rule says Verified, holds. The hold rule cannot see a calendar. Date-bearing clauses need a `valid_until` on the clause support and a display rule "Evidence expired, re-review due" that fires on the clock, the same way the spec already handles `exception_approved`. I raised this in round one as evidence expiry; here is the fixture row that proves it.

### The sixteen ordered display rules

Checked against the eight rows before and after: rule 10 produces the six holds, rule 13 produces the hero, rule 12 produces SEC-ARCH-22, rule 8 produces "Returned to author, open" after task A, rule 9 produces "Verified" after task C. The precedence inside the machine field (`not_evaluated` over `contradicted` over `absent` over `weakened` over `found`) is applied by code. No row produced a result I would argue with.

Two first-week hits:

- Rule 11, "Acknowledge: evidencing file changed," is reachable only for Critical. After my change above it becomes reachable for High on section change, and the acknowledgment needs a task of its own with a one-line message, not a full review task.
- Rule 8 says "Returned to author on the current binding." When J. Park uploads v4 with the sentence restored, the machine says `evidence_found`, the disposition is still `returned_to_author`, and the rule still fires "Returned to author, open." That is correct and it is what I want: the author fixing it does not close it, I do. But the row should say "Returned to author, open: evidence now found in v4, re-review due" so I know to look. The reducer has the inputs to say it.

---

## 3. Box AI as the search tool and the drafter

**Does my bank let Box AI read Confidential design documents today?** Not by default. Box AI is enabled in our tenant for content classified Internal. Confidential requires a decision from the Enterprise Data Office, which we have taken for specific folders after Box confirmed in writing which model provider processes the content, where, and that it is not retained or used for training. Those decisions took about six weeks each. The practical consequence for Keel: adding Box AI adds a **second processing destination** for the same Confidential document. The data-classification gate in section 10 now has to cover Bedrock in our account and Box AI's provider under Box's terms. It is one gate on paper and two conversations in practice. The spec should say that, in section 8 under data handling, instead of listing Box AI only as a feature.

**Does a Box AI citation count as evidence for me?** No. The validated quote counts. Box AI is a finder; the pinned text is the witness. The spec gets this right: "Code validates every citation against the pinned version text before the agent may rely on it; uncited or unvalidated answers count as no evidence." I accept that. Two conditions.

- Box AI reads current versions. The spec says so and says the integration gate confirms they match the snapshot. On a laptop, yes. In a pilot, a version can land while Box AI's index still holds the previous one. Citation validation catches a text mismatch; it does not catch Box AI saying "nothing found" because it has not seen the new text yet. A false "0 candidates" becomes a false `evidence_weakened` or `evidence_absent`. Record the file version Box AI reports in the event, and if it cannot report one, the string search over pinned text is the authority and Box AI is advisory.
- Negative results are the weak case. "Box AI searched four files: nothing" is the hero's basis. When both Box AI and the string search run, record both. When only one runs, the trace label must say which. In this fixture only the string search ran, and the card says four terms were searched when one was. See step 6.

**Would I send an AI-drafted message to J. Park under my name?** Under three conditions, and the fixture meets the first two by not using AI at all. The task B message in the ledger is templated: my reason in quotes, the two lost sentences verbatim, the requirement reference, and one instruction. I prefer that to a draft. It is deterministic and it quotes exactly. If Box AI drafts the free-text explanation, then: I see it before it sends, I can edit it, the ledger stores the draft and the sent text and whether I edited, with `drafted_by: box_ai` and the model behind it. And the Box task is created by the Keel service account, so the message must say "via Keel" next to my name. "Returned by Dana Okafor (ARB reviewer)" is fine as long as J. Park can see it came through a tool and not from my mailbox. A fourth point for the pilot: the lost AES-256 sentence names four KMS key aliases. Key alias names are not secrets but they are Confidential-class infrastructure detail, and the task is visible to every collaborator on the file. The audience is the same as the document's, so it is acceptable; say that out loud in the disclosure rule.

---

## 4. Strands Decider 2B as the input gate

**Does it reassure me or add a model?** Both, and the second matters more than the first.

A 1.9-billion-parameter model that answers two bounded questions with probabilities, runs locally, generates no text, and never writes a status is about as governable as a model gets. It is still a model that informs a decision: whether a document is quarantined and whether an upload is evaluated now or batched. Model Risk Management will inventory it. It will likely land in the lowest tier, with an annual review rather than a validation, but it will be inventoried, and it needs an owner, a version, and a record of what it decided. The spec says "recorded as `input_gate` events, never a status." Good. The fixture has no such events, so I cannot check the record.

The question that worries me is not injection. It is "material, trivial, or noise." If Decider says "noise" and Keel does not evaluate, then a model has decided that the design-review control does not operate on that version. That is a status-affecting decision whatever the field is called. The rule must be: Decider's materiality answer may set queue priority and may batch the trace, but every submitted version is evaluated. "Trivial" means later, never never. Write that into step 5.

The injection question is fine as a quarantine. A false positive quarantines a legitimate document, dependent controls go `not_evaluated` with reason `input_gate`, I get a task. That is a visible failure and I can live with visible failures. A false negative lets injected text through to Sonnet, and the blast radius is a false `evidence_found` that a human must still verify against a quote she can read. I made that argument in round two and I still make it; the human field is the real control.

One inconsistency: the spec says Decider gates text "before any document text reaches Bedrock." Box AI also reads the documents, for the cross-file search, and nothing gates that path. Either gate both or say that the Box AI path is gated by Box's own controls and name them.

**What I would need recorded, per `input_gate` event:** Decider model name, version, and weights hash; the two questions verbatim; the returned choice and probabilities for each; the threshold applied and who set it; the file id, version id, and content hash; whether the gate ran, was omitted, or errored; latency; and the downstream effect (quarantined, evaluated now, batched). And at the profile level: a monthly review of quarantines and a sample of non-quarantined files, so MRM has a false-positive and false-negative rate to look at. Without that last item it is a model nobody monitors, and we have been written up for one of those.

---

## 5. The finding card and the three-minute demo, with the fixture filled in

### The card

With the fixture's strings in place, the SEC-ARCH-07 card reads: requirement text from IS-STD-014 §5.1; five clause marks with 07.1 supported by "All customer data is protected with industry-standard encryption, with keys managed through AWS's native key management capabilities" and 07.2 through 07.5 unsupported; the left column with Priya's sentence highlighted, "Priya Natarajan, Principal Security Architect, ARB reviewer, 2026-10-08T10:32:00Z, S2"; the right column with the word diff; model `anthropic.claude-sonnet-4-6`, profile `us.`, prompt v3 `sha256:46fbc0f743a8a3ae`, MRM-AI-0271, normalization "whitespace, quotes, hyphens, case." That is my round-one mockup with real data in it, and it is enough to act on in under a minute.

Three things I would still change on the card:

- The basis bullet overstating the search (step 6).
- The AES-256 sentence from v2 belongs in the left column too, not only in the task B message. Clause 07.2 was supported by it; the card shows only the first sentence highlighted.
- The suggested action says "Return to author: restore the AWS KMS customer-managed key, annual rotation, custodian and AES-256 statements." Good. Add "or document the compensating control" so the author knows the second path exists.

The SEC-ARCH-22 card is right: both runbook quotes, §3 and §4, with versions, and the previous binding shown struck.

### The demo, beat by beat, as my colleagues hear it

| Beat | Lands or overreaches | Note |
| --- | --- | --- |
| 0:00 | Lands. | "Synthetic bank example" buys you the room's patience. |
| 0:15 | Lands. | Snapshot S2 and ARB-2026-0338 on screen. One problem in the fixture: the ARB decision event is 2026-10-07T15:00Z and every verification is after it, from 15:40 on October 7 to 10:32 on October 8. The board approved before any control was verified. An examiner would ask what the board approved. Move the verifications before the decision in the seed, or the sentence "each verified by a named reviewer" at 0:15 is not true in the ledger you export at 2:15. |
| 0:40 | **Overreaches.** | "Decider clears the text as safe and material" and "asking Box AI whether the other four files say anything." Neither is in the fixture. If the live run falls to mock, the trace on screen shows `search_snapshot("customer-managed keys")`, a string search, and no Decider step. The narration and the screen will disagree, and a bank audience catches exactly that. Also "clears the text as safe" is a claim a bank person hears as "an AI said the document is safe." Say "Decider finds nothing addressed to the agent." |
| 1:05 | Lands. | "Six verifications hold: the evidence is unchanged, so nobody clicks anything." This is my rule and it is the sentence that makes a reviewer want the tool. |
| 1:15 | Half. | The quotes and clause marks land. "Box AI searched the other four files with citations: nothing" overreaches twice: Box AI did not run in the fixture, and "nothing" is the word the other panel and I both flagged. Say "no cited statement about key management in the other four files." |
| 1:35 | Lands. | "A thirty-second acknowledgment, severity Low, not an investigation." The fixture has `acknowledgment_duration_s: 30`. Good. |
| 1:45 | Lands. | My narration, the task A message, the rejection, task B for J. Park with the due date, `recorded_after`. Show the author's task for three seconds as planned. One request: let the screen show `checks` from EVT-0088, the four checks and the freshness check, for the two seconds after I say "under my name and role." That is the proof behind the sentence. |
| 2:15 | Lands. | "Including the six where nothing changed." Add "and the eight from October 12, when only a phone number changed." The S3 holds are the better proof of operation. "Complete audit coverage needs reconciliation, which is pilot work" is the honest line and it stays. |
| 2:30 | **Overreaches.** | "Box AI is how the agent reads the package" is not what the fixture shows. The agent reads texts fetched by version id from Box; Box AI, if it runs, is one tool for cross-file search. Three mentions of Box AI and two of Decider in three minutes reads as product placement to the engineers and as two more models to inventory to me. |
| 2:45 | Lands. | "Fifty historical packages, measuring misses, false alerts, and review time." That is the sentence I would take to my CISO. |
| 2:50 | Lands. | "Know what changed, and who reviewed that exact evidence." |

**The one sentence I would cut:** "Box AI is how the agent reads the package" at 2:30. It is the one sentence in the script that the fixture contradicts outright. The 0:40 and 1:15 mentions can be made true by wiring Box AI or by softening the words; this one is wrong as a description of the architecture even when Box AI runs.

---

## 6. The ledger and the export

I read all 91 events. Here is what is there and what is not.

**What my SOC 2 auditor would accept, with the stated limitation.** The population block: 8 file versions observed, 4 snapshots, 5 evaluation attempts, 4 completed, 32 control evaluations, 1 error, 14 holds, 1 binding change, 6 projections, 3 tasks, 2 responses, 10 dispositions. The scope line: "All observed revisions and outcomes, including evaluations that changed nothing and evaluations that failed." The chain: SHA-256 over previous hash plus canonical JSON, genesis and head stated. Every timestamp in UTC. The S1 error event with `TEXT_REPRESENTATION_NOT_READY`, attempt 1, coverage 4 of 5, "Retry scheduled as attempt 2," and the S1 completion with `attempts: 2`. The S3 no-change evaluation with eight holds events and their materiality notes. Every human event with identity source, `completed_at` and `ingested_at`, dedup key, checks, freshness check, the task channel, and the comment. The "seed: review task creation events elided" note on Priya's verification, which is honest about a gap in the seed. With the export screen's stated limitation (no reconciliation against Box's version list, no independent integrity protection), this is a population an auditor would sample from for a shadow evaluation and would not accept as the control's full population for a period. That is the right place to be at this stage, and the spec says so.

**What is missing that I would need on day one.**

1. **`human_disposition: verified` on machine events.** EVT-0067 through EVT-0074, the S4 `control_evaluated` events, all carry `human_disposition: "verified"`. EVT-0071 is SEC-ARCH-07: `machine_assessment: evidence_weakened`, `change_classification: weakened`, `human_disposition: verified`, snapshot S4. An auditor reading that event alone reads "the machine found it weakened and a human had verified it on this snapshot." Neither half of that is true: the verification was Priya's on S2, and the current disposition on S4 is `unreviewed`. The spec, step 13, says the prior verification "is never installed as the current disposition." At the event level the fixture installs it. Rename the field on machine events to `prior_disposition` and add `current_disposition: unreviewed`, or carry `prior_verification` as a block the way the holds events already do. This is the one change I would not let the build ship without.
2. **The trace is not in the ledger.** The tool calls (`get_prior_evidence`, `search_snapshot`) and their results live in `agent-trace.json` under `run-20261017-153004-lantern`. No ledger event carries that run id. The basis bullets are supposed to come from recorded operations; the operations are recorded in a file the chain does not cover. Add `run_id` to `evaluation_attempt` and `evaluation_completed`, and either chain the trace or hash it into the completion event.
3. **No `reviewer_role_matches_control` in checks, and no `role_source`.** The identity has a source line. The role does not. Add both.
4. **Control profile version is not on every event.** It is on the snapshot. When profile 2026.4 ships and some events are under 2026.3, I want to filter the ledger by it without joining to snapshots.
5. **No `input_gate` events and no gate-omitted marker.** If Decider is in the design, the fixture needs the event shape so the mock path can show "gate omitted" honestly.
6. **No validity window on date-bearing clause support.** SEC-ARCH-20.4 (section 2).
7. **ARB conditions are recorded and not tracked.** EVT-0033 carries two conditions with due dates of October 20 and 23. Nothing in the ledger will fire when they pass. Deferred is fine. Say it in section 10.
8. **Sequence.** The ARB decision precedes the verifications (section 5, 0:15).

---

## 7. Readiness, in order

**Product work as listed:** Jira routing; not applicable with second reviewer; compensating control; exception record and IRM mirror; batch mode for shadow evaluation; completeness reconciliation; production ledger and integrity; webhook and AgentCore; diagram reading.

**My order, and why:**

1. **Batch mode for the shadow evaluation.** It is the thing that converts "I am interested" into a decision. Nothing else on the list matters until fifty packages have been run.
2. **Not applicable with second-reviewer approval.** Without it, the shadow evaluation will report a pile of false `evidence_absent` on controls that do not apply to a given package, and the false-alert number will be wrong in a way that discredits the whole exercise.
3. **Completeness reconciliation against Box's version list.** Second line's first question after the shadow run.
4. **Trace retention and chaining, and the ledger field fixes from section 6.** Small, and they decide whether the ledger is evidence or a log.
5. **Evidence validity windows on date-bearing clauses.** Not on the list. Should be.
6. **Reviewer-role routing and the role check.** Not on the list. The field exists; use it.
7. **Jira routing.** Useful, not blocking.
8. **Exception record and IRM mirror.** Needed for a pilot, not for a shadow.
9. **Compensating control.** Same.
10. **Production ledger and integrity.** Pilot.
11. **Webhook and AgentCore.** Pilot.
12. **Diagram reading.** Later.

**Bank-owned gates as listed:** data-classification decision; MRM intake and model id; ARB role validity and project membership from the directory; source-permission enforcement; TPRM review of the vendor; metadata template governance.

**Order is right. Three things are left off.**

- The data-classification decision now covers **two destinations**: Bedrock in our account and Box AI's provider under Box's terms. Name both. The second needs the Box admin to enable Box AI on Confidential content, which is its own request.
- MRM intake now covers **two models**: Sonnet 4.6 and Decider 2B, plus a note on the model behind Box AI, which MRM will treat as a vendor-operated model under TPRM rather than inventory directly. Say "two models" or MRM will find the second one themselves and ask why we did not mention it.
- **Disclosure review for Box tasks and metadata on Confidential files.** Tasks and metadata are visible to all collaborators on the file and folder. The folder's collaboration list becomes a control. This is a bank-owned decision, not product work.

Does the honesty land? Yes. "The inference profile is a routing choice, not a residency guarantee" is the most precise sentence about Bedrock I have read in a vendor document. Keep it.

---

## 8. Would I sponsor the shadow evaluation, and what remains

**Yes.** After this version I would take the following to my CISO: "Run Keel in batch over the last fifty ARB packages in Box, read-only, no tasks, no metadata writes. Compare its findings to what my reviewers recorded. Report misses, false alerts, and the minutes a reviewer spends per finding. Data-classification decision required for Confidential packages; MRM intake as models under evaluation." The ledger as it stands is good enough to be the output of that run, once the field in item 1 below is fixed.

**The single remaining change for the build on Saturday:** on every machine-assessment event, replace `human_disposition` with `current_disposition` (which on S4 is `unreviewed` for every control) and carry the prior verification as a `prior_verification` block, the way the holds events already do. It is a field rename and one added block. It is also the difference between a ledger an examiner reads correctly on the first pass and one they read wrong and then distrust. Everything else in this review can wait a week. That cannot ship.

**The single sentence I would want the presenter to say that is not in the script**, at 1:45, after "under my name and role":

> "What you see on this card is what the ledger says the reviewer saw when she decided."

EVT-0088 carries the clause support, the quote, the checks, and the freshness check at click time. The sentence is true, and it is the one that answers my round-one question about liability: if the machine was wrong, the record shows what I was shown.

---

## 9. For v3.4, in the order I would check

1. `current_disposition` and `prior_verification` on machine events (section 6, item 1).
2. Narration and fixture agree on Box AI and Decider: wire them with event shapes and omission markers, or take the words out. Cut "Box AI is how the agent reads the package."
3. Basis bullets written from recorded operations: one search means one search.
4. Materiality: High acknowledges on evidencing-section change. SEC-ARCH-05 becomes the fixture case.
5. Validity window on date-bearing clause support; "Evidence expired, re-review due."
6. `reviewer_role_matches_control` in checks; assignee defaults to the control's reviewer role with the prior verifier first.
7. `approved` without the attestation phrase: defined, recorded, and the reviewer told.
8. `run_id` on evaluation events; trace chained or hashed into the completion event.
9. Seed sequence: verifications before the ARB decision.
10. `moved` to a file outside the control's evidence list is Medium, not Low.
11. Decider's materiality answer prioritizes and never skips; Decider or an equivalent gate on the Box AI path, or a stated reason there is none.
12. Section 10: two destinations, two models, and the disclosure review for tasks and metadata.

Dana Okafor
