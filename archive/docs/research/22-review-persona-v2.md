# 22. Persona review of Keel v2: Dana Okafor, round two

Reviewer: Dana Okafor, Principal Security Architect, Architecture Review Board. Mid-size US bank, about $60B in assets, OCC-supervised.
Inputs: `20-design-v2.md` (full read), `11-review-codex-v1.md` (skimmed for where the other panel pushed), my own `12-review-persona-v1.md`.
Date: 2026-10-16.

You listened. That is rarer than it should be, so I will say it once and then get back to work. v2 is a product I could describe to my Head of Technology Risk without being embarrassed. It is not yet a product I would let my reviewers use for a week without hearing about it. Most of what follows is first-week breakage, not philosophy.

---

## 0. Verdict in one paragraph

The three things that would have made me walk out are gone: no machine "Satisfied," no one-click risk acceptance, no cross-region inference profile. The three things that make me want it are now in the spec: the machine never writes the human field, every evaluation including no-change lands in the ledger, and the finding card shows the requirement text, the struck sentence, and who verified what against which version. What is still wrong is operational. The display function in section 4 is missing the most common row in the table (the happy path after a re-check) and has no row at all for `evidence_contradicted`, `compensating_control`, `exception_approved`, or `superseded`. Staleness is keyed to the snapshot, so every upload of any file makes all eight Verified rows stale and my reviewers re-acknowledge eight controls per upload. Separation of duties is still "not the uploader," which I rejected in round one. The exception record is missing the residual rating and the IRM reference, and `exception_approved` has no stated owner, which means it is "Accept risk" with a better name unless you gate it. Fix the display function and the staleness rule and I will take this to my CISO for a shadow evaluation.

---

## 1. My five demanded changes

### 1. Two-field status, no machine "Satisfied," never green

**Resolved.** v2 section 4: "Machine assessment (recomputed every snapshot, always labelled machine, never green)" with `evidence_found / weakened / absent / contradicted / not_evaluated`, and a separate human disposition. Section 3.6 puts them in two separate Box metadata fields and says the human field is written "only through the human action path." Section 4 rules: "No code path writes `verified` except the human action handler." Top-line counts are human counts. That is exactly what I asked for.

**Residual gap.** The display function is incomplete (section 2 below). Resolved as a model, not yet as a table.

### 2. Replace "Accept risk" with a routed exception; add Return to author, N/A, Compensating control, Mark false positive

**Resolved in shape, partial in content.** Section 3.7 lists all seven actions, role-gated and server-enforced. "Request exception (opens an exception record with risk owner, approver, compensating control, expiry; status becomes Exception requested, never Accepted)." Section 6 confirms "Accept risk" is removed. Good.

**Gaps.**
- The exception record lacks **residual risk rating** and **IRM reference**. Residual rating is what decides who the approver is at my bank. Without it, "approver" is a free-text name and the routing rule cannot be enforced.
- No stated rule that **risk owner is not the reviewer and not on the project team**. I wrote that rule in my mockup. It is one line of server code.
- No **maximum expiry**. Ours is 365 days. Put it in the profile so it is tenant-configurable.
- **Who sets `exception_approved`?** The disposition exists in section 4 and nothing in sections 3, 4, or 6 says who may write it. If any Keel user with the reviewer role can set it, you have rebuilt the Accept risk button. Either it is written only by the IRM mirror (production) or by a role that is not the ARB reviewer role (demo). State it.
- Jira creation on Return to author is deferred and said out loud in section 10. Acceptable.

### 3. Ledger records every evaluation including no-change; completeness reconciliation; tamper-evident export

**Resolved for the ledger, partial for completeness.** Section 3.5: "Every evaluation is recorded, including evaluations that change nothing and evaluations that fail." Section 6 export: "CSV of all observed revisions and outcomes, a manifest JSON with snapshot ids and a hash over the population, and population counts: revisions observed, evaluations run, evaluations failed, findings opened, human actions. Observation gaps are disclosed, not hidden." That is the sentence my auditor needs. Section 8 adds an event hash chain.

**Gaps.** Reconciliation against Box's own version list is deferred (section 10). Fine for Saturday; it is the first thing second line asks for in a pilot. No **period filter** on the export is mentioned. Timestamps are not stated as UTC anywhere in v2. I will keep saying UTC until I see it written down.

