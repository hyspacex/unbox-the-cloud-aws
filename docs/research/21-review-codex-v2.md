# Adversarial review of Keel design v2

**Verdict: materially better, but revise before freezing the build.** V2 has a defensible product boundary and several useful correctness rules. Its weakest point is now the connection between those rules and what the audience actually sees: an incomplete status function, ambiguous Box metadata, and a reviewer task whose completion does not yet establish that anything was returned to an author. The added enterprise detail exceeds the six-hour implementation budget without resolving those contracts.

Two of the ten original objections are resolved at the design level; eight are partially resolved. None is wholly untouched. “Resolved” below means the specification answers the objection, not that an implementation or tenant integration has passed a test.

This is a document review from three simulated adversarial perspectives: a Box principal engineer, a bank head of technology risk, and a hackathon judge using the **50% technical execution / 30% business value / 20% presentation** rubric. I read v2 in full, then re-read the v1 review and consulted the persona review and research. I did not inspect implementation correctness, rerun the research probes, or test Box. An unspecified contract is a design finding, not a demonstrated runtime defect.

Source key:

- **D2:** [20-design-v2.md](20-design-v2.md).
- **R1:** [11-review-codex-v1.md](11-review-codex-v1.md).
- **P:** [12-review-persona-v1.md](12-review-persona-v1.md), the Dana Okafor persona review.
- **E:** [01-enterprise-problem.md](01-enterprise-problem.md).
- **A:** [02-aws-agentic.md](02-aws-agentic.md).
- **X:** [03-box-ai.md](03-box-ai.md).
- **B:** [00-brief.md](00-brief.md), the time limit, team size, and judging rubric.

Quotes attributed to D2 are exact. Section and line references identify the supplied revisions. Research claims retain their original qualifications; the persona's specific working practices are not independently validated customer findings.

## 1. The ten v1 objections, one by one

### 1. “Your rule rejects exactly the regression I care about.”

**Resolved at the design level.**

D2 §3, line 30:

> A vanished quote is a reason for re-review and a hint to the judge, not the definition of a regression.

The same paragraph explicitly requires handling both a retained quote with a contradicting exception and a faithful paraphrase. Acceptance cases 3 and 5 make those obligations testable. This closes the original deletion-only rule. Separating machine assessment from human disposition also prevents `Regressed` from doing several incompatible jobs.

**Residual issue, distinct from the original rule:** D2 has not defined the boundary between `evidence_weakened` and `evidence_absent` consistently for its own hero example. See objection N3 below. Do not restore the literal-deletion gate to solve that ambiguity.

### 2. “Your human can approve evidence that is already obsolete.”

**Partially resolved.**

D2 §3, line 28:

> Every evaluation, finding, and human action is bound to a snapshot id. A decision on a stale snapshot is rejected by the server.

D2 §4, line 67:

> An evaluation on a snapshot older than the current one cannot change displayed status.

The manifest includes file IDs, version IDs, hashes, and control-profile version. These are substantive improvements. Acceptance case 7 tests a stale human action.

**Remaining gap:** “current” is not operationally defined. The build does not specify per-folder serialization, checking the manifest again before publication/action ingestion, or how it detects a source version that arrived after the last poll. Listing and fetching individually pinned files establishes a reproducible input set; it does not by itself establish a coherent submitted package. A profile change also needs to invalidate the decision.

The late-result rule lacks an acceptance case, and the Box projection has no stated snapshot/freshness field. A correct Keel screen could coexist with an old `verified` value in Box. Define “current observed snapshot,” serialize the small demo workflow, recheck source identity at the action/publication boundary, and test both stale actions and late results. Do not imply freshness beyond the observation boundary.

### 3. “The new document that invalidates the design is outside your mandatory checks.”

**Partially resolved.**

D2 §3, line 29:

> No selective routing at demo scale.

That paragraph supplies every control and every readable file in the snapshot. This closes the mandatory-selection hole for a new document **when an evaluation runs**. The contradiction acceptance case is also useful.

**Remaining gap:** the trigger contract still omits file removal, move-out, restore, and control-profile changes. “Submitted or a new version is uploaded” does not cover those changes. Nor does the spec define how code proves every expected control received exactly one result or how it determines which controls an unreadable file could affect.

Keep whole-snapshot evaluation. Define the small prototype's observation boundary and membership/profile invalidation rules. If a potentially relevant file is unreadable and dependency coverage is unknown, report incomplete evaluation rather than allowing the model to decide that the failure was irrelevant.

### 4. “I can assemble most of this with Box. What exactly did you invent?”

**Resolved for the proposed application contribution.**

D2 opening, line 5:

> Keel adds version-bound control-evidence history and re-review rules to a Box review workflow.

D2 §9, line 143:

> We did not find a documented native version-bound control-evidence ledger with re-review rules.

