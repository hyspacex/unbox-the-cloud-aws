# 12. Persona review of Keel v1: Dana Okafor, Principal Security Architect

Reviewer: Dana Okafor, Principal Security Architect, Architecture Review Board (14 years). Mid-size US bank, about $60B in assets, OCC-supervised, subject to the Heightened Standards (12 CFR 30 App. D). Reviews 6 to 10 solution designs a week. Daily tools: Box, Confluence, ServiceNow IRM, Jira.
Inputs: `10-design-v1.md`, `01-enterprise-problem.md`.
Date: 2026-10-16.

A note on how to read this. I have no stake in your hackathon. I have a stake in whether my team's Monday gets better and whether my name ends up next to a verdict I cannot defend to an examiner. Where I say "I would use this," I mean it. Where I say "this gets you thrown out of the room," I mean that too.

---

## 0. Verdict in one paragraph

The core idea is correct and I have not seen it done: tie each control to a quote, pin the quote to a file version, recompute which controls are at risk when a version changes, and keep a ledger of every evaluation. That is the thing I spent three weeks reconstructing from Confluence history and email for a SOC 2 Type II auditor. The product around that idea is built for a hackathon demo, not for a bank. The status model confuses what the AI thinks with what a human decided. The "Accept risk" button is a liability I would not allow on a first-line screen. The control list is European. The trigger ("any new version") will drown my reviewers in autosave noise. The research document assumes a bank that uses Vanta and writes DPIAs; mine does neither. Fix the status model, the risk acceptance flow, the completeness of the ledger, and the applicability of controls, and I would sponsor a pilot.

---

## 1. Walking through the screens and the demo on a real review

I will use a real-shaped example. Project: "Cardholder Dispute Portal Re-platform," Tier 1 application, PCI-scoped, moving from on-prem to AWS. Package: architecture doc (42 pages, Word, exported from Confluence), data-flow diagram (Visio), network diagram (Visio), vendor assessment summary (PDF from ServiceNow), runbook (Word), ARB presenter template (PowerPoint). It arrives in a Box folder because our ARB intake process snapshots the package at submission. The living doc stays in Confluence.

### Screen 1: Folder view

**What I would click.** The red row. Nothing else. I open this screen to find out what needs me. The top line "8 Verified, 1 Regressed, 1 Not evidenced" is the right instinct.

**What I need that is not there.**

- **Which project, which tier, which scope.** The folder name is not enough. I need the application ID from our CMDB (ServiceNow APM record), the inherent risk tier (1 to 4), the data classification of the highest-sensitivity data store, and PCI/SOX/GLBA scope flags. Those four facts decide which controls apply and how hard I look. A Tier 4 internal reporting tool and a Tier 1 cardholder system do not get the same ten controls.
- **The ARB decision record.** "Passed the review board Tuesday" is a decision with an ID, a date, a chair, a list of conditions, and an expiry. I need that record linked at the top of the folder view, and I need the conditions as rows alongside the controls, because tracking conditions to closure is a bigger failure in my world than silent regressions.
- **Review SLA and aging.** Each open item needs an age and a due date. Our standard is five business days for a re-review of a changed design. If the queue has 14 items, I need to know which are at day 4.
- **Assignment.** Which reviewer owns this project. My board has six reviewers. I do not want to see other people's queues on my Monday screen unless I ask.
- **"Verified against which version."** A row that says "Verified by Priya N., Oct 14" when the file is now at v5 and nothing has flagged is not reassuring. Either the re-check ran against v5 and the quote is still present, or it did not. Show me "Verified v2, re-checked v3, v4, v5: quote present" on the row. Operating effectiveness is proven by the re-checks that found nothing, not only by the ones that found something.
- **Control profile version.** "Bring-your-own control JSON" is correct, but the profile is itself a governed document. The row must show which version of our standard the control was evaluated against. If Information Security changes IS-STD-014 §5.1 in November, every Verified from October is against the old text, and the auditor will ask.

**What I would distrust.**

- The version badges. In an enterprise Box tenant with Box Edit and Office Online, a Word document can accrue thirty versions in an afternoon from autosave. If "any new version" triggers an evaluation, I will get thirty evaluation events for one editing session, and the ledger will be noise. I would distrust any count on this screen until I knew the trigger is "submitted for review" or "locked," not "saved."
- The word "Verified" on a row where the verifier is someone who is no longer an authorized ARB reviewer. Reviewer authority has a date range. The ledger must store the reviewer's role at the time, not just the name.

**What would waste my time.** The folder's non-design files. Meeting notes, screenshots, the presenter deck. If the agent evaluates every file as potential evidence, I get "Not evidenced" noise from a PowerPoint. Let me tag which files are evidence-bearing, or infer it from the Box metadata template on the file.

### Screen 2: Finding card

This is the screen that decides whether I use the product, so I will be exact.

**What I would click.** The v2 quote, to see it in the context of the full section, not a paragraph. Then the v3 side, to see whether the sentence was deleted, moved, or weakened. Then the agent's search summary. Then a button.

**What is good.** The side-by-side with the verified quote highlighted on the left and the same section on the right is the correct hero. "Verified by Priya N., Oct 14" next to the quote is correct. The disabled Re-verify button is correct and I would show it to my second line as the single best design decision in the product. "Searched 4 other files for key management statements, none found" is exactly what I want to see and exactly what I cannot get from a human reviewer's notes.

**What I need that is not there.**