### 4. US bank control profile with the full field set; severity from tiers; trigger on submit, not every save

**Resolved for the profile.** Section 5: `profile-us-bank.json` version 2026.3, eight controls, "The AI is handed Requirement, Applicability, and Evidence, not the title alone. Severity is control tier times application tier." EU profile as alternate. Framework maps "labelled illustrative until reviewed by a compliance owner." Correct and honest.

**Nit.** Section 5 says "eight fields per control" and lists nine (ID, Title, Requirement, Standard, Applicability, Evidence, Tier, Framework map, Reviewer role). My mockup had ten with Profile version. Count them or someone on my board will.

**Partial for the trigger.** Section 3.1: "When a package is submitted or a new version is uploaded to the ARB package folder." That still fires on every version. It is acceptable only under an assumption you have not written down: the ARB package folder is write-restricted to the intake process, so nobody edits in place. At my bank that is true. At the next bank it will not be. Write the assumption into section 3 and make the debounce a config value.

### 5. Finding card rebuilt; drop confidence and duration; add classification, MRM model ID, US inference profile

**Resolved for most of the card.** Section 6 has requirement text, standard reference, change classification, basis bullets, model id, `us.` inference profile, prompt version and hash, two columns with uploader, version comment, Jira reference, section and page, word-level diff. Confidence and duration removed. Thread present.

**Gaps.**
- **MRM model ID** field is not mentioned. It can be empty in the demo but the field must exist, because the ledger event schema is what MRM reviews first.
- **Reviewer eligibility is still uploader-based.** Section 3.7: "The uploader of the evidencing file cannot verify it." Section 4: "uploader-not-reviewer." I said in round one that the uploader is a PM or a service account and this check gives false comfort. The rule is: reviewer holds the ARB reviewer role on the action date, and reviewer is not a member of the project team. For the demo, project team membership is a list in the project header. Not resolved.
- **Deep link to the Box preview at the page.** The card shows the quote; I still have to confirm in the real document. One link per column.
- **Normalization rules disclosed on the card.** "Quote not found after normalization" is a basis bullet. The first false "absent" I get will be a sentence that became a table cell. Show what normalization was applied.
- **ARB conditions as related rows.** Not adopted and not mentioned in the changelog. I accept it is out of scope for Saturday. Name it as deferred in section 10 so I know you heard it.

---

## 2. The two-field status model and the display function

### Would my board accept it as written

The model, yes. The table, no, because it is advertised as "published, not configurable" and it is not complete. Five machine values times eight human values is forty combinations; the table has ten rows. "Published" means every combination has a defined output or the board will fill the gaps by argument in the meeting.

### Rows that are wrong or missing

| Problem | Why I would hit it in week one |
| --- | --- |
| **No row for `evidence_found, unchanged` + `verified (earlier snapshot)`.** | This is the most common row in the whole system: a runbook gets a new version, the encryption control's quote in the architecture doc is untouched. What displays? If it is "Verified, stale" I re-acknowledge eight controls every time anyone uploads anything. It must display **Verified (re-checked on snapshot N, evidence unchanged)** and record a no-change event, with no human action required. |
| **No row for `evidence_contradicted` with any disposition.** | The other panel's objection number one was the retained-quote contradiction. The machine state exists; the display function never mentions it. Add `evidence_contradicted` + `verified (earlier)` = **Contradicted since verification, re-review due**; + `unreviewed` = **Pending review: conflict**. |
| **No row for `compensating_control`.** | A PCI compensating control is a normal disposition on my board. Display **Compensating control in place (ref)**, and re-check the compensating control's own evidence like any other. |
| **No row for `exception_approved`.** | Display must be **Exception in force until [date]**, and after the date it becomes **Exception expired, re-review due** with no new event. That means displayed status depends on wall-clock time, not only on ledger events. Decide now whether expiry is a scheduled event or a display-time rule. |
| **No row for `superseded`.** | Profile version changes. Display **Superseded by profile 2026.4, re-review due**. |
| **`evidence_found` + `returned_to_author`.** | The author fixed it in v4. The row must display **Returned to author, evidence now found: pending re-review**, not Verified. The table does not say. |
| **`not_applicable (approved)` implies a pending state** that is not in the disposition list. | Add `not_applicable_requested`. Display **N/A requested, awaiting second reviewer**. |
| **"any, newer snapshot pending" + `verified` = Verified, re-check pending.** | Correct. But it should also apply to `returned_to_author`, `compensating_control`, and `exception_approved`. Say "any human disposition," not "verified." |