This is the right boundary. D2 acknowledges Automate's workflows, AI steps, approvals, iteration, and history. It removes arbitrary AI Studio registration, labels the HTTPS integration untested, and adds a cross-file counterexample. Those changes answer the Box engineer's original challenge without requiring an uncopyable moat.

**Caution:** this resolution does not validate the universal competitor claim that survives in §1. The counterexample must also actually test the stated control. Those are addressed separately below.

### 5. “Your export cannot tell me which changes you failed to review.”

**Partially resolved.**

D2 §3, line 32:

> Every evaluation is recorded, including evaluations that change nothing and evaluations that fail.

D2 §6, line 95:

> Observation gaps are disclosed, not hidden.

These close the status-change-only ledger flaw. The export is now described in §6 as observed revisions and outcomes, and completeness reconciliation is explicitly deferred.

**Remaining gap:** §2 still promises a ledger that “proves the design-review control operated on every version,” and the script calls the export “the list the auditor asks for.” The prototype cannot establish either completeness or all human review obligations from observed evaluations alone. Without reconciliation, some gaps are unknown, not merely known gaps awaiting disclosure.

A locally recomputable hash chain and manifest hash do not establish independent integrity: an operator able to rewrite the history can also regenerate those hashes. Define logical evaluations separately from retry attempts so “every evaluation” and “retry produces no duplicate” do not conflict. Export observed runs, known failures, and explicitly unknown coverage; reserve complete-population and independently protected-history claims for the pilot.

### 6. “A named button is not an authenticated reviewer or authorized risk owner.”

**Partially resolved.**

D2 §8, line 129:

> Box writes: two metadata fields on folder and files, one Box task to the reviewer per finding; task response polled and the responding identity recorded.

D2 §4, line 65:

> No code path writes `verified` except the human action handler, which checks role, snapshot freshness, and uploader-not-reviewer.

Removing `Accept risk`, polling a real task response, and explicitly downgrading an unreadable human response to a simulated step are good changes.

**Remaining gap:** the spec still promises actions from both Box and Keel without defining Keel's authenticated user path. A Box identity does not supply an ARB role or project membership. P §4 explicitly rejects uploader inequality as sufficient separation of duties; a service account or PM may upload for the author.

The task-to-disposition mapping is also undefined. Completing a task assigned to the reviewer does not, by itself, identify the author, create an author work item, or capture the reviewer's reason and remediation due date. Bind a real task response to a server-stored finding/snapshot, verify a declared reviewer allowlist for the synthetic demo, and implement one explicit disposition. Do not claim production separation of duties from uploader inequality.

### 7. “A matching quote proves that words exist. It does not prove your verdict.”

**Partially resolved.**

D2 §3, line 31:

> A finding whose required evidence fails validation becomes Not evaluated, not a quote-less positive.

This directly fixes the invalid-quote failure path. Removing the confidence decimal is also correct.

**Remaining gap:** D2 §3 enables Verify when “a validated quote exists in a current file.” Existence is weaker than relevance, sufficiency, and support for every required clause. “All data is encrypted” is a real quote in the hero case, yet the script requires Verify to be disabled. A contradictory assessment can also contain a valid positive quote.

There is still no declared demo file format, canonical extraction representation, truncation check, source-offset contract, or control-coverage validator. Full input text is a good intention, not proof of complete evaluation. Specify the tiny supported corpus, validate returned control IDs and evidence bindings, and require an explicit human review of the control's clauses. Say “no supporting evidence found in the evaluated versions,” not “Nothing.”

### 8. “You budgeted the demo around a benchmark for a different pipeline.”

**Partially resolved.**

D2 §11, line 157:

> We quote this as "in a single synthetic test," and we measure the full upload-to-display path separately during rehearsal.

The first-half-hour integration gate, single assessment path, persistent Live/Replay/Mock labels, and original replay run ID all address the previous execution risk.

**Remaining gap:** the build still carries eight controls, five files, seven human actions, two reviewer surfaces, folder and file projections, a second profile, and a substantial finding card. R1 recommended three controls, two files, and one human path. A's reported probe used a different corpus and `global.`/`us-west-2` configuration; it does not establish the new `us.`/`us-east-1` path or the end-to-end 30-second script window.

The exact intended model/profile/region belongs in the integration gate. Reduce the live slice, name a rehearsed timeout/cutover point, and measure upload-to-projection plus task-response ingestion separately. The benchmark qualification is fixed; the execution budget is not.

### 9. “You promise a data boundary your own model configuration does not provide.”

**Partially resolved; the original residency overclaim is removed.**

D2 §8, line 139:

> Document text leaves Box for the laptop and the Bedrock request in us-east-1 under a `us.` inference profile, and is stored in the local ledger.

