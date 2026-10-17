# Adversarial review of Keel design v1

**Verdict on the current spec: revise before building.** The promising product is a version-bound review queue for changes to documentary evidence. The spec sells continuous compliance and an auditor-ready change population before it defines complete observation, coherent snapshots, or authenticated decisions. Its most defensible demo is two similar document edits producing different, explainable review outcomes.

This is a design review, not an implementation audit or a tenant test. The three panelists below are simulated adversarial perspectives. Findings distinguish contradictions, unsupported claims, and missing contracts; an omission does not establish that an implementation is already defective.

Source key, with section references and occasional line numbers:

- **D:** [10-design-v1.md](10-design-v1.md), the primary target.
- **B:** [00-brief.md](00-brief.md), including the six-hour constraint and the 50% technical execution / 30% business value / 20% presentation rubric.
- **E:** [01-enterprise-problem.md](01-enterprise-problem.md).
- **A:** [02-aws-agentic.md](02-aws-agentic.md).
- **X:** [03-box-ai.md](03-box-ai.md).

The research is evidence to interrogate, not unquestioned authority. Its vendor claims, absence-of-evidence conclusions, unverified tenant capabilities, and reported probes retain those qualifications. Limited public-documentation checks are identified as W1–W4 in section 2; the local probes were not rerun.

## 1. The ten most damaging objections, ranked

### 1. “Your rule rejects exactly the regression I care about.”

**Raised by:** Bank head of technology risk.

**Why it lands:** D §4 requires a previously cited quote to disappear before a finding can be `Regressed`. Keep “All customer data is encrypted with customer-managed keys” and append “The analytics export is exempt and uses unencrypted storage.” The old quote still matches, but its sufficiency has changed. Conversely, a faithful paraphrase removes the literal quote without removing the commitment. `Contradicted` could represent the first case, but D does not specify a transition from `Verified` to that state; its diagram routes that state through `Not evidenced`. The literal-deletion rule is useful evidence of textual change, not a definition of control regression. E §3.2 also distinguishes documentary design evidence from actual operation.

**Concrete fix:** Separate the current documentary assessment (`Supported`, `Gap`, `Conflict`, `Unknown`) from its historical verification. A changed evidence bundle enters `Needs review`; a missing quote is one reason, not a prerequisite. Require the judge to assess scope, qualifiers, and counterevidence. Show “documentary support lost,” never “encryption failed.” Include both retained-quote contradiction and meaning-preserving paraphrase in the acceptance cases.

### 2. “Your human can approve evidence that is already obsolete.”

**Raised by:** Bank head of technology risk, backed by the Box principal engineer.

**Why it lands:** D §§3–4 bind quotes to individual versions but never bind the whole evaluation and human decision to one folder snapshot. A reviewer opens a finding for architecture v3; a colleague uploads v4; the reviewer clicks Verify. What rejects the stale action? Likewise, A §3.4 explicitly searches the “latest version” of each file: a run can combine documents read at different moments. Finding replacement evidence in another file does not transfer a prior human approval to it. The UI needs a state while the latest revision is being evaluated; otherwise the old green badge can imply current verification. These are design gaps, not demonstrated runtime bugs.

**Concrete fix:** Capture a manifest of file IDs, version IDs, and hashes, plus the control-profile version. Fetch against that manifest. Bind findings, evidence sets, and reviewer actions to its evaluation ID. Recheck the manifest before accepting a decision or publishing current status; reject stale decisions. Preserve “Verified for snapshot X” as history and show the current snapshot as pending. For the demo, serialize one folder and test a stale approval plus a late result from an older run.

### 3. “The new document that invalidates the design is outside your mandatory checks.”

**Raised by:** Bank head of technology risk.

**Why it lands:** D §3 guarantees re-checking controls whose existing evidence cites the changed file. A newly uploaded contract has no such references. It can introduce a US processor while C3 remains supported by an EU-only architecture statement. The spec promises the contradiction beat in §6 without guaranteeing the corresponding check. A §3.1 includes an additional new/changed-content selection branch that D does not specify. File removal, move-out, restored versions, and control-profile changes also lack defined invalidation behavior. “On any new file” is an intended outcome, not a complete selection algorithm.