1. **The requirement text, not the control nickname.** "C1 Encryption at rest" means nothing to an examiner. I need the bank's own requirement statement: "SEC-ARCH-07: Data classified Confidential or above at rest is encrypted with AES-256 using keys managed in the enterprise KMS (AWS KMS CMK or CipherTrust); rotation at least annually; key custodians named. Source: IS-STD-014 Cryptography v4.2 §5.1." The framework citations (ISO A.8.24, PCI 3.5.1) are secondary. They belong on the card as links into the authority document records in ServiceNow IRM, not as the headline.
2. **Section anchor and page.** "Section 4.3 Data Protection, page 17 of 42, paragraph 2." Without that, I open the 42-page doc and search. The quote highlight on the card does not help me when I have to go confirm in the real document.
3. **A real diff.** Not "the surrounding paragraph shown." Word-level diff of the section between v2 and v3, with deletions struck through and insertions underlined. The AI rewrite that swallowed the sentence usually also changed four other sentences, and I need to see whether any of those weakened a different control.
4. **Who uploaded v3, when, and what they said.** Box has the uploader and the version comment. If the uploader is "svc-confluence-export" I need to know that, because then the real author is in Confluence history and the separation-of-duties check against uploader is meaningless.
5. **Why the change happened.** The Jira ticket or ServiceNow change that drove v3. Half the time a regression is a design change that was approved somewhere else, and the real finding is that the approval did not come back through the board.
6. **Severity.** A regression on encryption-at-rest for a Tier 1 PCI system is Critical and I want it in my inbox within the hour. A regression on a logging retention sentence on a Tier 4 tool is Low and goes in Friday's digest. Severity is a function of the control's tier in our standard and the application's risk tier. Without it, the Review Queue is a flat list and I triage by hand.
7. **The classification of the regression.** "Gone" is one case. The others, in rough order of how often I see them: **weakened** ("encrypted at rest with customer-managed keys" becomes "encrypted at rest"), **moved** (to an appendix or a different file), **contradicted** (still present, but a new sentence elsewhere says something different), **reformatted** (the sentence became a table row and the string match failed). The card must say which it thinks happened, and the state must distinguish Weakened from Regressed.
8. **The other three changed assertions.** The trace says "diff found 2 removed and 4 changed." Show me the 4 changed on this card, or one click away, because I am about to re-review this section anyway.
9. **The author's response field.** When I return this to the team, they answer. Their answer, with their quote, belongs on this card so the next reviewer sees the thread.

**What I would distrust.**

- **The confidence number.** "0.82" tells me nothing I can act on. I do not know what it was calibrated against. If you cannot show me the measured precision on a held-out set, replace it with the facts the model actually has: "quote absent from v3 (string match); 4 other files searched; 0 candidate statements found; 1 weaker statement found in v3 §4.3 ('data is encrypted')." That is evidence. A decimal is not.
- **"Model: claude-sonnet-4-6."** Fine as a fact, useless as a control. I need the bank's model inventory ID for this model and prompt version (we register every model used in a business decision under SR 11-7), a link to the prompt text, and the prompt hash. "Prompt v3" with no way to read it is the kind of thing an examiner writes down.
- **"evaluation 11.4 s."** Nobody on my board cares. Put it in the ledger entry. Remove it from the card.
- **The service account's reach.** If the agent read a file I do not have permission to open and surfaces a quote from it on my card, you have just leaked content across a Box permission boundary. The card must only show quotes from files the viewing user can open, and the ledger must record that the service account's view was broader than the reviewer's.

**What would waste my time.** The three buttons. **Re-verify / Override: evidence is elsewhere / Accept risk until date** are the three least common actions I take. The most common action, by a wide margin, is **Return to author with a comment and a due date.** The second most common is **Not applicable with justification.** The third is **Request exception**, which I do not approve, I route. Accept risk as a one-click button on my screen is addressed in section 2 and section 4. It is the one thing on this card I would refuse to use.

### Screen 3: Evidence timeline

**What I would click.** The export button, then the period filter, then one entry to see what the examiner will see.

**What is good.** Ten lanes with status changes over time is the right picture for the auditor conversation. Clicking into a ledger entry with version ID, hash, quote, actor, timestamp, model ID is what I spent three weeks assembling.

**What I need that is not there.**

- **Evaluations with no status change.** This is the most important gap in the product. The ledger as described records status changes. An operating-effectiveness test asks "did the control operate on every change in the period," which means the population is **every version evaluated**, including the ones where nothing broke. If v4 and v5 were evaluated and the quote was still present, those are two evidence events that prove the control ran. Without them the examiner sees a control that only fires when something goes wrong and asks how you know it ran the other times.
- **A completeness reconciliation.** The examiner's first question after "show me the population" is "how do you know this is complete?" I need a report that lists every Box file version in the period from Box's own version API alongside the ledger's evaluation event for each, with gaps flagged. If the agent was down for a day, I need to see the gap and the catch-up event.
- **A tamper-evident export.** CSV is fine as a format. The export needs a manifest with a hash of the file, the hash chain or Object Lock reference for the ledger it came from, the period, the control profile version, and who generated it and when. Otherwise my auditor treats it as a spreadsheet I could have edited, which is what I give them today.
- **Period filter and population count.** "Period: 2026-04-01 to 2026-09-30. Design changes evaluated: 212. Status changes: 31. Human dispositions: 29. Open at period end: 2." Those are the four numbers the auditor asks for.
- **Both version numbers.** Box's version number (v3) and the document's own version string in its header ("2.1 Draft"). They disagree constantly and the auditor will catch it.
- **UTC on every timestamp.** "Oct 14, 10:32" in which zone?

**What I would distrust.** The lane colors. A lane that is green from Oct 14 forward with no tick marks is a lane I cannot prove was checked. Tick marks for every evaluation event, including no-change, fix this.

### Screen 4: Live agent trace

**For the demo**, fine. **For me**, the trace is the reasoning record. It must be stored with the ledger entry, not just streamed. When Priya is on leave and I have to defend her Verified from March, the trace is what I read.