That paragraph explicitly rejects “stays in the tenant,” declares synthetic documents, and requires classification approval and retention decisions for a pilot. This is much more honest than v1.

**Remaining gap:** the selected inference profile is not evidence of a single-Region processing guarantee; the exact routing and every storage/log destination still need verification before a pilot. More immediately, v2 drops the untrusted-document handling described in A without replacing it with an explicit read-tool authorization contract. `get_file_text(file, version)` must reject IDs outside the pinned, authorized snapshot. No approval tool does not prevent a malicious document from influencing an assessment or soliciting an unauthorized read.

For the hackathon, retain the synthetic-data boundary, constrain all reads in code, and remove any implication that geographic selection alone supplies the pilot's data controls.

### 10. “You end by accepting the problem instead of proving that anyone saves work.”

**Partially resolved.**

D2 §7, line 114:

> The control stays open.

D2 §7, line 117:

> Next: a shadow evaluation against manual review, measuring missed changes, false alerts, and review time.

The counterexample, open gap, and measurement plan improve both the human beat and business-value claim. No invented savings number is offered.

**Remaining gap:** the audience sees a task completion, not yet a reasoned choice with an accountable next step. The counterexample remains re-review due, so avoiding a loss alarm does not prove that a review or task was avoided. The new snapshot could also make all eight prior human dispositions stale. That workload consequence is not reflected in the top-line counts or “re-review one paragraph” claim.

Show the reviewer rejecting the weaker evidence against a specific requirement, assigning a concrete next action, and leaving the gap open. Claim a more focused review on this example, not a measured reduction in review workload.

## 2. Ranked objections to the revision

These are ranked by their ability to invalidate the live story or produce a misleading downstream result. “New” includes problems created by the new status/profile contracts; retained issues are identified as such.

### N1. Blocker: the published display function is neither a two-input function nor a complete one

**Panel:** Box engineer and technology-risk head. **Origin:** new contract, D2 §4, lines 37–68.

The table needs machine assessment, human disposition, change classification, assessed snapshot, reviewed snapshot, current observed snapshot, evaluation progress, and applicability approval state. Several are absent from the two fields it claims to combine.

| D2 table case | Defect |
| --- | --- |
| `evidence_found, moved` / earlier `verified` | `moved` is a change classification, not a machine-assessment enum value. The row quietly introduces another input. |
| `evidence_found` / earlier `verified`, classification `unchanged` | No row. This is likely the most common successful re-check. |
| `evidence_contradicted` / any disposition | No explicit outcome for the retained-quote contradiction acceptance case. |
| `evidence_weakened` / `returned_to_author` | No row, although the hero's replacement text plausibly makes this the demonstrated result. |
| `any` / approved `not_applicable`, versus `not_evaluated` / `any` | Both match an unevaluated, previously exempt control. There is no precedence or rule for whether applicability changed. |
| `not_evaluated` / `verified`, with a newer snapshot pending | “Not evaluated” and “Verified, re-check pending” can both match. An error and an in-progress run also need distinct treatment. |
| `exception_approved`, `compensating_control`, `superseded` | Declared dispositions with no display mapping. Approval validity, expiry, evidence, and profile changes are not handled. |
| `Evidence moved` and `Mark false positive` actions | No specified resulting disposition or correction event. A human correction must not silently rewrite the original assessment. |

The count “8 controls, 6 Verified, 1 Returned to author, 1 Pending review” is equally underspecified. If all decisions are snapshot-bound, an upload produces a new package snapshot and the six old verifications are historical. If code carries them forward automatically, v2 needs a precise rule and an honest label. A fresh `evidence_found` result is not a new human decision.

**Required v3 choice:** keep the machine/human distinction in storage; publish the full inputs and ordered rules. For the demo, reject unsupported actions and keep current verification strictly bound to the reviewed snapshot. Show historical verification separately. Do not add six more exceptions to the live UI to avoid making this choice.

**Three-minute legibility:** showing displayed status, machine assessment, and human disposition on every row makes the audience reconcile three labels. Show one current outcome per row, with a secondary “Last reviewed by … on snapshot …” line. Expand machine detail on the hero card. Keep the two fields inspectable in Box, but do not teach their Cartesian product on stage.

### N2. Blocker: “filter on the human field” can publish a stale approval as current

**Panel:** Box engineer. **Origin:** new projection contract, D2 §3 line 33 and §6 line 101.

After snapshot S1 is verified, S2 loses support. Keel writes `machine=evidence_absent`; the last human disposition is still `verified` against S1. A downstream consumer following “filter on the human field” accepts exactly the obsolete approval this product is supposed to prevent.

There is also a schema problem: two scalar fields on an item cannot represent eight independent machine assessments and eight independent human dispositions. If the intended values are structured strings, they need a defined encoding and query contract. If these are project summaries, their aggregation rule is missing. If the intent is two fields **per control**, the spec should say so.