**Concrete fix:** At demo scale, evaluate every control against every readable file in the captured folder snapshot. Cut selective assertion extraction and impact routing. Reevaluate on membership, version, or control-profile change; treat incomplete reads as `Unknown`. Explicitly limit the prototype to changes observed during the session. Add dependency optimization only after full evaluation is correct.

### 4. “I can assemble most of this with Box. What exactly did you invent?”

**Raised by:** Box principal engineer.

**Why it lands:** X §§1–2 already describes multi-file Q&A, referenced extraction, AI-generated metadata, branching, folder iteration, approval tasks, and workflow history. Public Box documentation also supports multi-file questions and rich Automate workflows [W1, W2]. D §8's categorical “Automate cannot” claim invites a platform expert to demonstrate a composition using custom connectors. X supports a narrower distinction: no documented native, persistent control-evidence lifecycle across versions. It does not prove Box cannot implement one. Upload → AI → approval → timeline, by itself, is a weak technical-execution story.

**Concrete fix:** Replace the competitive claim with: **“Keel adds version-bound control-evidence history and re-review rules to a Box workflow.”** Acknowledge the native features in one sentence. Demonstrate two removals: one loses all supporting evidence; the other remains supported elsewhere in the folder. Then show the exact evaluation and human-response binding. That proves a specific application contribution. **No fix for a claim of an uncopyable platform moat; cut it.**

### 5. “Your export cannot tell me which changes you failed to review.”

**Raised by:** Bank head of technology risk.

**Why it lands:** D §§3 and 5 record status changes but promise the complete population of changes. A revision with an unchanged verdict, a failed evaluation, or a new evidence version with the same status could disappear from that export. E §3.3's sampling argument depends on a complete population, not just exceptions. D's button/polling trigger can miss intermediate versions; the one-version-plan workaround only preserves versions actually fetched. An append-only application convention in a local JSON file neither proves completeness nor prevents rewriting by its operator.

**Concrete fix:** Record every observed revision, evaluation start/result/error, evidence-set update, and human action, even if status does not change. Include observation time, source modification time, snapshot ID, coverage, and projection-write outcome. Export “observed revisions and review outcomes” for the demo and visibly disclose observation gaps. A bank pilot additionally needs source reconciliation, retention, access controls, and independent integrity protection. Do not claim those properties from a hash, DynamoDB, or Object Lock alone.

### 6. “A named button is not an authenticated reviewer or authorized risk owner.”

**Raised by:** Bank head of technology risk.

**Why it lands:** D §9 claims Box identity and separation of duties, while §7's build and §11's milestones do not implement a reviewer identity flow. X §6 says the CCG service account is its own user. Its identity cannot establish who clicked in Keel. A disabled button proves a UI condition, not server enforcement. `Reviewer ≠ uploader` also fails when an integration account uploads for the author or a finding depends on several authors' documents. Finally, a right to view a file does not establish authority to accept a bank risk. Publishing contract excerpts into a more widely visible folder or comment introduces a separate permission question.

**Concrete fix:** Cut `Accept risk` from the demo. Use one genuine Box review task assigned to a named user; read the responding identity and decision from Box, and bind the task to the immutable finding. For a gap, completion acknowledges review and leaves the gap open. Check authorization on the server; never trust a submitted reviewer ID. Restrict the synthetic demo folder to the same audience. If real user/task access fails, label the human step simulated and remove identity-enforcement claims. Production authorization and cross-document disclosure checks remain pilot gates.

### 7. “A matching quote proves that words exist. It does not prove your verdict.”

**Raised by:** Box principal engineer and bank head of technology risk.

**Why it lands:** D §3 drops invalid quotes without specifying that the associated `Satisfied` finding must fail. “Encryption is required” can string-match perfectly while describing a requirement rather than the proposed implementation. A compound control can remain only partly evidenced. The claim “not anywhere” in the demo is stronger still: a failed phrase search does not prove absence across paraphrases, diagrams, unreadable files, or truncated input. X §1 explicitly warns of silent input truncation. D never selects a parser or defines support for the mixed document formats and diagrams implied by E's control list.