### The structural problem: staleness keyed to the snapshot

Section 3.1 binds every evaluation and action to a snapshot id, and section 4 phrases staleness as "verified (earlier snapshot)." A snapshot changes when any file in the package changes. So uploading a corrected network diagram makes every control's verification "earlier snapshot."

Staleness must be keyed to the **evidence binding** (the file id and version id of the cited quote) and the machine classification, not to the snapshot. A verification is stale when the evidencing file has a new version **and** the classification is anything other than `unchanged`. If the evidencing file did not change, or changed and the quote is unchanged, the verification holds and a no-change event is written.

Then the board will argue about materiality, and here is where I would land: for Critical-tier controls, a new version of the evidencing file requires a human acknowledgment even when the quote is unchanged, because "the sentence is still there" does not mean "the sentence still means what it meant in context." For High and below, `unchanged` holds without a click. Put the threshold in the profile per control tier. That one rule is the difference between a tool my reviewers open on Monday and a tool they mute by Wednesday.

### The stale-action rejection

Section 3.1: "A decision on a stale snapshot is rejected by the server." Correct in principle. In practice: I open the card at 09:00, a PM uploads a corrected Visio at 09:10, I click Return to author at 09:15 and get rejected. I swear at the tool. The rejection must say what changed and offer to re-apply my action to the new snapshot when the control's evidence binding is unchanged. If the binding changed, make me look again. Do not make me look again because someone fixed a diagram.

### Legibility in three minutes (your open question 1)

Show the displayed status only on the folder view. Show both fields on the finding card, labelled. Never show the table in the demo. Say the sentence "the machine has its field, the human has hers, and the machine cannot write to the human's" once, at 1:45. That is all a room needs.

---

## 3. The finding card as redescribed, against my mockup

Section 6 adopts the mockup closely. Below is what I still would not accept the card without, plus one semantic problem you have not noticed.

**Still missing.**
1. MRM model ID field (may be empty in the demo).
2. Reviewer eligibility line showing role validity dates and "not on project team," not only name and role.
3. Deep link to the Box preview at the cited page, both columns.
4. Normalization applied, one short line under the "quote not found" bullet.
5. UTC on every timestamp.
6. Exception form: residual rating, IRM reference, risk owner not reviewer and not project team, max expiry.
7. Due date and aging in the header are described in the mockup and in your folder view, but the card header in section 6 lists "opened, due." Good. Add "days open" because I triage by it.

**The semantic problem: your hero is `weakened`, not `absent`.**
The 1:10 narration says v3 replaced the sentence with "all data is encrypted. No key model." Acceptance case 1 calls this "sole supporting statement removed: evidence_absent, removed." Acceptance case 4 defines `weakened` as "statement weakened (TLS version dropped)." A sentence that still addresses encryption at rest but drops the key management clause is the same pattern as a sentence that still addresses transport encryption but drops the TLS version. Under your own case 4, the hero is `evidence_weakened`. Your basis bullet even says "weaker statement found at section and paragraph."

Pick a rule and write it down: `absent` means no statement in any current file addresses the control's subject; `weakened` means a statement addresses the subject but fails one or more clauses of the Requirement. Under that rule the hero displays **Weakened since verification, re-review due**, which is honestly the better demo, because "weakened" is what AI rewrites do and "absent" is what a diff already catches. If you want the word "lost" at 1:10, change v3 so the sentence is gone entirely with no replacement. Either is fine. An examiner asking why the same pattern is `absent` in one finding and `weakened` in another is not fine.

---

## 4. The three-minute demo as a bank audience hears it