**What I would distrust.** "Guardrail check passed." Passed what? A PII filter on a design document is either a no-op (design documents at a bank should not contain PII) or a problem (it redacts internal hostnames, IP ranges, or account IDs that are the evidence for the network segmentation control). Tell me what the guardrail checked and what, if anything, it redacted. And tell me whether the redaction happened before the quote validation, because if it did, your "quote must string-match the version" rule just failed on a redacted hostname.

### The three-minute demo, as a bank audience hears it

- **0:15 "Box Automate routed it. Vanta checks the buckets."** Neither sentence is true at my bank. Our ARB intake is a ServiceNow demand with a Jira epic. Our cloud posture is checked by Wiz and AWS Security Hub, and the control results land in ServiceNow IRM. Say "your GRC platform checks the buckets" or name the categories, not the vendors. A bank audience hears Vanta and files you under SaaS startups.
- **0:40 "An engineer uploads v3."** Engineers do not upload to the ARB folder at my bank. The architect or the project manager does, at submission. If you want the bank version of the hero: "the project re-submits for the pre-deployment review, and v3 is the Confluence export."
- **1:40 "Click Accept risk until a date, type a reason."** This is the beat where I would stop the demo. A security architect accepting the risk of a missing encryption-at-rest control on a PCI-scoped system, alone, on a finding card, with a free-text reason, is a control failure in itself. It is exactly what the OCC fined Capital One for in spirit: risk accepted without a process. Demo **Return to author with due date** or **Override: evidence moved, here is the quote in the data-flow doc**. If you must show risk acceptance, show it as **Request exception**, which opens a form naming the risk owner, the approver, the compensating control, and the expiry, and routes it. The fact that the architect cannot approve it is as important as the fact that the AI cannot.
- **2:00 Timeline.** Correct beat. Add the population count. "212 changes evaluated, 31 findings, 29 dispositioned, 2 open" is the sentence my auditor wants to hear.
- **2:30 "Code owns the state. A human owns the verdict."** Good. Keep it.

---

## 2. The status model

### Does it match how my board decides

Partly. The state machine mixes two different things into one status: **what the AI assessed** and **what a human decided**. On my board those are two columns on the checklist and they must stay two columns.

**AI assessment** (machine, re-computed on every version): Evidence found / Evidence weakened / Evidence absent / Evidence contradicted / Not evaluated (file type unsupported, model error, guardrail block). Always labelled as machine output. Never green. Never the word "Satisfied."

**Human disposition** (person, with role and date): Unreviewed / Verified / Returned to author (due date, Jira) / Not applicable (justification, approver) / Compensating control (reference to the control, its own evidence) / Exception requested (IRM record ID) / Exception approved (approver, expiry, review date) / Superseded (control profile changed).

**Displayed status** is a function of both, and the function is published. Example: AI says Evidence absent and human disposition is Verified against an earlier version equals **Regressed, re-review due**. AI says Evidence found and human is Unreviewed equals **Pending review**, not Proposed Satisfied.

### Statuses missing from v1, in order of how often I use them

1. **Not applicable, with justification and approver.** Used on a third of controls for a third of projects. A design with no persistent data store does not need an encryption-at-rest statement. Without this state every such project shows "Not evidenced" forever and the board stops trusting the dashboard.
2. **Returned to author / Pending remediation.** The default disposition. Needs owner, due date, Jira link, and the author's response thread.
3. **Compensating control.** PCI uses this formally (Appendix B). If the design does not meet SEC-ARCH-07 as written but implements tokenization so the data store holds no cardholder data, that is a compensating control with its own evidence requirement and its own annual re-validation.
4. **Exception, with risk ID, approver, expiry, and review cadence.** Covered below.
5. **Weakened.** Distinct from Regressed. "Encrypted at rest" with no key management statement is weaker, not absent. It is the most common thing an AI rewrite does to a control sentence.
6. **Verified, stale.** The evidencing file changed and the re-check has not completed yet, or the queue is backed up. The row must look different from Verified during that window. Today the model would show green until the agent finishes, which on a busy day could be hours.
7. **Evidence expired.** Some evidence has a shelf life: a vendor's SOC 2 report, a penetration test, a BIA. Not needed for v1, but the ledger schema should allow a validity window on a Verified.
8. **Superseded.** The control profile changed; the old Verified was against old text.

### Would I let an AI set "Proposed Satisfied"

Yes, under three conditions, and I would refuse otherwise.

- The word "Satisfied" never appears in machine output. Call it "Evidence found." "Proposed Satisfied" becomes "Satisfied" the first time someone builds a dashboard that truncates the label, and the first time a downstream agent reads the Box metadata field and drops the qualifier. I have watched this happen with "Preliminary approved" in ServiceNow.
- The machine assessment is a separate Box metadata field from the human disposition. If a downstream agent is only supposed to consume Human-Verified, it must be able to filter on a field that the AI cannot write to, enforced by Box metadata template permissions, not by convention.
- It never counts toward the top-line number. "8 Verified" means 8 human Verified. AI assessments get their own count: "10 evaluated, 8 Verified, 1 Pending review, 1 Regressed."

### "Accept risk until a date": would I use it, and who is allowed

I would never use it as designed, and neither would anyone on the board, because none of us is allowed to.

At my bank risk acceptance is a formal exception process in ServiceNow IRM. The first-line application owner (an accountable executive, not the architect) requests it. Technology Risk, second line, assesses residual risk. Approval authority depends on the residual rating: Low is a Technology Risk director, Medium is the CISO or the Head of Technology Risk, High goes to the Operational Risk Committee. Maximum term is twelve months. High exceptions are reviewed quarterly. Every exception names a compensating control and a remediation plan, and the exception ID is what the auditor samples.