X §3 describes current-value metadata, not the missing domain contract. File projections introduce another ambiguity: a runbook can support recovery while the package has an encryption gap. Copying the folder's verdict to every file would misdescribe that file's contribution.

**Required v3 change:** specify one small folder projection with its snapshot ID, current review state, and link to the authoritative record. Define safe consumer behavior when a newer snapshot is pending, evaluation fails, or projection fails. Preserve historical human decisions in the ledger; automation may invalidate their applicability without impersonating a human decision. Cut per-file rollups from the six-hour build.

### N3. Blocker: both hero outcomes have semantic problems before the agent runs

**Panel:** all three. **Origin:** inconsistency introduced by combining the richer US profile with the old demo.

**Encryption:** D2 §7 replaces the detailed statement with “all data is encrypted,” yet narrates lost evidence. Its finding-card basis explicitly mentions a weaker statement. P §2 calls encryption without a key-management statement **weakened**, and D2 acceptance case 4 applies that same principle to TLS with the version removed. Is `evidence_absent` evaluated per required clause while `evidence_weakened` is evaluated per whole control? No rule says so.

Choose one definition: the combined encryption/key-management control has **weakened support**, with key-management evidence absent. If the team wants a pure deletion hero, remove the supporting content entirely in the fixture. Do not force a preferred label onto an ambiguous example.

**Recovery:** D2 §5 defines SEC-ARCH-22 as “RTO/RPO consistent with the BIA tier.” The script says the “rollback sentence” survives in a runbook. A rollback sentence does not necessarily establish recovery targets or their consistency with the BIA. No authoritative BIA values are specified. The approved-services control has the analogous problem: which approved catalog is being compared?

For the counterexample, show the actual recovery target statement and its pinned location. Either supply explicit, synthetic policy/BIA inputs with provenance, or narrow the demo control to “recovery targets documented” and label it illustrative. Also say “still supported in the runbook”: if the quote was already duplicated there, the evidence did not literally move during this upload; the selected evidence binding changed.

### N4. High: “Return to author” currently proves reviewer acknowledgment, not a return or a judgment

**Panel:** hackathon judge and technology-risk head. **Origin:** new demo action with an incomplete integration contract.

D2 creates a task **for the reviewer**, then shows that task completed. The author gets no explicitly specified assignment. Jira creation is deferred. The spec does not say where the reviewer enters a reason, how the author is resolved, whether the due date applies to review or remediation, or which Box task response becomes `returned_to_author`.

X §6's sample attaches a task to a file; D2's decision concerns a folder snapshot and possibly several files. Name the attachment target and store an immutable server-side mapping from task/assignment to finding and snapshot. IDs in a task message alone do not define state transitions. P §5's stronger adoption claim, that return-to-author becomes Jira work, is deliberately not delivered by this build.

**What makes the beat convincing:** the reviewer says, “This says encrypted, but our requirement also needs a key model,” then records that reason and a named author action with a due date. The screen shows the gap still open and the actor derived from the real response.

If the build only records the reviewer response, call the beat **Confirm finding** and say author routing is proposed. If it claims **Return to author**, show the resulting author task or an existing work item with that assignment. Do not add a second live model run or a miniature exception system to make the first click meaningful.

Also distinguish response time from ingestion time. A polled Box response does not automatically capture “this card's state at click time” as promised in §6. Record the immutable snapshot and response payload, both timestamps where available, and the result of the freshness check.

### N5. High: eight controls and five documents are over-scoped for this build, though not inherently too large for the model

**Panel:** hackathon judge, primarily the 50% execution category. **Origin:** scope retained and expanded after explicit reduction advice.

A's reported 12-control probe does not establish a hard capacity problem with eight controls. The problem is preparing and validating a real five-document workflow while building the new state and human-action contracts.

Eight controls across five files create up to 40 control/file relationships to reason about, although they need not require 40 model calls. Add parsing, provenance, partial coverage, metadata writes, task ingestion, seven action semantics, a second profile, rich diffs, hash-chain export, and ten acceptance cases. The plan gives the team four hours to reach freeze, including the integration gate. Three people do not eliminate that shared critical path.

**Decision:** keep the counterexample; cut the unused breadth.

| Keep for the live slice | Defer from the six-hour build |
| --- | --- |
| Two short text documents: architecture and runbook | Three extra documents, mixed-format parsing, diagram claims |
| Three illustrative controls: weakened encryption/key management, recovery supported elsewhere, one unchanged control | The other five controls and the alternate EU profile |
| One model, full declared input coverage, pinned source quotes | Model switching and ceremonial tool calls |
| One real human surface and a specific disposition contract | Seven active action types, second-reviewer and exception workflows |
| One defined folder projection, one findings screen, expandable events | Per-file rollups and a screen full of enterprise fields |
| Observed-run export and honest integrity limits | Audit-complete or independently tamper-evident claims |