**Concrete fix:** Support a declared text format for the prototype. Inspect the complete text of the two demo files, recording coverage and read failures. Reject or downgrade the whole finding to `Unknown` when required evidence fails validation; do not merely remove the quote. Preserve the source text and offsets used for validation. Require every clause of a control to be supported, and use “no supporting evidence found in these evaluated versions.” Treat model confidence as uncalibrated or omit it.

### 8. “You budgeted the demo around a benchmark for a different pipeline.”

**Raised by:** Hackathon judge, on the 50% technical-execution score.

**Why it lands:** A §1.3 reports one easy synthetic judge case per model, with Sonnet 4.6 taking 17.1 seconds. It does not time Box download, parsing, Guardrails, an extraction model, tool calls over five files, ledger writes, and metadata projection together. D §6 gives the whole path roughly 20 seconds. X leaves metadata creation and tenant capabilities unverified, while D waits until hours 2.5–4 to integrate Box. The build also advertises Box AI in one section and uses direct Bedrock extraction in another. Canned findings plus a canned trace can conceal a broken live path if their provenance is not visible.

**Concrete fix:** Make the first 30 minutes a real integration gate: retrieve baseline and candidate content, call the chosen Bedrock model, write/read Box metadata, and validate the human-task path. Keep one model, two documents, three controls, and one findings screen. Measure upload-to-visible-result separately from model time. Label `Live`, `Replay`, or `Mock` persistently; a fallback recording must show its original run identity. Count technical credit only for the demonstrated path.

### 9. “You promise a data boundary your own model configuration does not provide.”

**Raised by:** Bank head of technology risk.

**Why it lands:** D §9 says data stays in-region. A §§1.1 and 6 instead select `global.` inference profiles and explicitly warn about geographic routing. AWS documents global routing across commercial Regions [W3]. Box content also leaves Box for the laptop, model request, and local ledger. The snapshot workaround creates another copy needing a lifecycle. D's Guardrails step covers document text before the agent, but its tools can fetch other documents; it does not define coverage of every read or fail behavior. Passing a filter is not evidence that all indirect instructions were neutralized.

**Concrete fix:** State that the hackathon uses synthetic documents and name the actual processing/storage path. Cut the in-region and “stays in the tenant” claims. For a bank pilot, choose and verify permitted model routing and every storage/logging destination; a geography profile is not a single-Region guarantee. Treat all retrieved document content as untrusted, constrain tool IDs to the snapshot, and give the model no approval or arbitrary-write capability. If Guardrails are unavailable, remove the “passed” trace step. Define whether PII is blocked or redacted without breaking source-quote validation.

### 10. “You end by accepting the problem instead of proving that anyone saves work.”

**Raised by:** Hackathon judge, backed by the bank head of technology risk.

**Why it lands:** D §6 spends its human-action beat clicking `Accept risk`, then tours a timeline and a production architecture. That can read as “AI raises an alert; a person dismisses it.” E §§1.4 and 4 explicitly qualify review-volume and incident evidence; there is no measured reduction in review time or false-alarm load. Three successful runs of the same planted deletion are rehearsal, not accuracy evidence. For a judge who has seen fifty document-reading demos, neither a hash nor a model name establishes business value.

**Concrete fix:** End with an accountable review outcome: the reviewer acknowledges the exact evidence gap, which remains open. Show a negative control that avoids an unnecessary regression alert. Report elapsed time and reviewer actions on that demonstration without generalizing to bank-wide savings. Propose a bounded shadow evaluation against manual review, measuring missed changes, false alerts, review time, and unresolved gaps. Remove team biographies, decorative timeline animation, and the service-name tour before removing the counterexample.

## 2. Internal contradictions and unsupported claims

**Classification:** “Contradiction” means the supplied material conflicts. “Unsupported” means the cited research does not establish the claim, not that the claim is necessarily false. “Missing contract” means the intended behavior is stated without enough rules to implement or test it.