The security architect's role is to **recommend** and **route**. So the button on my screen is **Request exception**, it pre-fills the control, the finding, the quote, the version, and the application, it asks me for the recommended residual rating and the compensating control, and it creates or links the IRM exception record. Keel then reflects the IRM record's status and expiry on the row. Keel is never the system of record for a risk acceptance.

For the hackathon, if you cannot integrate IRM, model the record: risk owner (must differ from reviewer and uploader), approver (role-gated), residual rating, compensating control, expiry (max 365 days), IRM reference (free text). And show that the architect's click does not change the status to Accepted. It changes it to Exception requested.

---

## 3. The ten controls

### Which are checkable in a design document, and which produce noise

| # | Control as written | Checkable in a design doc at my bank? | Noise risk | What my checklist actually says |
|---|---|---|---|---|
| C1 | Encryption at rest, key management model stated | **Yes.** Best control in the list. Our standard specifies the acceptable options (AWS KMS CMK or CipherTrust; HSM-backed for Tier 1) and rotation. | Low. Docs that say "encrypted at rest" with no key management are a real finding, not a false alarm. | SEC-ARCH-07, IS-STD-014 §5.1. Evidence: data protection section plus key management diagram. Applies to Confidential data and above. |
| C2 | In transit, minimum TLS version | **Yes.** | Medium. Most docs say "TLS" and omit the version. It is a legitimate finding the first time and a nag thereafter. Make it Weakened, not Not evidenced. | SEC-ARCH-08: TLS 1.2 minimum, 1.3 preferred, internal mTLS for service-to-service in PCI scope. |
| C3 | Data residency / region per store and processor | **Rephrase.** GDPR framing. What I check: all data stores in approved US regions; any offshore access by vendor staff is named and approved; no cross-border transfer without Legal sign-off. | Medium. "Region" is usually stated once, not per store. | SEC-ARCH-12: Data location and offshore access. Ties to TPRM assessment. |
| C4 | Personal data inventory, data subjects, special category | **Rephrase.** We do not write DPIAs. What I check: every data store carries a classification label (Public/Internal/Confidential/Restricted), NPI under GLBA and cardholder data under PCI are flagged, and the PCI scope boundary is drawn. | High if phrased as GDPR. Low if phrased as classification labels. | SEC-ARCH-02: Data classification and regulatory scope per data store. |
| C5 | Retention period as a number plus deletion mechanism | **Partly.** Retention at a bank is governed by the Records Retention Schedule by record class, owned by Legal/Records Management. The design doc should cite the record class code, not invent a number. A design doc that says "7 years" with no class code is itself a finding. | **High as written.** Most docs will fail "a number" and the ones that pass may be wrong. | SEC-ARCH-15: Each data store references a Records Retention Schedule class; deletion mechanism described. |
| C6 | Third-party processors listed and match the contract | **Half.** Listing third parties: yes. Matching the contract: no. Contracts live in Icertis with Legal access. They will not be in the design folder. What I check: every vendor in the design has a TPRM assessment ID and inherent risk tier, and the assessment is current. | **High** for the contract-matching half, which will show "Not evidenced" forever. | SEC-ARCH-20: Third parties named with TPRM ID and tier (OCC 2023-17). |
| C7 | Network segmentation and trust boundaries shown, diagram current | **Hard.** The diagrams are Visio or PNG. Unless the model reads images, this either fails constantly or is evaluated from the prose description, which is weaker than the diagram. | **Very high.** This will be your top false-alarm generator unless you handle images or require a text description. | SEC-ARCH-10: Network diagram with trust zones, PCI CDE boundary, and ingress/egress paths; data-flow diagram current (PCI 1.2.3, 1.2.4). |
| C8 | Least privilege, named roles, no shared admin | **Yes.** | Low. | SEC-ARCH-05: Role model with named roles mapped to entitlements; privileged access via the PAM tool (CyberArk); no shared or standing admin; break-glass process named. |
| C9 | Logging and monitoring, retention and alerting stated | **Yes, with a tweak.** We require logs forwarded to the enterprise SIEM (Splunk), named. "Logging enabled" is not evidence. | Medium. | SEC-ARCH-17: Security events forwarded to enterprise SIEM; retention per IS-STD-021; alert ownership named. |
| C10 | Rollback / recovery with RTO/RPO | **Partly.** RTO/RPO are set by the Business Impact Analysis, owned by Business Continuity. The design doc must state them and they must match the BIA tier. That is a cross-system check. A stated RTO that does not match the BIA is the real finding. | Medium. | SEC-ARCH-22: RTO/RPO stated and consistent with the BIA tier; recovery tested; backups immutable. |
| C11 | DPIA maps high risks to measures | **Not applicable** at a US bank without EU entities. Drop or make it a profile option. | n/a | We do a Privacy Impact Assessment on a subset; it is a ServiceNow form, not a document. |
| C12 | Exceptions have owner and expiry | **Not a design-doc control.** It is a process control on IRM records. Keel should enforce it in its own exception flow, not look for it in a document. | n/a | n/a |

### Controls on my actual checklist that are missing from the ten

The most frequent ARB findings, in order, are none of your ten:

1. **Approved services only.** Every cloud service and every software component is on the approved catalog, or an exception is referenced. This is the single most common finding on cloud designs and it is perfectly checkable: a list of named services against a list of approved ones.
2. **Authentication and MFA.** Workforce access via the enterprise IdP (SSO), MFA for all privileged and remote access, no local accounts.
3. **Secrets management.** No credentials in code or config; the vault is named.
4. **Secure SDLC gates.** SAST, SCA, DAST, and container scanning in the pipeline; the pipeline is named.
5. **Change management path.** The deployment goes through the CAB process or an approved standard change.
6. **Resilience.** Multi-AZ at minimum for Tier 1 and 2; dependency on single-region services called out.
7. **Data egress and DLP.** Outbound paths named; DLP coverage stated for anything touching Restricted data.
8. **End-of-life software.** No components past vendor support.