| Beat | How my colleagues hear it | What to change |
| --- | --- | --- |
| **0:00** "This is a synthetic bank example." | Relief. Bank audiences stop hunting for the data-leak the moment you say synthetic. | Keep. |
| **0:15** "Passed the review board on October 7. Eight controls, each verified by a named reviewer against these document versions." | Correct language. "Against these document versions" is the product in six words. | Put the ARB decision reference and the snapshot id on screen. Say "Tier 1, PCI-scoped" once. |
| **0:40** "Today a new architecture doc arrives." Upload. "Pins the snapshot, diffs the prior quotes, evaluates all eight controls against all five files." | Who uploaded it and why? "Arrives" is passive. Elapsed time on screen is good; we will all be watching it. | "The project team re-submits for the pre-deployment review with v3." Keep the elapsed clock. |
| **1:10** "Encryption at rest lost its evidence... The agent searched the other four files. Nothing." | Strong. The struck sentence next to "all data is encrypted" is the moment. "Nothing" is the one word that will get challenged: by someone who knows paraphrase exists. | Say "no statement addressing key management in the other four files." Add "Critical: a Tier 1 control on a Tier 1 application." Decide `weakened` versus `absent` (section 3). |
| **1:30** "The same upload also removed the rollback sentence. But the runbook still states it. One evidence gap, not two. A text diff would have flagged both." | Convincing to me, and it answers the question my Head of Technology Risk would otherwise ask at 1:12. One problem: the on-screen status is "evidence found, moved, re-review due." A bank reviewer hears "re-review due" and thinks: so I have to act on both anyway. What did you save me? | Add one sentence: "That one is a thirty-second acknowledgment that the binding moved to the runbook, severity Low, not an investigation." Show the severity chip. Otherwise the counterexample reads as two findings after all. |
| **1:45** Return to author via a Box task. | Half convincing, half theatre. The mechanism is right: a real Box task, a real identity, a real ledger event. The theatre is "Dana is the ARB reviewer" when Dana is a persona. Use the signed-in person's real name or the room will notice. The other gap: a Box task response is a completion, not a form. Where do the comment and the due date get captured? If Keel's card captures them and the Box task records only identity, say so in one clause. | Narration below. Show the author's view for three seconds: the Box task or the Keel card with the quote, the requirement, and the due date. "And then what" is the question the room is asking at 1:50. |
| **2:10** "Every evaluation is recorded, including the ones where nothing changed. This export is the list the auditor asks for." | This is my sentence and it lands. Show the counts. | On screen: "Revisions observed 3. Evaluations run 24. Findings 2. Human actions 1. Gaps 0." Say "observation gaps are disclosed" out loud; it is the most honest sentence in the demo. |
| **2:30** Architecture strip, built versus proposed labelled. | Good. Bank people trust a slide that admits what is not built. | Do not read the AWS service names aloud. Point at the labels. |
| **2:45** "Next: a shadow evaluation against manual review, measuring missed changes, false alerts, and review time." | The room hears "they know what a pilot is." | Add a number: "on fifty historical package revisions." |
| **2:50** Closing line. | Section 8 below. | |

### What I would say aloud at 1:45

Twenty seconds, first person, as the reviewer:

> "I am the reviewer on this package. The machine told me where to look. It did not tell me what to decide. I am returning this to the author with the sentence that disappeared, the requirement it has to meet, and a due date of October 23. That is recorded against these exact file versions, under my name and my role. Verify is disabled, and it is disabled for me too, because no document in this package currently supports the control. When v4 lands, Keel re-checks, and I review one paragraph."

Then the on-screen state changes: the row reads **Returned to author, open**, the top line reads "6 Verified, 1 Returned to author, 1 Verified: evidence moved, re-review due," and the ledger event shows name, role, snapshot id, UTC time. The word "open" is the point. Nothing closed. Nobody dismissed anything. That is the difference between this beat and the v1 "Accept risk" beat, and the room should feel it.

---

## 5. The US bank control profile

### The eight controls

Approved services only, data classification and regulatory scope, authentication and MFA via enterprise IdP, least privilege with PAM, encryption at rest and key management, encryption in transit with TLS minimum, security events to the enterprise SIEM, RTO/RPO consistent with the BIA tier.

Right call, with two conditions and one swap.

**Condition on "approved services only."** It is the best control on the list, and the most frequent real finding, but only if the approved catalog is inside the profile or attached to it as a versioned list. If the model is asked "are these services approved" with no list, it will guess, and it will guess that Amazon services are approved. Put a `catalog` array in the control's Evidence field with a version date. Then it is deterministic and the model's only job is to extract the service names.