Move the abandoned features explicitly into “proposed.” D2 currently presents seven actions as designed-in functionality while the build and tests cover only a small subset. A role-gated button with no defined transition is unfinished work, not enterprise readiness.

### N6. High: the supposedly careful opening still promotes assumptions into findings

**Panel:** technology-risk head and judge. **Origin:** retained overclaim plus new persona-derived precision.

D2 §1 says:

> None of them tell you which control lost its evidence, whether the evidence moved to another document, or who reviewed that exact version.

The last clause conflicts with E §3.1, which describes approval products recording approver, timestamp, exact version, and hash. The broader universal is not established by the research. D2 §9's “we did not find” qualification does not repair the opening.

The “6 to 10” weekly reviews, three-week reconstruction, CISO buyer, and ten-to-fourteen-week pilot path come from P's scenario or assertions. They are useful hypotheses, but E explicitly says review-volume data is unavailable. The research pack does not turn a persona's first-person account into an independently observed customer result. Likewise, “so they re-review one paragraph” is an intended benefit; a compound control or counterevidence may require more context.

**Fix the words:** “In our synthetic bank scenario…” for the specific story; “buyer hypothesis” for the sponsor; “pilot gates would include…” for adoption. Describe the selected competitive gap without categorical limits on all design-review tools. Keep bank-specific volumes, timelines, and sample sizes off the pitch unless separately substantiated.

### N7. High: the export claims undo the honest deferrals

**Panel:** technology-risk head. **Origin:** stronger audit presentation than the revised coverage contract supports.

The role table's “proves … every version,” “tamper-evident manifest,” and script's auditor-list claim outrun §10's deferred reconciliation and production integrity controls. Logging a model evaluation does not establish that a required human review occurred or completed within its SLA. Hashing an export does not establish that omitted events ever existed.

P §8 also corrects the sampling unit: design decisions for the ARB control, versus changes for a change-management population. D2 exports observed revisions and outcomes without specifying those selectable populations, period boundaries, or open items at period end.

**Required v3 wording:** “Observed revisions, evaluations, and human responses from this run.” Preserve identifiers that allow future decision/change views. Do not rebuild an audit reporting product on Saturday. State that complete-period reconciliation and independent integrity protection remain unimplemented, including on the export screen.

### N8. High: the new snapshot model may increase review noise, and the trigger change does not actually exclude autosaves

**Panel:** technology-risk head and judge. **Origin:** consequence of the new verification semantics; retained trigger gap.

D2's changelog says the trigger is submission or a new package-folder version, “not every save.” Its operative rule still includes every new version. If someone edits a package file in place, the spec has no submission marker, lock condition, debounce, or immutable-intake rule that distinguishes an autosave from a submission. P §§1 and 9 specifically asked for that distinction.

Meanwhile, current-snapshot verification potentially expires all eight decisions on each upload. “Evidence moved, re-review due” correctly avoids inheriting human approval, but still creates review work. “One evidence gap, not two” must not turn into “one review, not two.”

**Required v3 boundary:** the demo observes an explicit submitted package, with no in-place editing during capture. State that changes in the living Confluence document are invisible until exported to Box, as P §5 already warns. Count current review work separately from historical verifications and machine loss alerts.

### N9. Medium-high: full-text input, search claims, and live trace do not yet describe one execution path

**Panel:** Box engineer and judge. **Origin:** new ambiguity after removing extraction and selective routing.

D2 §3 says the agent receives all text and prior evidence. §8 equips it with tools to retrieve those same inputs. This is not inherently wrong, but the design never chooses whether these tools perform necessary retrieval or merely repeat information already supplied. A §2's preference for autonomous tool use is a positioning opinion, not permission to manufacture tool activity.

“Four other files searched, zero candidates” must come from actual recorded coverage and operations. A model's basis bullet is not a search log, and a literal search with zero matches is not proof of semantic absence. Unreadable files and truncated input must make coverage incomplete.

Similarly, Strands events alone do not prove that application-managed snapshot capture, ledger writes, Box metadata writes, and task creation occurred. Instrument those application operations as well. A late result should remain a historical run without replacing current status.

**Fix:** choose a simple complete-input evaluation for the tiny corpus, with deterministic fetch/coverage records and genuine optional tool events. Call it what it is. The technical value can come from source binding, safe state transitions, and the counterexample without pretending every stage was autonomously selected.

### N10. Medium-high: tasks and role labels do not close the remaining permission gaps

**Panel:** technology-risk head. **Origin:** retained omissions hidden by stronger “designed in” language.