Make the control profile the demo's bring-your-own, and show two profiles: the EU one you have, and a US bank one with the above. That converts "GDPR tool" into "control-agnostic engine" in one click.

### What an actual checklist item looks like

Your table has "Control (checkable statement)." Mine has eight fields, and the AI needs most of them to do the job:

```
ID:              SEC-ARCH-07
Title:           Encryption at rest and key management
Requirement:     Data classified Confidential or Restricted at rest is encrypted using
                 AES-256. Keys are managed in an enterprise-approved KMS (AWS KMS
                 customer-managed keys or Thales CipherTrust). Rotation at least annually.
                 Key custodians and the key hierarchy are documented.
Standard:        IS-STD-014 Cryptography v4.2 §5.1, §5.4
Applicability:   All applications with a data store holding Confidential or Restricted data.
                 N/A permitted with justification when no persistent store exists.
Evidence:        Architecture document, Data Protection section; key management diagram.
Tier:            Critical (Tier 1-2 apps), High (Tier 3-4)
Framework map:   PCI DSS 4.0.1 3.5.1, 3.6.1, 3.7; NIST CSF 2.0 PR.DS-01; CRI Profile PR.DS-1.1;
                 ISO 27001:2022 A.8.24; FFIEC IS Booklet II.C.19
Reviewer role:   Security Architecture
Profile version: 2026.3
```

The AI should be handed the Requirement and Evidence fields, not just the Title. "Checkable statement" in your table is roughly my Requirement field, but without Applicability the tool cannot know when N/A is the right answer, and without Tier it cannot compute severity.

---

## 4. Trust and liability

### What would make me refuse to put my name on a Verified

- I cannot see the full section in the real document from the card. One click to the Box preview at the right page, or no Verified.
- The quote is from a file I cannot open in Box. If the service account can see more than I can, I am verifying hearsay.
- The requirement text is not the bank's own standard, versioned. I will not verify "C1 Encryption at rest." I will verify SEC-ARCH-07 v2026.3.
- The reviewer check is "not the uploader." That is too weak and gives false comfort. The uploader is often a PM or a service account. The check must be "not a member of the project team" from the ServiceNow demand or Jira project roles, and "holds the ARB reviewer role on this date."
- There is no record of what I saw. My Verified must capture the version ID, the hash, the quote, the section anchor, the control profile version, and the model assessment I was shown, so that if the model assessment turns out to be wrong, the record shows what I was shown and when.
- I am asked to verify something the AI pre-filled as Satisfied and I am clicking through a list. If the UI makes bulk verify easy, I will be audited on it. Bulk verify should not exist for Critical-tier controls.

### What I need to see about the model, the prompt, and the quote

- **Model.** The Bedrock model ID, the inference profile, and the region. Your `CLAUDE.md` defaults to a `global.` inference profile. A `global.` profile routes requests across geographies. My bank requires US-only inference for Confidential data, so that default fails our data location standard before the pilot starts. Use a `us.` profile and say so on the architecture slide.
- **Model inventory.** Our Model Risk Management team registers any model that informs a business decision (SR 11-7, OCC 2011-12). A design-review assist tool will be inventoried, likely as a lower-tier model with annual validation. The ledger needs a field for our MRM model ID, and the pilot needs an MRM intake before go-live, not after.
- **Prompt.** Versioned, readable by the reviewer and second line, hashed, with a change log. If the prompt changes, every assessment after that is under a new prompt version, and I want to be able to filter the ledger by it.
- **Quote.** Verbatim, string-matched, with section anchor and character offset. The design has this. Add: the normalization rules you applied (whitespace, smart quotes, hyphenation), because the first false "Regressed" I see will be a sentence that became a table cell, and I need to know why.
- **Measured accuracy.** Precision and recall on a held-out set of real-shaped design changes, with the false-negative rate for regressions stated. The design says this is not in the hackathon build. For a pilot, it is table stakes. Second line will not accept a detective control with an unmeasured miss rate.
- **Fallback behavior.** What the system does when Bedrock is unavailable, when a guardrail blocks the document, when a file type is unsupported. Each must produce a ledger event of type "Not evaluated" with a reason, so the completeness report shows the gap.

### Would second line accept this ledger as evidence that the design-review control operated

Yes, with conditions, and the conditions are mostly about completeness, not about AI.

- The population is every design change in the period, not every status change. See section 1, Screen 3.
- There is a reconciliation to Box's version list showing no gaps.
- The export is tamper-evident.
- Human identity resolves to the HR system through Box SSO, and reviewer role at the time is recorded.
- The ledger maps to IRM control IDs, so the evidence attaches to the control instance in IRM where second line and audit already look.
- Model Risk Management has signed off on the model use.
- There is a documented procedure for what reviewers do with AI assessments, and a periodic human full-review sample (say 10 percent) that tests the AI's miss rate. Second line will classify Keel as "AI-assisted manual detective control" and require that sampling. That is fine. Tell them before they tell you.

### What the OCC examiner would say

The examiner would not ask about the AI first. They would ask:

1. "Show me the policy and procedure that governs this tool." (Does it exist? Who owns it?)
2. "Show me the population of design changes in the period and how you know it is complete."
3. "Pick these 25. Show me the evidence and the human disposition for each."
4. "Who can change the control library, and where is the approval for the last change?"
5. "Where does the data go? Which account, which region, who at the vendor can see it, is it used for training, how long are prompts retained?" The `global.` inference profile fails here.
6. "What is your model risk assessment for this, and when was it last validated?"
7. "What happens when the model is wrong? Show me a case where a human overrode it and what you did about the model."
8. "This runs on AWS, Box, and Anthropic. Show me the third-party risk assessment for each and your concentration risk analysis." We are already an AWS and Box customer, so two of three are done. The model provider through Bedrock is covered by the AWS assessment in most banks' frameworks, but TPRM will want that confirmed in writing.

