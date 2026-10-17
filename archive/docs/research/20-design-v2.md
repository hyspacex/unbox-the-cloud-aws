# Design spec v2: Keel

**Know which design evidence changed, and who reviewed that exact version.**

Keel adds version-bound control-evidence history and re-review rules to a Box review workflow. An agent on Bedrock assesses every control in a project's control profile against a pinned snapshot of the project folder, records every evaluation in an append-only ledger, and hands every decision to a named human. The machine never says "satisfied" and never turns anything green.

Status: v2, revised after the Codex adversarial panel (`11-review-codex-v1.md`) and the enterprise-user review by "Dana Okafor", principal security architect (`12-review-persona-v1.md`). Changelog at the end.

---

## 1. The problem, stated carefully

A bank's architecture review board approves a design package on Tuesday. Eight controls, each supported by a sentence in a document, each verified by a named reviewer. On Thursday a new version of the architecture document lands in the package folder: an AI-polished rewrite of section 4. The sentence that supported "encryption at rest with customer-managed keys" is gone. The approval record still reads clean. Existing tools can tell you the page changed; a content hash does that. None of them tell you which control lost its evidence, whether the evidence moved to another document, or who reviewed that exact version. Six months later an auditor asks for the complete list of design changes in the period and the evidence behind each control, and a team spends three weeks rebuilding it from Confluence history and email.

## 2. Who it is for, honestly

| Role | Daily reality | What Keel gives them |
| --- | --- | --- |
| Security architect on the ARB (daily user) | 6 to 10 design reviews a week, packages arrive as a Box folder of exported documents | A review queue of findings with the exact quote that changed, side by side, so they re-review one paragraph |
| Head of technology risk (second line, gatekeeper not buyer) | Owns the control framework and the exception process in ServiceNow IRM | A ledger that proves the design-review control operated on every version, including the ones where nothing broke |
| Internal audit and examiners (consumers) | Sample about 25 items from a dated population; ask for the full list of changes | Export of every observed revision and outcome, pinned to Box version ids, with a tamper-evident manifest |
| Project team (authors) | Get findings back weeks later with no pointer to the paragraph | Return-to-author with the quote, the section, and a Jira link |

The buyer is the CISO as sponsor with the ARB as the owning team. Second line approves the pilot; it does not buy first-line tools. Pilot approval at a bank runs ten to fourteen weeks and is gated by Model Risk Management intake and a data-classification decision on sending Confidential documents to a model endpoint. None of that is a hackathon claim.

## 3. What Keel does

1. **Captures a snapshot.** When a package is submitted or a new version is uploaded to the ARB package folder, Keel records a manifest: every file id, version id, content hash, plus the control profile version. Every evaluation, finding, and human action is bound to a snapshot id. A decision on a stale snapshot is rejected by the server.
2. **Evaluates the whole profile against the whole snapshot.** No selective routing at demo scale. The agent is handed each control's Requirement, Applicability, and Evidence fields, the full text of every readable file in the snapshot, and the prior evidence set with its verification history. Unreadable files make the affected controls Not evaluated, never silently skipped.
3. **Diffs prior evidence deterministically.** Code checks whether each previously cited quote still appears in its file after normalization. A vanished quote is a reason for re-review and a hint to the judge, not the definition of a regression. A retained quote with a new contradicting exception, and a faithful paraphrase that removes the literal quote, must both be handled correctly.
4. **Returns typed findings.** Per control: machine assessment, change classification, basis bullets, evidence quotes with file, version, section, and page, and a suggested action. Code validates every quote against the pinned version text. A finding whose required evidence fails validation becomes Not evaluated, not a quote-less positive. The model cannot supply status history; prior status is read from the ledger.
5. **Writes the ledger.** Every evaluation is recorded, including evaluations that change nothing and evaluations that fail. Every event carries snapshot id, control id, machine assessment, prior assessment, evidence, model id, inference profile, prompt version and hash, observation time, and the Box projection outcome. Append-only; corrections are new events.
6. **Projects into Box.** Two separate metadata fields on the folder and on each file: machine assessment (written by Keel) and human disposition (written only through the human action path). Downstream consumers filter on the human field. A Box task assigned to the reviewer carries the finding id and snapshot id.
7. **Hands judgment to a human.** The reviewer's actions are role-gated and server-enforced: Return to author, Verify (enabled only when a validated quote exists in a current file), Evidence moved (requires quote, file, version), Not applicable (requires justification, routes to a second reviewer), Compensating control (requires reference and evidence), Request exception (opens an exception record with risk owner, approver, compensating control, expiry; status becomes Exception requested, never Accepted), Mark false positive. The uploader of the evidencing file cannot verify it.
8. **Renders history.** A findings view with expandable ledger events, and an export of all observed revisions and outcomes with population counts and a manifest hash.