“No comments; tasks only” is not an access-control proof for the task, quoted content, Keel card, metadata, or exported history. A reviewer may see fewer source files than the integration account. D2 does not specify the common audience restriction R1 proposed, nor a check before returning quotes through the app.

Likewise, the spec copies `uploader-not-reviewer` after P explicitly explained why it fails. It also removes A's explicit untrusted-input treatment without declaring the replacement constraints.

**Saturday fix:** use one restricted synthetic folder, an explicitly configured reviewer distinct from the synthetic project author, snapshot-scoped read tools, and a single authenticated response path. Label these as demonstration boundaries. A pilot still needs dated reviewer-role/project-membership checks and source-permission enforcement; do not imply the small fixture proves them.

### N11. Medium: the profile and acceptance contracts contain avoidable inconsistencies

**Panel:** Box engineer. **Origin:** new profile and broader action model.

- D2 §5 calls the profile “eight fields” but lists **nine**: ID, Title, Requirement, Standard, Applicability, Evidence, Tier, Framework map, Reviewer role. The changelog repeats eight.
- “Severity is control tier times application tier” has no defined mapping. These are policy categories, not inherently multiplicative numbers. Use a small illustrative lookup or fixed demo severity.
- “Verify … when a validated quote exists” contradicts the hero's weaker but valid quote and disabled Verify. Define support per required clause and any allowed human correction.
- Acceptance case 8 requires every evaluation to be recorded while retries produce no duplicate. Define a logical evaluation ID and separate attempt events; deduplicate application/task side effects, not all evidence that an attempt occurred.
- Cases omit late-result publication, missing/duplicate control outputs, ambiguous display precedence, stale metadata consumption, task-response replay, and the exact return-to-author outcome. These are more valuable than shipping a second profile.

Do not expand the acceptance suite into production certification. Replace low-value breadth with checks of the small path's actual claims.

## 3. The three-minute script

### Line-by-line critique

| Time | D2 wording or action | Critique and required change |
| --- | --- | --- |
| 0:00 | “Approved design evidence changes after review…” | Strong framing and correct synthetic-data disclosure. “Can change” avoids asserting that every approved package drifts. Keep the version/accountability promise. |
| 0:15 | “passed the review board on October 7… each verified…” | The later hero says Priya verified on October 14. This is not necessarily impossible, but the script does not distinguish board approval from later evidence review. Pick one baseline review date or explicitly explain the sequence; show true fixture provenance. |
| 0:40 | “an AI-polished rewrite… all eight controls against all five files” | AI authorship is planted scenario context, not something Keel detects. Say “rewritten.” The counts advertise scope rather than value. Evaluate the reduced declared corpus; retain actual timing and Live/Replay/Mock labels. |
| 1:10 | “Encryption at rest lost its evidence… No key model… Nothing.” | Too much narration for 20 seconds, and “Nothing” overclaims search completeness. The remaining encryption statement means the combined control is weakened. Identify exactly what was lost: the key-management commitment. |
| 1:30 | “rollback sentence… One evidence gap, not two. A text diff would have flagged both.” | Retain the counterexample. Match the quote to the actual recovery control, avoid implying all diff tools raise compliance alarms, and say that the replacement binding still needs review. |
| 1:45 | “Dana… returns… quote and a due date… machine never turned it green…” | Names are not identity proof. Use the actual signed-in respondent. Spend words on the reviewer's reason and next action, not a disabled button and color policy. Completing the review task must not be narrated as author routing unless that routing is shown. |
| 2:10 | “This export is the list the auditor asks for.” | Overclaim. Show observed evaluations, an unchanged result, the real response, and coverage limits. A manifest hash is not the demo's business outcome. |
| 2:30 | “Box holds… Bedrock… Code… A person…” | Keep the division of responsibility. Name the local ledger, since Box does not hold this build's history. Avoid a service-name tour. |
| 2:45 | “shadow evaluation… missed changes, false alerts, and review time” | Keep. Those are the right future measures. Do not imply this validation has happened. |
| 2:50 | “Files have versions. Compliance evidence should too.” | Memorable but broader than the product: existing evidence systems already version artifacts, and Keel does not prove operational compliance. Close on the reviewed claim and exact version. |

### Tightened rewrite, preserving the beats and timestamps

This version assumes the recommended **two documents / three illustrative controls** slice. The recovery control checks documented targets; a claim of consistency with a BIA requires separately supplied, pinned BIA values. “Reviewer” and “author” below must resolve to real demo identities where a real action is claimed. Historical fixture reviews must be visibly marked synthetic unless genuinely performed.