None of these are blockers. All of them must have an answer before pilot.

---

## 5. Adoption

### Where it fits

The honest map of my world:

- **Confluence** holds the living design doc. Engineers edit it daily.
- **Box** holds the submitted package. Our ARB intake exports the Confluence page to PDF or Word at submission and drops it, with the Visio diagrams and the vendor summary, into a Box folder per project. This is a snapshot discipline we adopted after the SOC 2 exercise, precisely because Confluence history was unusable as evidence. So "watches a Box folder" matches how the ARB package actually lives. Good for you. It does not match the living document, and a tool that only sees the snapshot misses the regression until the next submission. That is acceptable for a pilot. Say it out loud.
- **ServiceNow IRM** is the system of record for controls, control test results, issues, and exceptions. Internal audit and the examiners look here. Anything Keel produces that matters to them must end up here.
- **ServiceNow (ITSM/SPM)** holds the demand, the change, and the application record.
- **Jira** holds the work. Return-to-author becomes a Jira ticket or it does not happen.

### Inside Box, inside ServiceNow, or standalone

- **Reviewer experience: inside Box.** The metadata sidebar, the comment, and a Box Task assigned to the reviewer are where I already work when the package arrives. If I have to open a fourth tool, adoption drops by half.
- **Evidence and exceptions: inside ServiceNow IRM.** The ledger events attach to the control instance as evidence. Exceptions are IRM records. The timeline view can be a ServiceNow report or a Keel screen that links back.
- **Standalone: the finding card and the timeline only.** The finding card needs a richer layout than a Box sidebar can give. The timeline is a view no one else has. Keep those two screens, embed or link from Box and IRM.

One warning about Box comments. If the project folder is shared with an external vendor, a Keel comment reading "C1 Encryption at rest: REGRESSED" is a disclosure of a security weakness to a third party. Check the folder's collaboration scope before posting a comment, or post to a reviewer-only folder, or use Box Tasks instead of comments.

### Who approves a pilot and what they ask

| Approver | What they ask |
|---|---|
| CISO (sponsor) | What does it cost in reviewer time, what does it save, what is the miss rate? Does it make my ARB look better or worse to the OCC? |
| Head of Technology Risk (second line) | Is this a control or a tool? Who owns it? How is completeness proven? What is the sampling plan around the AI? |
| Model Risk Management | What model, what prompt, what validation, what monitoring, what tier? Who is the model owner? |
| Third-Party Risk Management | SOC 2 report for the vendor (you), pen test, data flow, subprocessors, exit plan (can I export everything?). Bedrock covered under the AWS assessment, confirm in writing. |
| Enterprise Data Governance / Privacy | Which data classification is allowed to go to Bedrock? Design documents are Internal or Confidential. Network diagrams in PCI scope are Confidential. Approval for sending Confidential documents to a model endpoint, even in our own account, is a formal decision. |
| Architecture Review Board | Yes, the ARB reviews the ARB tool. Approved services check, identity integration, logging to Splunk, DR. |
| Legal | Terms: no training on our data, data retention of prompts, liability. |
| Internal Audit (consulted) | Will the export satisfy the next SOC 2 and the next exam? They will want to see the completeness reconciliation. |
| Box platform team | Metadata templates are governed. Creating one is a request with a two-week lead. Service account scopes are reviewed. |

Timeline for a pilot approval at my bank, if everything goes well: ten to fourteen weeks. The MRM intake and the data classification decision are the long poles.

---

## 6. The one thing, each way

**"I want this Monday."** The mandatory re-check set computed by code, the vanished quote side-by-side with who verified it, and a complete, version-pinned, exportable population of every design change evaluated in the period. That is the three weeks of my team's life I lost to the SOC 2 Type II, converted into an export button. If the ledger includes no-change evaluations and reconciles to Box's version list, I would fight for a pilot.

**"I am walking out."** Machine output labelled "Satisfied" in green anywhere a human or a downstream agent can read it, or a one-click "Accept risk" on a first-line reviewer's screen that writes a risk acceptance with no risk owner, no approver, and no exception record. Either one tells me the team has not sat with a bank's second line. The `global.` inference profile is a close third.

---

## 7. The finding card, as I would want it