| Claim or contract in the spec | Cross-check and classification | Required correction |
| --- | --- | --- |
| **“Data stays in-region on Bedrock.”** D §9, line 115. | **Contradiction.** A §1.1 chooses global profiles; A §6, line 560 explicitly acknowledges their routing implications. W3 confirms global routing is not confined to the source Region. | Name the actual profile and allowed processing geography. Remove the claim from the demo. |
| **“Nothing in Box, Confluence, Vanta, or the review board's process notices.”** D §1. | **Contradiction / unsupported universal.** E §§4 and 7 describe Confluence apps that invalidate approval after edits. E §3.4, lines 223–225 explicitly labels the Vanta/Drata conclusion absence of evidence. No research establishes what every review board notices. | Say existing approval history may not explain which control lost support; do not claim universal non-detection. |
| **“Prime Security / Seezo … threat-model one document at a time.”** D §8. | **Unsupported.** E's summary and §7 discuss design-stage positioning and integrations, not a demonstrated single-document product limit. | Describe Keel's selected workflow. Remove claims about competitors' maximum capabilities. |
| **“Automate cannot” perform the stated control reasoning.** D §8. | **Overstatement of X.** X §2 distinguishes native workflow steps from custom-agent compositions and acknowledges multi-file Q&A in §1. W1–W2 reinforce that overlap. | Use “we did not find a documented native version-bound control-evidence ledger.” Do not turn missing documentation into architectural impossibility. |
| **Ten controls mapped to ISO, PCI DSS 4.0, GDPR, and DORA.** D §3. | **Unsupported as a validated control library.** E §2.3 calls several clause mappings unsourced; different controls map to different frameworks. E uses PCI DSS 4.0.1. Its sample C1 requires encryption and a stated key model; it does not establish customer-managed keys as a universal regulatory requirement. | Call these illustrative internal ARB criteria, version the profile, and review mappings before presenting them as authoritative. Label CMK as the demo organization's policy. |
| **The bank role and need are established well enough for a pilot.** D §§2 and 9. | **Partially supported, unvalidated demand.** E identifies plausible review roles and workflows, but its volume estimates are unverified and its regression examples mostly vendor-sourced. Neither the buyer nor willingness to deploy Keel has been validated. | Present a buyer hypothesis and a shadow-evaluation proposal, not discovered product-market fit or proven savings. |
| **New files are evaluated, including the new-contract contradiction.** D §§3 and 6. | **Missing contract / research omission.** D specifies only the mandatory existing-evidence dependency set. A §3.1 additionally includes controls matched by new or changed content. | Evaluate the whole small profile. Define behavior for newly uploaded files and membership changes. |
| **A vanished quote is required for `Regressed`.** D §§3–4. | **Internal semantic conflict.** The product promises substantive re-verification, but this gate excludes retained-text contradictions. A repeats the same limitation; repetition does not validate it. | Make literal disappearance an evidence-change reason, not the gate for invalidating prior documentary support. |
| **Dropping a bad quote leaves a valid typed finding.** D §3, line 29. | **Missing contract.** A §3.3 suggests dropping the quote and lowering confidence, but neither document forbids an evidence-free `Satisfied` result afterward. | Fail the complete finding when required support is invalid. Validate both sides of a conflict; verify a “missing” quote really belongs to the authoritative prior evidence set. |
| **Only code owns state.** D §8. | **Missing enforcement detail.** A's example schema lets the model supply `previousStatus`, and its suggested system prompt asks the model to perform mandatory tool calls. A typed output does not prove either property. | Read prior status from the ledger. Check required control coverage, evidence provenance, and read coverage in code before applying findings. Ignore model-supplied authority fields. |
| **`Verify`, `Override`, `Re-verify`, and `Accept risk` have well-defined outcomes.** D §§3–5. | **Missing contract.** Accepted risk has no explicit state, risk-owner authority, renewal/expiry transition, or rule preventing it from appearing Verified. The diagram also omits several transitions from Verified, including evaluation error and conflict. | Cut risk acceptance. Define a small transition table, with pending/error states and reviewer acknowledgment distinct from verification. |
| **File-version citations establish a coherent folder decision.** D §§3 and 5. | **Unsupported guarantee.** A §3.4, line 370 searches latest file versions. No manifest, profile version, stale-decision rejection, or evidence-set version is specified. | Freeze the evaluation manifest and bind human actions to it; keep historical verification visibly separate. |
| **The CSV is the full list of changes an auditor requests.** D §§2 and 5–6. | **Contradiction.** D only commits to status-change events; E §3.3 requires the full change population. Unchanged statuses and failed/unobserved evaluations are not that population. | Export all observed runs and revisions, disclose gaps, and stop calling the prototype population complete. |
| **A local append-only ledger is auditor-ready.** D opening, §§2 and 9. | **Unsupported.** E §3.1 requires approved, access-restricted, versioned evidence. D explicitly defers production storage and does not define integrity, retention, or completeness verification. | Say “application-appended demonstration history.” Keep stronger audit claims as acceptance criteria for a future pilot. |
| **Snapshotting on detected uploads cures a one-version plan.** D §12. | **Incomplete mitigation inherited from X §6.** It can preserve the baseline captured before replacement. It cannot recover unseen intermediate versions or guarantee an old Box-version link remains retrievable. E §6 separately flags duplicated document stores as a buyer concern. | Capture and verify the demo baseline before upload. Label local snapshots as local; do not claim uninterrupted history or native retrieval of retired versions. |
| **Box AI extraction and multi-file Q&A are advertised alongside direct Bedrock extraction/judgment.** D §7, “What Box and AWS each do.” | **Unresolved scope and responsibility.** The build paragraph uses Haiku extraction and a Sonnet judge. A recommends that direct Bedrock pipeline; X recommends Box AI extraction/Q&A. Both could coexist, but D combines them without assigning responsibilities or budgeting both. | Pick direct Bedrock for this demo and remove Box AI calls from the built list, or explicitly replace a stage with a tenant-tested Box AI call. The brief requires Box and AWS, not two extraction systems. |
| **Box AI references are sufficient for version-pinned evidence.** D §7 if that optional path is used. | **Unsupported.** X §1 lists item/page/text references, not a guaranteed evaluated file-version ID; the ask schema supports file IDs and supplied text [W2]. | Verify the endpoint's version semantics, or validate output against separately pinned content. Item identity alone is not version identity. |
| **A reviewer can work in Box or Keel; Box identity supplies the human step.** D §§5, 7 and 9. | **Missing integration.** X §2 explicitly says task decisions do not automatically update metadata; X §6 distinguishes managed users from service accounts. D schedules no task-assignment/decision ingestion or user-authentication work. | Choose Box tasks as the single real human surface, poll and validate the response, and derive identity from it. Do not show two unfinished approval paths. |
| **Registering Keel as an AI Studio agent makes Automate call the external Strands service.** D §7, slide-only. | **Unsupported, including in X's positioning paragraph.** X documents custom Box AI agent configuration and separately describes HTTPS outcomes/custom connectors. Neither demonstrates registration of an arbitrary external Strands endpoint as a Studio agent. W4's create-agent schema does not establish that external-runtime contract. | Draw a proposed Automate HTTPS/custom-connector call to Keel, with auth and completion handling marked untested. Remove the registration claim until a working integration proves it. |
| **AgentCore Policy forbids all agent writes of Verified.** D §7, slide-only. | **Missing enforcement path.** A §1.4 locates policy enforcement at Gateway. D's slide omits Gateway and retains application/SDK writes. A Gateway policy is not evidence that every direct write is mediated. | Keep Verified enforcement in the application authorization/state layer. Show Gateway Policy only for calls actually routed through it. |
| **10–17 seconds and $0.002–$0.07 characterize the evaluation.** D §10. | **Supported only as the reported probe.** A §1.3 has one synthetic case per model; A line 7 says scripts are in an uncommitted temporary directory. It is not an end-to-end five-file pipeline benchmark or a held-out accuracy result. | Quote the precise probe boundary and per-model observation. Measure the actual demo separately; preserve the fixture, results, model ID, and run settings in the eventual build. |
| **Structured findings imply guaranteed constrained output on every selected model.** D §7 could be read this way. | **Qualified in A, not a blanket guarantee.** A §1.2 says accepted schema parameters on 5.5 models do not establish constrained decoding; its Strands fallback caveat is explicit. D's default Sonnet 4.6 is consistent with that recommendation. | Keep the default; claim schema validation, not universal decoding guarantees. Handle validation failure explicitly. |
| **Guardrail passed, 23 assertions, three findings, 11.4 seconds.** D §5. | **Illustrative, not measured evidence.** A §1.5 says no guardrail was created in the account. Its reported Sonnet probe is 17.1 seconds. Fixed trace copy is acceptable for a labeled mock only. | Populate live trace rows from actual events and timestamps. Label fixture values and replay traces. Never show “passed” for a skipped check. |
| **Input PII processing and exact quote matching fit together automatically.** D §§4 and 7. | **Unresolved design choice.** A §3.7 proposes PII masking on output, while its pipeline also mentions input filtering. D does not choose block versus mask or explain matching redacted text to the original. | Keep canonical source text separate from any redacted display; define failure behavior and where original text may be retained. Use synthetic data for the demo. |