| Time | Tightened narration | On screen |
| --- | --- | --- |
| 0:00 | “Approved design evidence can change. Keel shows which control needs another look, and who reviewed which version. This is a synthetic bank example.” | Title and persistent mode label. |
| 0:15 | “Here is Lantern's reviewed baseline: three checks across the architecture document and runbook. Each review is tied to these exact versions.” | Three readable rows, baseline snapshot, named review records with fixture provenance. Keep dates in the UI. |
| 0:40 | “Now the project submits a rewritten architecture document. Keel pins both files and checks all three controls, including support in the runbook.” | Real upload and application/model events, coverage, elapsed time. Preserve this 30-second execution window; switch explicitly to the rehearsed replay if needed. |
| 1:10 | “The reviewed text named customer-managed keys. The rewrite only says ‘all data is encrypted.’ Encryption is still mentioned; the key-management commitment is gone. Keel found no replacement in this snapshot.” | Exact old/new quotes and versions; **Needs review: key-management evidence missing**, with machine assessment `evidence_weakened` in the expanded detail. |
| 1:30 | “Recovery targets disappeared from this document too, but remain here in the runbook. That is a changed evidence source, not lost support. The new binding still needs review.” | Highlight the actual recovery-target quote and runbook version; no current Verified badge inherited from the old binding. |
| 1:45 | “The reviewer checks the requirement: ‘Encrypted’ does not explain the key model. They return that finding to the named author with a due date. The response is tied to this snapshot; the gap stays open.” | Actual Box response, reviewer reason, author work item, due date, and resulting bound ledger event. Use the fallback wording below if no author routing exists. |
| 2:10 | “The ledger records this evaluation, the unchanged check, and the reviewer's response. This export covers what Keel observed; complete audit coverage needs reconciliation.” | One compact event view and observed-run export. Counts come from the run. Coverage limits remain visible. |
| 2:30 | “Box holds the files and tasks. Bedrock assesses the text. Application code validates quotes and records history locally. Human decisions remain bound to the reviewed versions.” | Three-box architecture strip, local storage explicit, proposed components visually separate. |
| 2:45 | “Next: shadow manual reviews. Measure misses, false alerts, and review time.” | One measurement-plan line. |
| 2:50 | “Know what changed, and who reviewed that exact evidence.” | Title and final evidence pair; leave the remaining seconds for latency or a slow click. |

**Honest fallback for 1:45 if only the reviewer task is implemented:** “The reviewer checks the requirement and confirms the key-management gap in Box. We record their response against these versions. The gap stays open; routing remediation to the author is proposed.” Show acknowledgment, not a fictional author assignment. This is weaker business execution, but stronger than mislabeling a completed task.

The human beat is convincing only when the reason is visible. It need not contradict the model: checking the requirement, rejecting the weaker wording, and choosing an accountable next step is judgment. A prefilled button with no reason or consequence is not.

Keep **Keel** for this round. None of the identified failures is a naming problem. The closing line should explain the evidence-review relationship rather than making a broader claim about compliance.

## 4. Remaining contradictions with the research files

Some differences are deliberate corrections to weak research recommendations. Do not “resolve” them by reverting v2.