**Condition on "RTO/RPO consistent with the BIA tier."** The BIA tier is not in the package; it is in the business continuity system. For the demo, put `bia_tier` in the project header so the Applicability field can reference it, and phrase the checkable statement as "RTO and RPO are stated in the runbook, match the architecture document, and are within the BIA tier's limits as given in the project header." That makes the counterexample legitimate: the runbook states it, the architecture doc dropped it, the binding moves.

**The swap.** I would swap **encryption in transit with TLS minimum** for **third parties named with TPRM assessment ID and tier**. Reasons: TLS-in-transit is the least interesting control to a board (it is always "TLS 1.2" and the finding is always a nag); third parties is the OCC 2023-17 control my examiners ask about first; it is checkable (vendor names plus IDs in the package against a list in the profile); and it is the natural home for the vendor-contradiction acceptance case you kept in reserve. If you keep TLS because it gives you the clean `weakened` acceptance case, I understand, but then make the hero `weakened` too and you have consistency.

### The nine fields

ID, Title, Requirement, Standard, Applicability, Evidence, Tier, Framework map, Reviewer role. Add Profile version at the profile level (you already have it) and fix the count. Two notes:

- **Applicability must be machine-evaluable.** "Applies to applications with a persistent data store holding Confidential or above" needs `has_persistent_store` and `data_classification` in the project header. Otherwise the model decides applicability from prose, and N/A becomes a guess.
- **Reviewer role is where this gets real for a board.** In the demo all eight route to Security Architecture. At my bank RTO/RPO is reviewed by Resilience, authentication by IAM Architecture, approved services by Cloud Platform. Routing by Reviewer role is a pilot feature, not a Saturday feature, but it is why the field exists. Say that if asked.

### The exclusions

Network diagram currency (images), contract matching (contracts live in the legal system), bare retention numbers (banks cite a Records Retention Schedule class). All three are right and the reasons given are the reasons I gave. One warning: PCI 1.2.3 and 1.2.4 (current network and data-flow diagrams) is the first thing a QSA asks for, so when someone asks "what about the diagrams," answer "diagram reading is deferred and we say so" before they finish the question.

### Where I side against the other panel

The Codex panel wanted three controls and two documents. I side with eight and five, with one condition: the live run must finish inside the rehearsed budget, and if it does not, cut files before cutting controls. A board reviewing three controls is not a board, and the counterexample needs a runbook to move to. Three controls would make Keel look like a linter with a ledger. Eight makes it look like a review.

I also side with the Codex panel on cutting the ten-lane timeline from the demo, and I want it back for the pilot. It is the picture an examiner understands in five seconds and the findings list is not.

---

## 6. Data handling and pilot gates

### Does the honesty land

Mostly yes. Section 8: "Document text leaves Box for the laptop and the Bedrock request in us-east-1 under a `us.` inference profile, and is stored in the local ledger. No 'stays in the tenant' claim." That is the sentence a bank wants, because it is the sentence we can evaluate. A vendor who tells me where my data goes in one line gets a meeting. A vendor who says "secure and compliant" gets a form.

Section 2's "Pilot approval at a bank runs ten to fourteen weeks and is gated by Model Risk Management intake and a data-classification decision" is my sentence from round one, and it is correct.

### Where it reads as a list rather than a plan

Section 10's deferred list mixes two kinds of item, and mixed together they read like a shrug:

- **Gates the bank owns:** MRM intake and validation, data-classification approval. These are not your work. Say "the bank runs these; we supply the model id, prompt, schema, and evaluation results."
- **Product work you owe:** completeness reconciliation, ServiceNow IRM integration, Jira creation, image and diagram reading, measured accuracy, production ledger integrity. These are yours. Put a rough order on them. Reconciliation and measured accuracy first, because second line asks for those before it asks for IRM.

Split the list in two and it stops reading as excuses.

### Four things section 8 does not say that I would ask on day one