Two research traps should not be copied into the production slide:

- **Webhook name and delivery semantics:** A §4 uses `FILE.NEW_VERSION`; X §5 lists no such V2 trigger and marks new-version behavior of `FILE.UPLOADED` unverified. D avoids naming the trigger, which is appropriate. Do not reintroduce the unsupported name. Also, placing received events in a FIFO queue does not itself establish source-version order or deduplicate re-deliveries; reconcile against version IDs.
- **Regulatory assertions are not independently established by this research:** E §6's SR 11-7 applicability statement comes from a vendor source, and E flags some framework mappings as unsourced. The review therefore recommends requirements for a proposed bank pilot without asserting that these are a definitive legal classification of Keel.

### Limited public-documentation checks

These checks support specific objections; they do not validate the whole research pack or the hackathon tenant.

- **W1 — Box, “Triggers, outcomes, and logic in Box Automate.”** Documents AI steps, routing, logic, and native outcomes, reinforcing substantial feature overlap. Source: `https://developer.box.com/guides/box-automate/triggers-and-logic`
- **W2 — Box, “Ask question,” API reference.** Documents `multiple_item_qa`, file inputs/supplied content, and citations. This supports multi-file overlap but does not establish a persistent version-bound control ledger. Source: `https://developer.box.com/reference/post-ai-ask/`
- **W3 — AWS, “Route model inference requests across AWS Regions with cross-Region inference.”** Distinguishes geography-bound and global routing; global inference can process requests across commercial Regions. Source: `https://docs.aws.amazon.com/bedrock/latest/userguide/cross-region-inference.html`
- **W4 — Box, “Create AI agent,” API reference.** Describes Box agent configuration, including model/prompt settings; the documented schema does not establish arbitrary external Strands-service registration. Source: `https://developer.box.com/reference/post-ai-agents/`