## 4. Status model: two fields, one published function

### Machine assessment (recomputed every snapshot, always labelled machine, never green)
`evidence_found` · `evidence_weakened` · `evidence_absent` · `evidence_contradicted` · `not_evaluated`

With a change classification when prior evidence existed: `unchanged` · `removed` · `moved` · `weakened` · `contradicted`.

### Human disposition (a person, with role and timestamp, bound to a snapshot)
`unreviewed` · `verified` · `returned_to_author` · `not_applicable` · `compensating_control` · `exception_requested` · `exception_approved` · `superseded`

### Displayed status, a function of both (published, not configurable)

| Machine assessment | Human disposition | Displayed |
| --- | --- | --- |
| evidence_found | unreviewed | **Pending review** |
| evidence_found | verified (this snapshot) | **Verified** |
| evidence_found, moved | verified (earlier snapshot) | **Verified, stale: evidence moved, re-review due** |
| evidence_weakened | verified (earlier snapshot) | **Weakened since verification, re-review due** |
| evidence_absent | verified (earlier snapshot) | **Evidence lost since verification** |
| evidence_absent | returned_to_author | **Returned to author, open** |
| evidence_absent or weakened | exception_requested | **Exception requested** |
| any | not_applicable (approved) | **Not applicable** |
| not_evaluated | any | **Not evaluated** (reason shown) |
| any, newer snapshot pending | verified | **Verified, re-check pending** |

Top-line counts are human counts: "8 controls, 6 Verified, 1 Returned to author, 1 Pending review." Machine assessments get their own line.

### Rules enforced in code, not in the prompt
- No code path writes `verified` except the human action handler, which checks role, snapshot freshness, and uploader-not-reviewer.
- A finding with failed quote validation cannot carry a positive assessment.
- An evaluation on a snapshot older than the current one cannot change displayed status.
- Ledger events are append-only; the export includes a hash over the event population.

## 5. The control profile

Bring-your-own, versioned, eight fields per control: ID, Title, Requirement, Standard, Applicability, Evidence, Tier, Framework map, Reviewer role. The AI is handed Requirement, Applicability, and Evidence, not the title alone. Severity is control tier times application tier.

Demo profile: a US bank profile (`profile-us-bank.json`, version 2026.3) with eight controls: approved services only, data classification and regulatory scope, authentication and MFA via enterprise IdP, least privilege with PAM, encryption at rest and key management (the hero, SEC-ARCH-07), encryption in transit with TLS minimum, security events to the enterprise SIEM, RTO/RPO consistent with the BIA tier (the counterexample, SEC-ARCH-22). An EU profile with GDPR and DORA controls ships as the alternate to show the engine is control-agnostic. Framework mappings are labelled illustrative until reviewed by a compliance owner.

Explicitly out of the demo profile because they generate noise from documents: network diagram currency (images), contract matching (contracts live in the legal system, not the package), bare retention numbers (banks cite a Records Retention Schedule class).

## 6. The experience

### Folder view
Project header: name, application id, tier, regulatory scope, ARB decision reference. Eight control rows, each with displayed status, machine assessment labelled as machine, evidencing file and version, human disposition with name, role, and timestamp. Review queue count. Snapshot id and capture time in the corner. If a newer snapshot is being evaluated, every verified row shows "re-check pending."