```
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│ FINDING  KEEL-2026-0417                                        Severity: CRITICAL        │
│ Cardholder Dispute Portal Re-platform  ·  APM-11482  ·  Tier 1  ·  PCI-scoped           │
│ ARB decision ARB-2026-0338 (approved with conditions, 2026-10-07, chair R. Alvarez)      │
│ Review owner: D. Okafor  ·  Opened 2026-10-16 09:14 UTC  ·  Due 2026-10-23 (5 bd)        │
├──────────────────────────────────────────────────────────────────────────────────────────┤
│ CONTROL  SEC-ARCH-07  Encryption at rest and key management        Profile v2026.3       │
│ Requirement: Data classified Confidential or Restricted at rest is encrypted using       │
│ AES-256. Keys managed in an enterprise-approved KMS (AWS KMS CMK or CipherTrust).        │
│ Rotation at least annually. Key custodians and key hierarchy documented.                 │
│ Standard: IS-STD-014 Cryptography v4.2 §5.1, §5.4                                        │
│ Maps to: PCI 3.5.1, 3.6.1, 3.7 · NIST CSF PR.DS-01 · CRI PR.DS-1.1 · ISO A.8.24           │
│ IRM control instance: CTRL-0092-APM11482  [open in IRM]                                  │
├──────────────────────────────────────────────────────────────────────────────────────────┤
│ MACHINE ASSESSMENT (not a verdict)                                                       │
│ Result: EVIDENCE ABSENT  ·  classification: REMOVED (not moved, not weakened)            │
│ Basis:                                                                                    │
│   • Verified quote not found in v3 after normalization (whitespace, quotes, hyphens)      │
│   • 4 other files searched for key-management statements: 0 candidates                    │
│   • 1 weaker statement found in v3 §4.3 ¶2: "All data is encrypted" (no key model)        │
│   • Other assertions changed in §4.3: 3  [show]                                           │
│ Model: anthropic.claude-sonnet-4-6 · inference profile us.* · us-east-1                   │
│ MRM model ID: MRM-AI-0271 · Prompt v3 (sha256 9f3a…c1e2) [view prompt]                    │
│ Guardrail: prompt-injection check passed; 0 redactions                                   │
│ Trace: [view 11 steps]                                                                    │
├───────────────────────────────────────────┬──────────────────────────────────────────────┤
│ v2  Box version 1184720933  (doc header   │ v3  Box version 1189002117  (doc header      │
│     "2.1 Approved")                       │     "3.0 Draft")                             │
│ Uploaded 2026-10-07 by M. Chen (PM)       │ Uploaded 2026-10-16 08:51 UTC by             │
│ Verified by Priya Natarajan (ARB reviewer)│ svc-confluence-export; Confluence editor     │
│ 2026-10-14 10:32 UTC                      │ J. Park (Eng). Version comment: "Section 4    │
│ sha256 4b7d…a910                          │ rewrite for clarity."                        │
│                                           │ Jira: CDP-2291 "Simplify data section"       │
│                                           │ sha256 e02c…77f4                             │
│ §4.3 Data Protection, p.17 ¶2             │ §4.3 Data Protection, p.16 ¶2                │
│                                           │                                              │
│ "Dispute records and attachments are      │ "Dispute records and attachments are stored  │
│ stored in Amazon S3 and Aurora            │ in Amazon S3 and Aurora PostgreSQL. ~~All     │
│ PostgreSQL. [All data at rest is          │ data at rest is encrypted with AWS KMS       │
│ encrypted with AWS KMS customer-managed   │ customer-managed keys in the CDE account,    │
│ keys in the CDE account, rotated          │ rotated annually; key custodians are the     │
│ annually; key custodians are the Payments │ Payments Platform leads.~~ ++All data is      │
│ Platform leads.] Backups inherit the      │ encrypted.++ Backups ~~inherit the same       │
│ same key policy."                         │ key policy~~ ++are retained per policy++."    │
│                                           │                                              │
│ [open v2 in Box at p.17]                  │ [open v3 in Box at p.16]  [full §4.3 diff]   │
├───────────────────────────────────────────┴──────────────────────────────────────────────┤
│ RELATED                                                                                   │
│ • SEC-ARCH-02 Data classification: unchanged, quote present in v3 (re-checked 08:52 UTC)  │
│ • SEC-ARCH-22 RTO/RPO: WEAKENED in v3 §6.1 ("recovery within business hours") [open]      │
│ • ARB condition #2 (ARB-2026-0338): "Key custodian names to be added to runbook" — open   │
├──────────────────────────────────────────────────────────────────────────────────────────┤
│ HUMAN DISPOSITION                                                        role-gated       │
│ [ Return to author ]  comment, due date, creates Jira in CDP, assigns J. Park            │
│ [ Verify ]            disabled: no quote satisfies SEC-ARCH-07 in any current file        │
│ [ Evidence moved ]    requires quote + file + version; code validates before enabling     │
│ [ Not applicable ]    requires justification; routes to second reviewer for approval      │
│ [ Compensating control ] requires IRM control reference and evidence quote               │
│ [ Request exception ] opens IRM exception form: risk owner (≠ reviewer, ≠ project team), │
│                       approver by residual rating, compensating control, expiry ≤ 365d.  │
│                       Status becomes EXCEPTION REQUESTED, not accepted.                   │
│ [ Mark false positive ] AI wrong, quote still present; requires quote; feeds MRM metrics  │
│                                                                                          │
│ Reviewer: D. Okafor · ARB reviewer role valid 2024-01-01 to present · not on CDP team     │
│ Every action writes an append-only ledger event with this card's state at click time.    │
├──────────────────────────────────────────────────────────────────────────────────────────┤
│ THREAD                                                                                    │
│ 2026-10-16 09:14 UTC  Keel     Finding opened on v3 evaluation (event EVT-88213)          │
│ (author responses, reviewer notes, and IRM status changes append here)                    │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

Fields I will not accept the card without: Requirement text with standard reference; section and page anchor on both sides; word-level diff; uploader and version comment on v3; severity; machine result labelled as machine, with classification (removed, moved, weakened, contradicted); inference region and MRM model ID; Return to author as a first-class button; Request exception routed, not accepted; Mark false positive; reviewer role at time of action.

Fields I would remove from v1: the confidence decimal; evaluation duration; "Proposed Satisfied" as a label anywhere.

---

## 8. Where the enterprise research document gets my world wrong or oversimplifies

The research is better than most of what vendors show me, and it is honest about its sources. It is also written by someone who has read about banks rather than sat in one. Specifics:

1. **Framework center of gravity is European.** DORA, GDPR Art 35, DPIA, EU AI Act Art 14. A US bank my size lives under GLBA and the Interagency Guidelines (12 CFR 30 App. B), the OCC Heightened Standards (12 CFR 30 App. D, which apply at $50B and codify three lines of defense and the independent risk management function), FFIEC IT Handbook, PCI DSS, SOX ITGC, SR 11-7 for models, and NYDFS Part 500 if New York-licensed. Our control library maps to NIST CSF 2.0 and the CRI Profile first, PCI second, ISO a distant third. DORA matters only if we have EU entities. The DPIA is not a standard artifact. Section 2.1 of the research should lead with the US sources for a US persona and keep the EU material as a profile variant.

2. **The three lines of defense is cited from blogs when there is a regulatory source.** For a bank over $50B the Heightened Standards define front line units, independent risk management, and internal audit, and they are examined against it. Cite that, not Risk Hub and Umbrex.

3. **The buyer is misidentified.** The research says the head of technology risk / GRC buys. Second line does not buy tools for the first line to operate; that would compromise their independence. The CISO or the Head of Architecture (first line) buys and operates. Second line consumes the evidence and sets the requirement. Pitch the CISO, satisfy the Head of Technology Risk.

4. **Vanta and Drata are the wrong comparator.** They are SaaS and mid-market. A bank's "continuous compliance" is ServiceNow IRM or Archer plus cloud posture tools (Wiz, Prisma, AWS Security Hub, Tanium) feeding control test results. The research says this in section 1.3 and then the design uses Vanta in the demo script anyway. Keep the research's own conclusion.

5. **The design doc is the subject, not the evidence.** The research treats the design document as the audit evidence. For the ARB control, the evidence is the **decision record**: the completed checklist, the minutes, the conditions, the sign-off. The design document is what the checklist was applied to. Keel's real product is the checklist evidence with quotes. Say that and the auditor conversation gets easier.

6. **Conditions, not just regressions.** The most common real-world failure after an ARB approval at my bank is not a sentence vanishing. It is "approved with conditions" where nobody tracked the conditions to closure before deployment. The research's section 4 misses it entirely. The design's folder view should carry conditions as rows. The same quote-and-version machinery applies.

7. **As-built drift is the bigger brother of document drift.** The research cites the AWS guidance on a second review before deployment and infers it is often skipped. Correct. But the gap between the design and what was built is a different and larger problem than the gap between v2 and v3 of the doc. Do not overclaim; Keel addresses document drift only.

8. **Cadence and volume.** "Monthly cadence is typical" is from a tooling vendor. Our board meets weekly with a consent agenda for low-risk items, and reviewers work offline between meetings. I see 6 to 10 designs a week; the board sees 15 to 25 across reviewers; several times that go through a ServiceNow self-assessment questionnaire and never reach a human. The research is right not to put a number on a slide. If a judge asks, "a weekly board, one reviewer handles six to ten a week" is a defensible answer.

9. **Separation of duties is modelled too weakly.** "Reviewer is not the uploader" is the research's suggestion and the design adopted it. The uploader is a PM or a service account more often than the architect. The real rule is reviewer not on the project team and reviewer holding the ARB role on the date. Both are checkable from ServiceNow.

10. **Candidate C is the Monday problem; Candidate A is the demo.** The research ranks "fluent but empty" third because it looks like a single-document linter. On my board, the AI-generated design that says "industry-standard encryption" and "appropriate access controls" with no specifics is the daily pain. Candidate A is the better demo. Do not let the ranking convince the team that C is not the product.

11. **Workslop is the right stat, wrong framing.** The issue is not that AI rewrites make sentences vanish. It is that AI rewrites produce generically compliant prose that passes a skim. The vanish case is the dramatic subset. The weakened case is the common one.

12. **The Capital One and Morgan Stanley caveat is correct and I would go further.** Do not mention either in the pitch. Every banker in the room knows the cases and will resent a hackathon team implying a document tool would have changed them.

13. **Auditor sampling unit.** The research says the auditor asks for the population of design changes. For the ARB control the population is design **decisions** (approvals, re-approvals, exceptions) in the period. Design changes are the population for a change management control (CC8.1). Keel can serve both, but the export must let the auditor choose the unit.

14. **Missing: data classification approval for sending documents to a model.** The research's section 6 says "data stays in the tenant and region" as if that settles it. At a bank, sending a Confidential document, including a PCI network diagram, to any model endpoint requires a data governance decision even inside our own AWS account. It is a six-week conversation and it should be on the risk list.

15. **Missing: the approved services catalog.** The most common ARB finding on cloud designs is an unapproved service. It is the easiest control to check and it is not in the research's ten.

16. **Section 6's "what gets it rejected" is right.** "AI writing Compliant anywhere without a human, no way to see which model, a separate document store." I would add: "a risk acceptance that is not an IRM exception record" and "a cross-region inference profile."

---

## 9. What I would need to see in v2 before I take it to my CISO

1. Two-field status: machine assessment and human disposition, with the displayed status as a published function of both. No "Satisfied" in machine output.
2. Return to author, Not applicable, Compensating control, and Request exception as dispositions. Accept risk removed from the first-line screen and replaced with a routed exception request that stores risk owner, approver, compensating control, expiry, and IRM reference.
3. Ledger events for every evaluation, including no-change, plus a completeness reconciliation against Box's version list and a tamper-evident export with a manifest.
4. A US bank control profile alongside the EU one, with Requirement, Standard, Applicability, Tier, and Evidence fields, and severity computed from control tier and application tier.
5. Trigger on submission or lock, not on every version. Debounce autosave.
6. Finding card per section 7: requirement text, section and page anchor, word-level diff, uploader and version comment, severity, regression classification, MRM model ID, US-only inference profile, Mark false positive.
7. Reviewer eligibility from role and project membership, not from uploader identity.
8. A stated plan for measured precision and recall on a held-out set, and a sampling procedure around the AI for second line.

If v2 has the first three, I will put it in front of the Head of Technology Risk myself.

Dana Okafor