## 3. The weakest 30 seconds, and its replacement

**Weakest interval: 1:30–2:00.** This includes the end of the disappearance explanation and the 1:40–2:00 disabled-button / `Accept risk` beat in D §6.

The three panelists hear different failures in that interval:

- **Box engineer:** “You have shown deletion plus a workflow action. I already have those building blocks.”
- **Risk head:** “You found an unresolved security-design gap and celebrated granting an exception without establishing who can grant it.”
- **Judge:** “The promised human judgment was a disabled button followed by dismissal; I still have not seen why the agent is better than a text diff.”

### Replacement beat, 1:30–2:00

Prepare one upload that removes two statements from the architecture document: the sole encryption/key-management statement, and a recovery statement that is also present in the runbook. Evaluate both documents in the same run. The second result proves that removal from one document need not mean loss of folder-level support. Label it `Supported · review pending` if its evidence binding changed; do not silently transfer historical verification.

| Time | Exact narration | On-screen action |
| --- | --- | --- |
| 1:30–1:40 | “This upload removed two statements. Encryption lost its evidence. Recovery still has support in the runbook. The agent found one evidence gap, not two.” | Show the two current findings side by side: the prior encryption quote and its missing support; the recovery quote pinned to the runbook version. |
| 1:40–1:52 | “Priya reviews the encryption finding in Box and acknowledges the gap. That records her decision; it does not make the control green.” | Complete the real, already-assigned Box review task whose instructions identify the finding and snapshot. Poll its response; show the actual responding user's name. |
| 1:52–2:00 | “Here is her response, bound to these document versions. The gap stays open until new evidence is reviewed.” | Expand the resulting event: user, task/finding ID, snapshot, timestamp, and unchanged open-gap status. |

