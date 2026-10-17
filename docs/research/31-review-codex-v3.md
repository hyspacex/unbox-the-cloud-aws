# Verification review of Keel design v3

**Source-version notice:** During final verification, `30-design-v3.md` was replaced by **v3.1**, which has sixteen display rules, twelve acceptance cases, and eight live controls across five documents. This review applies to the original **v3** requested here: eight rules, eleven cases, three live controls and two documents, with SHA-256 `c8e6f36eb4f74056f4cf1f2cfe9004c603d6c5bbf177aa3e161aee1987542f61`. Its verdict does **not** approve v3.1; references to D3 below identify the original content, although the linked filename now contains the later revision.

**V3 is good enough to build after the five bounded specification edits below.** The two-document, three-control transaction is the right scope; no further architecture round is needed. The remaining problems are implementation-contract gaps, principally historical-review selection, failed Box projections, and task-response semantics.

This is the same simulated panel: a Box principal engineer, a bank head of technology risk, and a hackathon judge using the 50% technical execution / 30% business value / 20% presentation rubric. I read [v3](30-design-v3.md) fully, then [the v2 review](21-review-codex-v2.md). References below use **D3** for v3 and **R2** for that review; **R1–R8** mean D3 §4's eight ordered display rules, not earlier review documents. “Resolved” means resolved in the design, not verified in an implementation or tenant.

I traced the rules, checked the relevant research qualifications and public vendor documentation, and did not run the application, test the tenant, or repeat the model probe. Deferred pilot requirements are treated as deliberate boundaries, not demands to expand Saturday's build.

## 1. Disposition of N1–N11

| Objection | Status | V3 resolution or exact remaining gap |
| --- | --- | --- |
| **N1: Incomplete display function** | **Partially** | D3 §4 adds ordered precedence and says, “A new snapshot never carries a human disposition forward,” but R6 still needs an earlier verification without defining how the reducer obtains it alongside the current disposition. The proposed `not_applicable` path, unmapped `superseded`, contradiction-to-Verify path, and count wording need the small corrections in §2 below. |
| **N2: Stale or ambiguous Box projection** | **Partially** | D3 §3.8 specifies “One folder-level metadata instance” with a snapshot ID and one enum per control, and removes per-file rollups. Its promise that a failed projection makes the Box fields read `stale` cannot follow from the failed write itself; the enum encoding, consumer freshness check, and separate projection-failure state remain unspecified. |
| **N3: Semantically wrong hero and recovery outcomes** | **Resolved** | D3 §4 defines weakened support as “at least one required clause is supported and at least one is not,” which fits the encryption hero. D3 §5 narrows recovery to documented targets and rollback, explicitly making “Consistency with the BIA tier” a pilot check requiring a pinned input; the live fixture must supply both remaining clauses. |
| **N4: Reviewer acknowledgment masquerading as author routing** | **Partially** | D3 §3.9 now creates “a second Box task assigned to the configured author with the lost clause quoted and a due date” and gives an honest Confirm-finding fallback. It still omits the task's file attachment, immutable task/assignment-to-finding mapping, exact response-to-disposition vocabulary, due-date source, response-versus-ingestion timestamps, and the fallback's resulting stored state. |
| **N5: Excessive live scope** | **Resolved** | D3 §5 declares “Live profile (three controls, two documents)” and moves the eight-control and EU profiles to fixtures, while §6 limits built actions to Return to author and Verify. This removes the breadth that threatened the six-hour critical path. |
| **N6: Scenario assumptions presented as findings** | **Resolved** | D3 §1 begins “In our synthetic bank scenario,” and §2 says, “Buyer, weekly volume, and pilot timeline are hypotheses from one persona review, not validated findings.” The opening also acknowledges existing version-specific approvals and qualifies the competitive gap with “as far as we found.” |
| **N7: Export overclaims completeness and integrity** | **Resolved** | D3 §6 names the export “Observed revisions, evaluations, and human responses from this run” and states that “complete-period reconciliation against Box's version list and independent integrity protection are not implemented.” D3 §3.7 also separates logical evaluations from retry attempts. |
| **N8: Autosave ambiguity and hidden re-review workload** | **Resolved** | D3 §3.1 says, “The demo observes explicit submissions only; the folder is not edited in place during capture,” and explicitly excludes unexported Confluence changes. D3 §4 does not inherit current verification, and §12 case 3 openly requires re-review of the unchanged control; the reducer/count inconsistency is tracked under N1. |
| **N9: Input coverage and trace describe different execution paths** | **Partially** | D3 §3.5 chooses complete readable-file input, and §6 now records application and agent events separately, with tool calls only when they actually occur. It still does not define supported file/text representation, truncation detection, complete evidence-location coverage, or why “files searched” follows from a fetch-coverage record rather than a separately recorded search operation. |
| **N10: Missing demonstration permission boundary** | **Resolved** | D3 §§3–4 constrain reads to the snapshot, treat document text as data, and check a configured reviewer against the configured author; §13 specifies a “Single restricted synthetic folder; same audience for reviewer, author, and service account.” Enterprise role/project checks and source-permission enforcement are explicitly pilot gates, while the remaining response-identity contract belongs to N4. |
| **N11: Profile and acceptance inconsistencies** | **Partially** | D3 fixes clause-level Verify prerequisites and evaluation-versus-attempt accounting, but §5 now says “Nine fields” while listing **ten**, and promises a severity lookup without supplying its values. The live clause/location data and acceptance outcomes for missing/duplicate findings, precedence, task mapping, and failed projection consumption still need freezing. |