1. **Name every copy.** Box (source), laptop snapshot, ledger (quotes embedded in events), Bedrock invocation logs if enabled, CloudWatch in the proposed architecture. "Defined retention for every copy" is right; list the copies so I can count them.
2. **Who can read the ledger and the findings.** A finding is a statement of a security weakness in a Tier 1 system. Access to the finding list is itself a control. Not mentioned.
3. **Documents are untrusted input.** Guardrails is out of the build, which is honest. But a design document can contain text addressed to the model. Say the mitigation out loud: the machine cannot write the human field, a fabricated quote fails validation, and the worst case of an injected document is a false `evidence_found` that a human must still verify against a quote they can read. That is a strong answer. Make it.
4. **What happens to a 120-page package.** Section 3.2 evaluates the whole snapshot. Say what the size limit is and that exceeding it yields `not_evaluated` with a reason, not a silent truncation. The other panel flagged truncation; v2 does not answer it.

### The shadow evaluation

Section 7's 2:45 line is right. Give it a number and a method or it is a promise: "fifty to one hundred historical package revisions from Box, blind to the ARB's recorded dispositions, scored for missed changes, false alerts, and reviewer minutes." That is also the thing I would sponsor (section 7).

---

## 7. Would I take this to my CISO now

Yes, as a request to sponsor a **shadow evaluation**, not a pilot. The distinction matters at a bank. A shadow evaluation runs against historical packages already in Box, writes nothing to Box, informs no decision, and therefore needs the data-classification decision but not full MRM validation (the model is "under evaluation," which our MRM policy allows). That is a six-week conversation instead of fourteen.

What I would say to the CISO: "This tool binds each ARB control to a quote in a specific document version, re-checks the binding when a version changes, and keeps a ledger of every check. The machine cannot approve anything. I want to run it over the last fifty packages and compare its findings to what my reviewers actually recorded. If it catches what we caught and does not drown us, we talk about a pilot."

**The one remaining change that moves me from interested to sponsor:** make the shadow evaluation runnable as a feature, not a slide. A batch mode that takes N historical snapshots of real packages, evaluates each against the profile, and produces one table: per control, per revision, machine assessment versus the human disposition the ARB actually recorded, with miss and false-alert counts and the minutes a reviewer spent on each. Without that, "next: a shadow evaluation" is a sentence. With it, I can hand my CISO the memo and the tool in the same meeting.

For the v3 design itself, the single most important change is the one in section 2: key staleness to the evidence binding and the classification, not to the snapshot, and complete the display function. It decides whether my reviewers get one re-review per upload or eight.

---

## 8. The name and the closing line

**"Keel."** Keep it. It is short, it is not "AI-something" or "Comply-something," and the metaphor (the part below the waterline that keeps the thing upright and that nobody looks at) is accurate to what the product does. Two cautions. I do not know whether the name is taken in this space; someone should check before it goes on a slide. And in a fast sentence "Keel" sounds like "kill," which is not a word you want near "controls." Say it slowly once at the start.

**"Files have versions. Compliance evidence should too."** Keep it for the room, do not put it in front of my second line. My Head of Technology Risk will say, correctly, "our evidence is versioned in IRM, thank you." What is new is not that evidence has versions. It is that the evidence is **bound to the document version that proves it, and to the person who checked that version.** Your v2 subtitle says that: "Know which design evidence changed, and who reviewed that exact version." The Codex panel wanted to close on it. I side with them on accuracy and with you on rhythm. Put both on the closing slide: the line in large type, the subtitle beneath it. The engineers get the line. The risk people get the subtitle.

---

## 9. What I would need to see in v3

In the order I would check them:

1. The display function completed for all combinations, including `evidence_contradicted`, `compensating_control`, `exception_approved` with expiry, `superseded`, and the happy-path row `evidence_found, unchanged` + `verified` = Verified holds.
2. Staleness keyed to the evidence binding and the classification, with a per-tier materiality threshold in the profile.
3. Reviewer eligibility by role validity and project membership, not uploader.
4. Exception record with residual rating, IRM reference, risk owner constraints, max expiry, and a stated writer for `exception_approved`.
5. One rule distinguishing `absent` from `weakened`, applied consistently to the hero and to acceptance cases 1 and 4.
6. Stale-action rejection that explains what changed and offers re-apply when the binding is unchanged.
7. UTC. MRM model ID field. Deep link to the Box page. Normalization disclosed.
8. Section 10 split into bank-owned gates and product work, with an order.
9. A shadow-evaluation batch mode, or a design for it.

If v3 has items 1 through 3, I will book the meeting with my CISO. If it has item 9, I will bring the memo.

Dana Okafor