Use “Priya” only if that is the actual demo identity; otherwise use the signed-in user's real displayed name. The task wording must mean acknowledgment of this finding, not approval of the architecture. If the human step is simulated, say so and do not claim authenticated enforcement.

This beat needs no second live model run. Both findings come from the earlier upload. Pre-stage the task tab after task creation and rehearse its actual response latency. The following timeline beat becomes a short event-detail/export view, because the rewritten beat has already established who reviewed what.

### Keep the entire demo within three minutes

| Time | Purpose |
| --- | --- |
| 0:00–0:15 | One speaker: “Approved design evidence can change after review. Keel shows which controls need another look.” State that this is a synthetic ARB example. |
| 0:15–0:40 | Show the verified baseline, two Box files, three internal controls, and the candidate upload. Identify the specific baseline versions. |
| 0:40–1:10 | Run the real evaluation. Show actual fetch/validation/tool events, coverage, and elapsed time; narrate the old evidence while it runs. This is a rehearsal budget, not a promised latency. |
| 1:10–1:30 | Inspect the encryption finding and its before/after evidence; show the real Box metadata write-back. |
| 1:30–2:00 | Perform the replacement beat above. |
| 2:00–2:20 | Show one compact event record and the observed-run export, including an unchanged result. |
| 2:20–2:40 | Three architecture boxes: Box content/review, Bedrock assessment, application validation/history. Clearly label local storage and prototype limits. |
| 2:40–2:50 | State the proposed shadow-evaluation measures: missed changes, false alerts, review time. |
| 2:50–3:00 | Close: “Know which design evidence changed, and who reviewed that exact version.” Leave room for a slow click. |

Do not add the optional new-vendor contradiction upload. Keep it as a prepared acceptance case or an answer to questions. If the run exceeds its rehearsed budget, switch explicitly to a labeled recording of the real path; do not let a canned trace impersonate a live run.

## 4. Six-hour scope: what to cut first

Three people provide at most 18 person-hours, but credentials, tenant capabilities, shared contracts, and final integration remain on a shared critical path. D §11 leaves its first real Box integration until almost halfway through the clock. B's 50% technical-execution weighting makes that the wrong risk order.

### Cut order

| Order | Cut or reduce | Keep instead |
| --- | --- | --- |
| **1** | Risk acceptance, expiry handling, override variants, and two independent reviewer interfaces. | One Box review task that acknowledges a version-bound finding and leaves an unresolved gap open. |
| **2** | Ten controls, five documents, framework-badge breadth, generic bring-your-own profiles, PDF/DOCX/diagram handling, and the second live contradiction scenario. | Three fixed internal controls and two small text documents; include a real counterexample to naive deletion detection. |
| **3** | Haiku extraction plus Sonnet judgment, semantic assertion IDs/diffing, selective impact routing, model switching, and escalation. | One rehearsed Sonnet 4.6 path; compare prior cited text deterministically and assess the complete small profile against pinned files. |
| **4** | Duplicate Box AI extraction/Q&A alongside Bedrock, AI Studio registration, and Automate integration work. | Genuine Box retrieval, version identity, folder metadata, and human-task response plus genuine Bedrock judgment. This meets B's Box-and-AWS requirement. |
| **5** | Ten-lane graphical timeline, separate auditor screen, per-file metadata rollups, and polished evidence-pack generation. | One findings view with expandable events and a small CSV export; folder metadata supplies the native Box status view. |
| **6** | Mandatory Guardrails setup if it is not already working, verbose trace animations, and uncalibrated confidence displays. | Synthetic documents, constrained reads, server-owned state, exact evidence validation, and a trace of actual tool/results/timing events. Remove any claim about an absent Guardrails check. |
| **7** | Any attempt to promote slide-only hosting, Memory, Identity, Gateway, Policy, Evaluations, S3 Object Lock, or OSCAL into the build. | A compact, clearly proposed production path. These were already outside D's build; keep them there and shorten the architecture tour. |

**Do not cut:** exact source identity, source-quote validation, complete coverage of the tiny declared input set, stale-action rejection, a real Box/Bedrock path, honest live/mock labeling, or recording evaluations that do not change status. Those are the proof behind the claim.