### Finding card (the hero, adapted from Dana's mockup)
Header: finding id, severity, project, application id, tier, ARB decision, review owner, opened, due.
Control block: id, title, full Requirement text, Standard reference, framework map, profile version.
Machine assessment block, labelled "machine assessment, not a verdict": result, change classification, basis bullets (quote not found after normalization; four other files searched, zero candidates; weaker statement found at section and paragraph; other assertions changed in the section), model id, inference profile (`us.`), prompt version and hash, trace link.
Two columns: prior version with Box version id, uploader, verified-by name, role, timestamp, hash, section and page, the quote highlighted. New version with Box version id, uploader, version comment, Jira reference, hash, section and page, word-level diff showing the struck sentence and the replacement text.
Related: the other controls re-checked in this snapshot with their outcomes, including the counterexample that remained supported from another file.
Human disposition: the seven role-gated actions, with the reason each is enabled or disabled. Reviewer identity and role shown. "Every action writes an append-only event with this card's state at click time."
Thread: ledger events and author responses.

Removed from v1: the confidence decimal, evaluation duration, "Proposed Satisfied", "Accept risk".

### Ledger and export
A compact event list per control with expandable records. Export produces a CSV of all observed revisions and outcomes, a manifest JSON with snapshot ids and a hash over the population, and population counts: revisions observed, evaluations run, evaluations failed, findings opened, human actions. Observation gaps are disclosed, not hidden.

### Live trace
When a snapshot is evaluated, a panel streams real events with real timestamps: snapshot captured with file and version ids, texts fetched, prior quotes diffed, controls evaluated, quotes validated, findings applied, Box metadata written, Box task created. The panel is labelled Live, Replay, or Mock at all times. A replay shows the run id of the original.

### In Box
Folder and file metadata show the two fields. The reviewer gets a Box task with the finding id and snapshot id. Keel posts no comments to folders shared outside the review audience; the task is the notification. Reviewers work from Box or from Keel's finding card.

## 7. The three-minute demo

Synthetic data, stated up front. One speaker per beat.

| Time | Narration | On screen |
| --- | --- | --- |
| 0:00 | "Approved design evidence changes after review. Keel shows which controls need another look, and who reviewed which version. This is a synthetic bank example." | Title |
| 0:15 | "Project Lantern passed the review board on October 7. Eight controls, each verified by a named reviewer against these document versions." | Folder view, verified baseline, snapshot id |
| 0:40 | "Today a new architecture doc arrives: an AI-polished rewrite of section 4." Upload. "Keel pins the snapshot, diffs the prior quotes, and evaluates all eight controls against all five files." | Live trace, real events, elapsed time visible |
| 1:10 | "Encryption at rest lost its evidence. Here is the sentence Priya verified on October 14, in version 2. Here is version 3: struck, replaced with 'all data is encrypted'. No key model. The agent searched the other four files. Nothing." | Finding card, two columns, word diff |
| 1:30 | "The same upload also removed the rollback sentence. But the runbook still states it. One evidence gap, not two. A text diff would have flagged both." | Related block: SEC-ARCH-22 evidence found, moved, re-review due |
| 1:45 | "Dana is the ARB reviewer. She returns the finding to the author with the quote and a due date. That is recorded against this exact snapshot. The control stays open. The machine never turned it green, and Dana cannot verify what no document supports." | Box task completed in a pre-opened tab; Verify shown disabled with its reason; ledger event with name, role, snapshot id |
| 2:10 | "Every evaluation is recorded, including the ones where nothing changed. This export is the list the auditor asks for." | Ledger, export with population counts and manifest hash |
| 2:30 | "Box holds the content, the metadata, and the review task. Bedrock does the assessment. Code owns the state and the rules. A person owns every disposition." | One architecture strip, built versus proposed labelled |
| 2:45 | "Next: a shadow evaluation against manual review, measuring missed changes, false alerts, and review time." | One line |
| 2:50 | "Files have versions. Compliance evidence should too." | Title |

Not in the demo: the cross-file vendor contradiction (kept as a prepared acceptance case for questions), the EU profile (one sentence if asked), any AWS service not actually running.

## 8. Architecture