**Six resolved; five partially resolved; none wholly unresolved.**

## 2. Status-model consistency audit

### The historical-input ambiguity

D3 stores a disposition per control and snapshot, then gives the display function one disposition and its snapshot ID. There are two possible readings:

- **Current-record reading:** a new snapshot's disposition is `unreviewed`, as the no-carry-forward rule requires; `evidence_found` therefore reaches R8, **Pending review**, even if an older snapshot was verified.
- **Historical-selection reading:** the reducer selects an earlier `verified` record when no current disposition exists; R6 then produces the two advertised **Needs review** labels.

The second reading is compatible with preserving history without copying approval, but its selection rule is absent. Supply `current_disposition` and `last_review`/`prior_verification` separately; reading history must not install that decision on the new snapshot.

### Walk through all eight rules

| Rule | Result of the audit |
| --- | --- |
| **R1: pending → Re-check pending** | Precedence is explicit: pending wins even over `not_evaluated` or a human disposition. The struck-through prior status is an additional historical input absent from the input list, and no acceptance case directly asserts this precedence. |
| **R2: error or not_evaluated → Not evaluated** | Correctly handles case 6 if the validator actually supplies that assessment; it also overrides current Verified, Returned to author, and Not applicable. Quote failure and file-read failure need distinct reasons, and schema rejection in case 9 needs a defined transition into `error` or `not_evaluated`. |
| **R3: current not_applicable → Not applicable** | Not shadowed logically, but **unreachable through the specified built actions**: §§6 and 10 make Not applicable proposed with no transition. Mark this rule future-only or remove it from the live reducer; do not accidentally activate an exemption workflow. |
| **R4: current verified → Verified** | Supports the S2 fixture baseline and a real Verify response, but also hides `evidence_contradicted` if every required clause has a validated supporting quote and the reviewer attests. Those prerequisites can coexist with a conflicting quote under §4's definition; this is permitted by the written precedence, not a mismatch in the no-human case, but the contract should require an explicit contradiction resolution or reject Verify for a contradicted assessment in this build. |
| **R5: current returned_to_author → Returned to author, open** | Correct for the hero after a valid response, and correctly precedes the weakened-evidence rule. It does not inspect author-task success, so the Confirm-finding fallback must not install this disposition and thereby claim a return that never occurred. |
| **R6: found plus earlier verified → Needs review** | Produces the intended recovery and unchanged labels only under the historical-selection reading above; with only the current record, it is unreachable after reset and both controls reach R8. Define whether `last_review` means the latest response or the latest verification, especially if a later response superseded an older verification. |
| **R7: weakened / absent / contradicted → Needs review** | Provides all three machine-negative labels, but the weakened label requires the unsupported-clause list, which is not a listed input. Contradiction and partial support can coexist, so assessment precedence must make contradiction win rather than relying on the model to choose consistently. |
| **R8: otherwise, parenthetically found + unreviewed → Pending review** | Works for a genuinely new, supported control. “Otherwise” suggests a catch-all, but the parenthetical does not cover `evidence_found` plus `superseded`, or a selected older `returned_to_author`/`not_applicable`; reject unsupported live states or define the fallback explicitly. |