### Replacement build plan

| Elapsed time | Deliverable and stopping rule |
| --- | --- |
| **0:00–0:30** | All three verify the tenant/account path: capture a real baseline, obtain candidate text/version identity, call the chosen model, write and read folder metadata, assign/respond to a Box task. Establish whether prior versions are retained. If history is unavailable, capture a local baseline before uploading and label that limitation. If a capability is unavailable, remove its claim immediately. |
| **0:30–2:00** | Split into three lanes: one builds Box/snapshot/task plumbing; one builds the single-model assessment and evidence validation; one builds the findings/event UI and synthetic fixtures. Agree the manifest, finding, and event shapes before parallel work. |
| **2:00–3:00** | Integrate one real path from candidate upload to Box status projection and named task acknowledgment. Include pending/error states and reject a changed snapshot. Stop adding features until this works. |
| **3:00–4:00** | Exercise the acceptance cases below; fix incorrect or stale results. Measure full-path latency and capture the live trace. Add CSV export only after the core path passes. |
| **4:00–5:00** | Freeze scope, rehearse the three-minute sequence, prepare a clearly labeled recording, and check metadata/task refresh behavior. |
| **5:00–6:00** | Rehearse on the presentation laptop, finish the submission/README, and keep the final buffer for integration failures. No new infrastructure. |

Minimal acceptance cases, selected to challenge the product claim rather than inflate a pass count:

| Case | Required outcome |
| --- | --- |
| Sole supporting statement removed. | Gap identified, prior quote/version shown, current assessment requires review. |
| Equivalent paraphrase or support in the other file. | No lost-support alarm solely because an exact string vanished; replacement evidence is cited and any changed approval binding stays pending. |
| Old quote retained but a conflicting exception added. | Conflict/review required despite the successful string match. |
| A file cannot be read, or the model supplies a fabricated quote. | Coverage/evidence failure is visible; no unsupported positive finding is applied. |
| Version changes before reviewer acknowledgment or result publication. | Stale action/result cannot establish the current revision's status. |
| A revision leaves control status unchanged, or the same revision is retried. | The observed evaluation remains traceable; retries do not produce duplicate decisions or roll status backward. |
| An agent output requests Verified, or an ineligible actor attempts the human action. | The server rejects the transition; a disabled UI control is not the test. |
| Box metadata write-back fails after the evaluation is recorded. | The event remains recorded and the UI shows projection failure; no claim that Box reflects the new result until write-back succeeds. |

These are small synthetic contract checks, not measured production precision. Record actual outcomes and failures. Three repeats of the deletion fixture establish repeatability only.

### Keep the bank pilot outside the hackathon promise

The six-hour result can justify a synthetic-data demonstration and a discussion with an ARB reviewer. Before any pilot using real bank documents, the risk panelist would require a defined data-processing boundary and retention policy, authenticated authorization and disclosure controls, source-history reconciliation, an independently reviewable event record, and a representative evaluation against manual review. These are proposed acceptance conditions, not a claim that the prototype already meets a regulatory standard.

For the judge's **50/30/20** rubric: spend the technical half on a working integration and falsifiable edge cases; earn business value through a concrete reviewer action and a credible measurement plan; use presentation time to make the before/after evidence legible. Additional AWS service names do not substitute for any of those proofs.

## 5. Would each panelist be convinced after the fixes?

“After the fixes” means the reduced, working hackathon slice above, with production requirements explicitly deferred.

| Panelist | Verdict | One-sentence reason |
| --- | --- | --- |
| Box principal engineer | **Yes** | A working version-bound evidence lifecycle is a credible application complement to Box, although most components are native building blocks and the result establishes no durable platform moat. |
| Bank head of technology risk | **No** | The narrowed demonstration merits a synthetic-data evaluation, but a pilot using bank documents still lacks proven authorization, data-boundary controls, history completeness, and representative accuracy. |
| Hackathon judge | **Yes** | The real Box-to-Bedrock path, counterexample, and named version-bound response provide technical substance for the 50% category, a specific reviewer benefit for the 30%, and a clear three-minute story for the 20%. |