### Built on Saturday
- Next.js app in mock mode by default. Real mode on the integration laptop. Live, Replay, Mock label always visible.
- Snapshot capture: Box folder items, file versions, content download by version, SHA-256, manifest. Local baseline captured before the demo upload in case the tenant keeps one version.
- One Strands TypeScript agent on BedrockModel, `us.anthropic.claude-sonnet-4-6`, Zod-validated findings, tools: get_file_text(file, version), get_prior_evidence(control), search_snapshot(query). Model id in an env var; Sonnet 5.5 only after a rehearsal because it rejects forced tool choice.
- Deterministic layer: prior-quote diff, quote validation against pinned text, status function, append-only JSON ledger with event hash chain, server-side action authorization.
- Box writes: two metadata fields on folder and files, one Box task to the reviewer per finding; task response polled and the responding identity recorded.
- Findings view, finding card, ledger with export. Live trace from Strands stream events.

### Proposed, on the slide, labelled as such
Box webhook to a Lambda URL with signature verification, EventBridge, SQS FIFO per folder, the same agent on AgentCore Runtime with Observability to CloudWatch. AgentCore Identity for Box OAuth. Verified enforcement stays in the application authorization layer; AgentCore Gateway policy only for calls routed through it. DynamoDB ledger with Streams to S3 Object Lock. ServiceNow IRM: findings attach to control instances as evidence, exceptions are IRM records, Keel mirrors their status. Box Automate calls Keel via an HTTPS outcome as its judgment step, marked untested.

### What Box does and what AWS does
Box: content and versions, metadata on folder and files, tasks as the human surface, the review audience's existing workspace. AWS: Bedrock model with schema-validated output through Strands, the agent loop and tools, the proposed production hosting and ledger. One extraction and judgment path, on Bedrock. Box AI extract and ask are not in the build; they are named as an alternative judgment path for tenants that prefer it.

### Data handling, stated plainly
Demo documents are synthetic. Document text leaves Box for the laptop and the Bedrock request in us-east-1 under a `us.` inference profile, and is stored in the local ledger. No "stays in the tenant" claim. A pilot requires a data-classification decision for Confidential documents, Model Risk Management intake with model id and prompt version, and defined retention for every copy.

## 9. Positioning, without overclaiming

- **Box Automate** fires on upload, runs AI steps, routes approvals, loops over files, and keeps run history. Keel does not rebuild any of it. We did not find a documented native version-bound control-evidence ledger with re-review rules. Keel adds that to a Box workflow, and in production Automate is the trigger that calls it.
- **Vanta, Drata, and the like** test infrastructure through APIs and accept documents as uploads. Keel reads the design evidence itself across versions. Design plus operation.
- **AI design-review tools** assess a document. Keel keeps the version-pinned evidence history for every control across the package and hands the disposition to a named reviewer.
- **"Changed since approval" plugins** flag every edit by hash. Keel names which control lost support, whether it moved, weakened, or vanished, and whether anything else in the package still supports it.
- **For AWS judges:** the model never owns state. It proposes an assessment with quotes against a pinned snapshot; deterministic code validates, records, and enforces that only a person can set a disposition.

## 10. Enterprise readiness: what is designed in, what is deferred

Designed in: two-field status with a published display function; no machine "satisfied" anywhere; snapshot-bound actions with stale rejection; separation of duties; Box identity through the task response; append-only ledger with every evaluation including no-change and errors; quote validation; Not evaluated as a first-class result; model id, inference profile, prompt version on every event; bring-your-own eight-field control profile; export with population counts and manifest hash; no comments to externally shared folders.

Deferred and said out loud: production ledger and integrity controls, webhook trigger, AgentCore hosting, ServiceNow IRM integration, Jira creation, completeness reconciliation against Box's version list, image and diagram reading, measured accuracy on a held-out set, MRM validation, data-classification approval.

## 11. Measured and claimed

From the research probe: one synthetic regression case, a 7-page document with 12 controls, caught by all four Claude models tested, in 10 to 17 seconds of model time, at $0.002 to $0.07 per evaluation. We quote this as "in a single synthetic test," and we measure the full upload-to-display path separately during rehearsal. Nothing else is claimed as measured.

## 12. Saturday build plan and stopping rules