All eight rules have satisfiable predicates in isolation; R3 lacks a built transition, and R6's reachability depends on the missing history selector. No other rule is inherently shadowed by an earlier rule.

### Walk through all eleven acceptance cases

Unless stated otherwise, these traces assume a complete evaluation, no current human response, and the baseline fixture verification retained in history.

| Case in D3 §12 | Rule-derived label and comparison with the specification |
| --- | --- |
| **1. Key-management clauses lost; encryption retained** | R7 → **Needs review: [clause] missing**; Verify is disabled because at least one clause is unsupported, matching the case. The §1 rewrite removes both the key-model and annual-rotation statement, so clause marks must show both losses, and a deterministic clause-to-label mapping is needed to produce §7's exact **Needs review: key-management evidence missing** string. |
| **2. Recovery support survives in the runbook** | R6 → **Needs review: evidence binding changed** if prior verification is selected; R8 → **Pending review** if the reducer receives the new snapshot's `unreviewed` disposition. The latter differs from the expressly required label; neither reading inherits Verified. |
| **3. Unchanged control** | R6 → **Needs review: re-verify on new snapshot** with historical verification; R8 → **Pending review** with only the current disposition, again differing from the expressly required label. Additionally, `unchanged` is compatible with §4's definition only if the selected file/version binding stays unchanged; retaining a quote in a newly versioned architecture file makes it `moved` under the current definition. |
| **4. Retained quote plus contradicting exception** | Before human action, `evidence_contradicted` reaches R7 → **Needs review: conflicting evidence**, as intended. With all clauses supported and an explicit attestation, the current Verify guard can admit a disposition that reaches R4 → **Verified** despite the unresolved conflict; the case must cover this human-action boundary too. |
| **5. Faithful paraphrase** | With historical verification, R6 gives binding-changed or re-verify depending on classification; with only current `unreviewed`, R8 gives Pending review. None is a loss alarm, so the stated expectation passes, but a paraphrase in a new file version is `moved` under the published binding definition. |
| **6. Unreadable file or fabricated quote** | Once `not_evaluated` is supplied, R2 → **Not evaluated**, as claimed. However, §3.3 invalidates only controls listing the unreadable file, whereas this case does not state that dependency restriction; a fabricated quote also fails validation rather than file-read coverage, so the failure record must distinguish those paths. |
| **7. New snapshot before reviewer response** | The stale response supplies no current disposition; the **new** snapshot determines the label: R1 if pending, R2 if failed, otherwise R6/R7/R8 as applicable. No single label is promised, and there is no contradiction, provided submission advances the authoritative current-snapshot pointer before response ingestion checks it. |
| **8. Late result from an older snapshot** | The result is excluded from the current reducer, so the existing current label remains unchanged, matching the case. Apply that guard to queued Box projections as well as the Keel screen, so a late write cannot publish an older snapshot afterward. |
| **9. Unknown control or disposition field in model output** | Rejection alone does not specify a displayed label: R2 if rejection sets evaluation `error`, R1 if the evaluation remains pending. Make the schema reject extra fields and define failure settlement; also test the exactly-once control-coverage rule for missing and duplicate outputs. |
| **10. Box metadata write fails** | Projection success is not an R1–R8 input, so the Keel control label remains whatever the evaluation/disposition produces; no rule yields `stale`. The UI can show a separate failed-projection indicator, but Box can retain its last successfully written values, contradicting §3.8's unconditional promise that its fields now read `stale`. |
| **11. Same task response twice** | A valid return continues to produce R5, and a valid verification continues to produce R4; a second attempt does not change the label. One disposition plus two attempt records is consistent, but the case also needs one author task and a defined response-deduplication key to verify §3.7's side-effect promise. |

### Walk through the three demo controls

| Control | Baseline S2 | New snapshot, before response | After the one live response |
| --- | --- | --- | --- |
| **SEC-ARCH-07: encryption and keys** | R4 → **Verified**, visibly fixture history. | R7 → **Needs review**, identifying missing key-model and rotation support. | R5 → **Returned to author, open**, conditional on the actual return path; confirmation-only should leave the gap under R7 and append an acknowledgment event. |
| **SEC-ARCH-22: recovery** | R4 → **Verified**, visibly fixture history. | Intended R6 → **Needs review: evidence binding changed**; requires the explicit historical input and validated support for both targets and rollback. | Unchanged by the hero's response; no new human verification. |
| **SEC-ARCH-17: SIEM** | R4 → **Verified**, visibly fixture history. | Intended R6 → **Needs review: re-verify on new snapshot**; requires historical input and an unchanged selected binding, whose location §5 does not supply. | Unchanged by the hero's response; no new human verification. |