| Source and issue | D2 comparison | Assessment and disposition |
| --- | --- | --- |
| **E §3.1, lines 175–177:** approval tools can record a person, timestamp, exact version, and hash. | §1 says none of the existing tools tell you who reviewed that exact version. | **Direct contradiction.** Remove that universal. Differentiate control-level evidence across a package. |
| **E §§1.4 and 7:** no credible ARB-volume number; do not invent one. **P §8:** supplies a specific weekly workload. | §2 presents 6–10 weekly reviews as daily reality without a scenario qualifier. | **Evidence qualification lost.** P supplies persona context, not independent market validation. Treat workload, buyer, and pilot timing as hypotheses. |
| **E §3.4, lines 223–225:** vendor content-analysis limits are absence of evidence. | §9 qualifies Automate, but §1 remains universal and §9 describes AI review tools as assessing “a document.” | **Unsupported generalization remains.** Use the narrow selected workflow as differentiation; do not imply a demonstrated competitor limit. |
| **E §3.3:** sample size is not mandated; population completeness matters. **P §8 item 13:** decision and change populations differ. | §2 says auditors sample about 25, promises every-version operation; §7 calls its export the auditor's list. | **Overstatement and unincorporated correction.** The prototype exports observations, not a reconciled population for a defined audit control. |
| **P §2:** encryption without a key model is weakened. | §7's weaker encryption text becomes lost/absent evidence, while acceptance case 4 calls lost TLS specificity weakened. | **Semantic inconsistency.** Define whole-control assessment separately from which required clause lacks support. |
| **E §2.3 C10; P §3 SEC-ARCH-22:** recovery includes stated RTO/RPO, with P adding consistency with BIA tier. | §5 adopts the stricter control, but §7 demonstrates only a rollback sentence. | **Unsupported positive result.** Supply the actual target evidence and authority input, or narrow the illustrative control. |
| **P §§1 and 9:** submission/lock, not every saved version; debounce autosaves. | §3 still triggers on a new version, while §14 claims “not every save.” | **Requested distinction remains missing.** Define an explicit submission boundary or restrict the demo folder to immutable submissions. |
| **P §§4 and 9:** eligibility requires ARB role and project independence; source quotes must be visible to the reviewer. | §§3–4 retain uploader inequality; §10 claims separation of duties; tasks replace comments. | **Unresolved requirements.** Demonstrate a constrained fixture; do not claim bank authorization or disclosure controls are complete. |
| **P §5:** Box contains submitted exports, not the living Confluence design; author work belongs in Jira. | §1 implies notice of design changes; §2 promises return with a Jira link; Jira creation is deferred and only reviewer-task completion is shown. | **Workflow boundary missing.** Detection begins when an observed package arrives in Box. Existing Jira references are possible, but do not imply implemented issue creation or author routing. |
| **A §§1.3 and 3.4:** probe/default uses `global.` and `us-west-2`. | §§8 and 11 select `us.` and `us-east-1`, and accurately label the old result a single synthetic probe. | **Intentional routing change, unverified operationally here.** Do not call the old probe a test of the new configuration. Gate the actual target configuration early. |
| **A §§3.1–3.4:** selective routing, Haiku extraction, model-supplied previous status, latest-file search, deletion prerequisite, invalid-quote downgrade. | §3 replaces these with complete input, ledger-owned history, pinned snapshots, and whole-finding failure. | **Corrective divergence.** The research's sample code is no longer the implementation contract. Copying it literally would reintroduce resolved flaws. |
| **A §3.7 and example prompt:** document text is untrusted; no approval tool. | §8 lists read tools and server-owned status but omits untrusted-input treatment and snapshot authorization checks. | **Safeguard omitted.** Keep explicit read constraints and untrusted-data handling; a Guardrails deployment itself need not be added. |
| **A §3.6:** trace comes from agent events. | §6 promises snapshot, metadata, and task events; §8 summarizes the trace as Strands stream events. | **Instrumentation gap.** Application operations need their own real events. Do not infer Box writes from model activity. |
| **X §3:** metadata represents current values; templates/query fields require a concrete schema. | §3 promises two fields, per-control state, and safe downstream filtering. | **Missing projection contract.** Define granularity, current snapshot, summary semantics, and failure behavior. |
| **X §§2, 5 and 7:** new-version trigger behavior is unverified; direct polling is the laptop recommendation. | §9 says “in production Automate is the trigger that calls it”; §8 marks the HTTPS outcome untested. | **Proposed path stated too definitively in positioning.** Say “proposed trigger.” Name manual submission or polling for the built path and test it. |
| **X §§2 and 6:** task decisions need explicit ingestion; sample tasks attach to files. | §8 correctly adds response polling, but §§3 and 7 leave response-to-disposition and author assignment unspecified. | **Partly incorporated.** Define the immutable task binding and actual response semantics before scripting Return to author. |
| **E §6 and X §7:** older machine-positive labels, tenant/region shorthand, Box AI path and external-agent positioning. | D2 removes machine “Satisfied,” discloses data movement, chooses Bedrock, and labels HTTPS integration proposed. | **Corrective divergence.** Keep v2's changes. The old research is not an instruction to restore overclaims or a second extraction pipeline. |

The research pack is not a unified contract. V3 should explicitly supersede the stale implementation recommendations while preserving unresolved tenant checks and evidence qualifications. No research file needs to be rewritten as part of this review.

## 5. Verdicts after v2

“Convinced” means convinced by v2 as specified: a credible Box application for the engineer, a defensible route toward use with bank documents for the risk head, and an executable three-minute submission for the judge.

| Panelist | Convinced? | One-sentence verdict |
| --- | --- | --- |
| Box principal engineer | **No** | The application contribution is credible, but the undefined metadata projection and stale-verification filter undermine the version-bound review contract at the Box integration boundary. |
| Bank head of technology risk | **No** | V2 merits continued synthetic evaluation, but authorization, source coverage, audit-population claims, and the distinction between historical review and current support remain insufficient for a bank-document pilot. |
| Hackathon judge, 50/30/20 | **No** | The counterexample is worth showing, but the scope threatens the technical 50%, the incomplete author handoff weakens the business 30%, and the status/date/control ambiguities consume the presentation 20%. |

**The single most important change for v3 is to replace the broad enterprise promise with one fully specified, executable review transaction.** Pin two documents and three illustrative controls; show weakened key-management support alongside recovery support that survives elsewhere; let a real reviewer record a reasoned disposition against that exact snapshot; and project a current status that cannot be mistaken for an old approval. Define that transaction's states, task response, and Box fields before adding anything else. It is the smallest change in scope that forces the status, human-judgment, correctness, and demo claims to agree.