| Elapsed | Deliverable | Stopping rule |
| --- | --- | --- |
| 0:00 to 0:30 | Integration gate on the real tenant: list folder, read versions, download by version, call Sonnet 4.6, write and read folder metadata, create and respond to a Box task. Confirm whether prior versions are retained. | Any capability missing: remove its claim now, capture local baseline. |
| 0:30 to 2:00 | Three lanes against agreed shapes (manifest, finding, event): Box plumbing; agent plus validation; findings UI plus fixtures. | Shapes frozen before parallel work. |
| 2:00 to 3:00 | One real path: upload, snapshot, evaluate, findings, metadata, task, response, ledger. Pending and error states. Stale snapshot rejected. | No features until this passes. |
| 3:00 to 4:00 | Acceptance cases below. Measure full-path time. Add export. | |
| 4:00 to 5:00 | Freeze. Rehearse three times. Labelled recording of the real path. | |
| 5:00 to 6:00 | Presentation laptop rehearsal, README, submit by 1pm. | No new infrastructure. |

### Acceptance cases (synthetic contract checks, not accuracy claims)
1. Sole supporting statement removed: evidence_absent, removed; prior quote and version shown; Verify disabled.
2. Statement removed from one file but present in another: evidence_found, moved; no loss alarm; binding change shown as re-review due.
3. Statement retained but a contradicting exception added: evidence_contradicted despite the string match.
4. Statement weakened (TLS version dropped): evidence_weakened, not absent.
5. Faithful paraphrase: evidence_found, unchanged or moved, no false alarm.
6. Unreadable file or fabricated quote: not_evaluated; no positive finding applied.
7. New version lands before the reviewer acts: the stale action is rejected.
8. Evaluation changes nothing: still recorded; retry produces no duplicate.
9. Agent output or ineligible actor attempts verified: server rejects.
10. Box metadata write fails: event recorded, projection failure visible.

## 13. Risks

| Risk | Mitigation |
| --- | --- |
| Tenant keeps one file version | Capture and hash the baseline locally before the upload; label local snapshots as local |
| Model misses the removal live | Code diffs prior quotes and hands the vanished quote to the judge; labelled replay as fallback |
| Full path slower than rehearsed | Trace panel shows real progress; cutover to labelled replay at a rehearsed threshold |
| "Isn't this Automate / a diff / Prime?" | Section 9, and the counterexample beat answers the diff objection on screen |
| Box task response not readable | Poll task assignments; if unavailable, label the human step simulated and drop the identity claim |
| Comment leaks a finding to external collaborators | No comments; tasks only |

## 14. Changelog from v1

- Status split into machine assessment and human disposition with a published display function. "Proposed Satisfied", "Regressed" as a status, and "Accept risk" removed. (Codex 1, 6; Dana 2.)
- Snapshot manifest; every evaluation and action bound to it; stale actions rejected. (Codex 2.)
- Whole profile evaluated against whole snapshot; selective re-check routing and Haiku extraction stage dropped. (Codex 3, scope cut 3.)
- Ledger records every evaluation including no-change and errors; export carries population counts and manifest hash. (Codex 5; Dana 3.)
- Human step is one real Box task; identity from the task response; Return to author is the demo action. (Codex 6; Dana 5.)
- Quote validation failure fails the finding. (Codex 7.)
- Integration gate moved to the first 30 minutes; Live/Replay/Mock labelling. (Codex 8.)
- In-region claim removed; `us.` inference profile; data-handling section added. (Codex 9; Dana.)
- Demo ends on an accountable review outcome plus a counterexample and a measurement plan. (Codex 10.)
- US bank control profile with eight fields; EU profile as alternate; noisy controls dropped. (Dana 3, 4.)
- Finding card rebuilt on Dana's mockup; confidence decimal and duration removed. (Dana 5, 7.)
- Competitor and "Automate cannot" absolutes replaced with "we did not find." (Codex 4, section 2.)
- Trigger is submission or new version in the package folder, not every save. (Dana.)
- Box AI extract/ask removed from the build list to keep one judgment path. (Codex section 2.)

## 15. Open questions for round two

1. Is the two-field status model legible in three minutes, or does the display function need to be hidden behind the displayed status only?
2. Does the 1:45 beat, Return to author via a Box task, read as "accountable human judgment" or as "a person clicked a button"?
3. Is eight controls and five documents still too much for the live evaluation, or is the counterexample worth the extra files?
4. Is "Keel" and the closing line right for a room of tech execs and engineers?