The advertised **0 Verified, 1 Returned to author, 2 Needs review** count is correct under the intended history-aware reducer. Under the current-record reading it becomes **0 Verified, 1 Returned to author, 2 Pending review**. Also rename “counts current dispositions” to **counts current displayed outcomes**: Needs review is not a human-disposition enum value.

### Inputs that still need freezing

These are small data contracts for this transaction, not additional features:

- **Reducer inputs:** authoritative current submitted snapshot, current disposition, selected historical review/verification, prior displayed status, unsupported clauses, and explicit reasons for incomplete evaluation.
- **Evidence fixtures:** required clauses for SEC-ARCH-17, evidence locations for all three controls, complete recovery-target and rollback quotes, and a stable selected binding for the unchanged control; placing that binding in the unmodified runbook would satisfy the existing `moved` definition.
- **Coverage:** two supported file formats or one declared text format, canonical extracted text and source-location conventions, a bounded input/truncation check, and whether both files are dependencies for every control; the latter is the simplest way to make whole-package absence/conflict claims safe for this tiny slice.
- **Failure and publication state:** invalid-output settlement, a separate projection outcome with last successfully projected snapshot, and serialization or a final current-snapshot check for publication and response ingestion.
- **Projection schema:** fixed enum codes mapped to display labels, including reasons outside the enum, plus a declared type/encoding and selection rule for the folder-level `keel_last_human_review` tuple.

## 3. Demo-script consistency against §§3, 4 and 6

| Beat | Verification |
| --- | --- |
| **0:00 and 0:15: baseline and exact versions** | Consistent with snapshot-bound fixture reviews and their required visible fixture label; this is no longer presented as a real bank deployment or newly completed approval. |
| **0:40: pin both files and check all controls** | Consistent with §§3.2–3.6 on the successful path, provided both files were fully included; any unreadable/truncated input must visibly take the failure path rather than retain this completed-check narration. |
| **1:10: no replacement for key-management support** | Consistent with `evidence_weakened`, and “in this snapshot” supplies the right boundary; the card must include the lost rotation clause as well as the key model and use an explicit R7 label mapping. |
| **1:30: recovery is not a gap** | Correct only if the runbook supports **both RTO/RPO and rollback**, as §5 requires; showing a targets-only quote would not justify the whole-control claim, and the displayed R6 label needs the history-input correction. |
| **1:45: return to author with due date** | Now supported by §3.9's second task, but task completion alone still cannot choose between Verify and Return to author or supply the remediation due date; freeze that mapping, and narrate a return only after author-task creation succeeds. |
| **1:45 fallback: confirm finding** | The wording is honest, but §§3–4 lack a corresponding stored-event/display rule; recording `returned_to_author` would make the screen contradict “routing to the author is proposed.” |
| **2:10: evaluation, unchanged check, response, bounded export** | Consistent with the ledger and export contracts, including the unchanged finding and declared reconciliation limitation. |
| **2:30: Box, Bedrock, local history, human decisions** | Consistent on the successful integration path; after a projection failure, retain the failure indicator and do not imply Box's metadata contains the current result. |
| **2:45 and 2:50: measurement plan and closing line** | Consistent: neither claims completed customer validation, saved review time, nor operational compliance. |

There is no longer a narrative claim that Keel detects Confluence edits before submission, automatically verifies evidence, eliminates the counterexample's human review, or exports a complete audit population. Keep those corrections.

## 4. Remaining external and unsupported claims

- **Box metadata failure behavior is the substantive remaining Box overclaim.** D3 §3.8 promises `stale` after a failed write, while Box documents an atomic metadata update whose unsuccessful patch does not apply its changes; a local failure event cannot change the remote fields, and an ambiguous network outcome requires a read-back rather than an assumed state. The existence of folder metadata is supported; the missing part is Keel's publication/freshness contract. citeturn1view0
- **The human-response claim remains conditional on the tenant path.** Box documents tasks attached to a file, with `review`/`complete` actions, and assignment responses with `approved`/`rejected`/`completed` resolutions and messages; these are not Keel's domain dispositions. The assignment response exposes `assigned_to`, `message`, `resolution_state`, and `completed_at`, but an assignee field alone does not establish a separately authenticated responding actor, so the integration gate must prove that identity claim or use §13's simulated-step fallback. citeturn1view1turn3view3
- **The narrowed Automate claim is supportable.** D3 §9's positive list of workflows, AI steps, approvals, iteration and run tracking is consistent with Box's own description, while “We did not find a documented native version-bound control-evidence ledger” appropriately reports a research limit; it does not establish impossibility or an exclusive market capability. The HTTPS integration remains explicitly proposed and untested. citeturn3view0turn3view1
- **The compliance-platform comparison remains too easy to read as a content-analysis exclusion.** D3 §9 says these platforms test infrastructure and accept uploads, then contrasts Keel reading design evidence, but Vanta describes checking evidence adequacy and completeness, and Drata describes evaluating vendor evidence against criteria with structured, evidence-linked findings; this does not establish Keel's exact cross-version workflow in either product, but it does rule out using “they only collect documents” as the explanation of the difference. Describe the selected version-bound review transaction and retain the research qualification. citeturn1view3turn3view2
- **No new AWS residency or measured-performance overclaim is established.** The intended Sonnet 4.6 US inference profile is documented, but documentation does not demonstrate access, latency, or the complete Strands path on this team's account; D3 correctly gates that configuration and disclaims a whole-pipeline residency guarantee. The 10–17-second result is reported by [the AWS research note](02-aws-agentic.md), not independently reproduced here, and D3 §11 correctly separates it from the new configuration and end-to-end rehearsal. citeturn2search3
- **One user-behavior assertion still needs qualification.** D3 §5's “Controls that produce noise from documents” asserts an observed property without a measured evaluation; call those controls excluded by a design hypothesis. The §2 buyer/workload/pilot statements are already hypotheses, and the manual audit reconstruction in §1 remains within the explicitly synthetic scenario.
- **“Built” is still a plan label, not implementation evidence.** D3 §§8 and 10 precede the Saturday integration gate and build schedule, so the HTML explainer should label these capabilities planned for Saturday until the corresponding path is demonstrated; the research probe does not validate the task, projection, or disposition contracts.

## 5. Panel verdicts and final edits

These verdicts use round two's decision boundaries: a credible Box application, a defensible route toward bank use, and an executable three-minute submission, subject to the contract edits below.

| Panelist | Yes/no | Verdict |
| --- | --- | --- |
| **Box principal engineer** | **Yes** | The version-bound contribution and narrow Box integration are credible enough to build once historical status, task mapping, and failed-projection behavior are explicit. |
| **Bank head of technology risk** | **Yes** | The synthetic boundary, human-only disposition, bounded export and explicit pilot gates now support a defensible route toward bank use, with contradiction handling corrected before the demo. |
| **Hackathon judge, 50/30/20** | **Yes** | Three controls, a surviving-support counterexample and a real reasoned author handoff now make an executable and legible submission, with the existing integration gate and labelled replay retained. |

Make these five edits before freezing the HTML explainer and starting the build:

1. Define the reducer over separate current and historical reviews plus clause/reason inputs, count displayed outcomes, mark Not applicable future-only and `superseded` unsupported, and block Verify while evidence is contradicted.
2. Define the Box enum/last-review encoding and publication freshness check, model projection failure separately, and state that Box retains its last confirmed projection until a successful write, so consumers must check the authoritative current snapshot and publication outcome.
3. Specify the task's attached file, immutable task/assignment binding, authenticated response-to-action mapping, reason and due-date source, response/ingestion times and deduplication key, with Confirm finding recording an acknowledgment and Return to author requiring a successfully created author task.
4. Freeze the two text fixtures, all clause/location mappings and severity values, correct “nine” to “ten” profile fields, and add explicit acceptance expectations for history selection, contradiction precedence, incomplete input, missing/duplicate findings, projection failure and the actual return/fallback outcomes.
5. Qualify the remaining competitor and noise assertions, label unverified build capabilities as planned, and align the demo card with both missing key-management clauses and both supported recovery clauses.
