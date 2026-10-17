# 01. The enterprise problem behind folder-level continuous compliance for design documents

Research date: 2026-10-16. Scope: questions 1-6 in the team-lead brief, building on `00-brief.md`.
Convention: every factual claim carries a bracketed source number (see Sources at the bottom).
Anything marked **[unsourced]** is practitioner knowledge or inference that I could not find a public
source for. Treat it as a hypothesis, not a fact. Vendor blogs are marked **[vendor]** because they
sell into this problem and their numbers are self-interested.

---

## TL;DR for decision-making

1. **The user is real and has a name.** The architecture review board (ARB) and the security architect who
   sits on it review solution designs at a gate "after the design phase, before a build or purchase
   decision" [1]. Second-line technology risk owns policy and challenge; internal audit is third line [14][15].
   The person who feels the pain daily is the **security architect / ARB reviewer**. The person who pays for it is the
   **head of technology risk / GRC**. The person who consumes the output is the **auditor**.
2. **Design documents really are audit evidence.** ISO 27001 auditors asking about A.8.27 want "High-level
   design (HLD) or architectural diagrams showing layered controls" [5] and "design review records showing the
   principles being applied to real decisions; review dates or version history" [6]. PCI DSS 4.0.1 requires
   current network and data-flow diagrams (1.2.3, 1.2.4) and a documented cryptographic architecture (3.6.1.1) [17][18].
   NIST SA-17 requires the developer to produce a design spec that "accurately and completely describes the required
   security and privacy functionality, and the allocation of controls" [10].
3. **Vanta/Drata-style continuous compliance stops at the API boundary.** They run automated tests against cloud,
   identity, and code integrations. Independent estimates put automated coverage at roughly 40-80% of controls, with the
   rest being manual uploads of documents [24][25][26]. **Nobody in that category reads the content of a design doc
   and tracks whether a control statement is still there in v4.** That is the gap.
4. **The "regression" pain is documented, but mostly by vendors.** Gist Security [vendor] describes it exactly:
   a control required in January "gets refactored out in March", and the approval record "reads clean while the
   running system tells a different story" [30]. Confluence marketplace apps exist that flip a page to
   "Changed since approval" using a content hash [33]. **That proves demand for "the approved version is no longer what
   the page says" but those tools flag *every* edit. None say *which control* broke.** That is our wedge.
5. **There are funded competitors at the design stage**: Prime Security ($20M Series A, Dec 2025, PayPal as customer) [31][32]
   and Seezo (AWS Marketplace listing, reads Confluence, Jira, and Google Docs) [34][35]. Both focus on **threat modelling a new
   feature**. Neither positions on **multi-document, versioned, control-by-control evidence over time for an auditor**.
   Be ready for the "how is this not Prime/Seezo?" question.
6. **Hero moment recommendation:** the silent regression. v3 of the architecture doc quietly drops the
   "encrypted at rest with customer-managed keys" sentence. Within seconds the control flips from *Verified* to
   *Regressed* in Box Metadata. The evidence card shows the v2 quote, who verified it, and when, next to v3 with
   the sentence gone. It goes to a named human, and AI cannot re-verify it. See section 5.
7. **Weakest evidence:** design-review volume per month at a mid-size bank. I found no public number. The best
   proxies are the ~1:100 AppSec-to-developer ratio [27] and Prime's unsourced claim that only 10-20% of planned work
   gets a security review [31]. Do not put a volume number on a slide unless a judge gives you one.

---

## 1. Who is the user

### 1.1 The bodies and titles

| Role | Line of defense | What they do with design docs | Source |
|---|---|---|---|
| **Solution / application architect** (project team) | 1st | Authors the architecture doc, data-flow doc, runbook. Submits the package to the ARB. | [1][3] |
| **Security architect** (often on the ARB) | 1st (sometimes "1.5") | Reviews the design against security standards and control requirements. Flags gaps. Grants or recommends exceptions. | [1][2] |
| **Architecture review board (ARB)** / design authority | 1st, governance | A multi-disciplinary board drawn from "Security, Development, Enterprise Architecture, Infrastructure, and Operations" [1]. LeanIX adds "Compliance and security officers" and a chief architect who chairs [2]. Approves, rejects, or approves with conditions. | [1][2] |
| **Technology risk / IT risk / information security risk** | 2nd | Sets policy. Challenges the first line. Monitors. One 3LoD guide gives "Second line = Technology Risk and Privacy (policies, challenge, monitoring)" [15]. Another says "Compliance, legal, information security and model risk management all typically sit in the second line" [14]. | [14][15][16] |
| **Privacy / DPO** | 2nd | Must be consulted on the DPIA under GDPR Art 35(2). | [20] |
| **Third-party risk management (TPRM)** | 1st/2nd | Due diligence and contract terms for vendors in the design. US banks must follow the 2023 interagency guidance lifecycle: "planning, due diligence and third-party selection, contract negotiation, ongoing monitoring, and termination" [22][23]. | [22][23] |
| **Internal audit** | 3rd | Independent assurance. Samples the evidence trail. | [14][15] |
| **External auditor / examiner** | External | SOC 2 CPA firm, ISO certification body, PCI QSA, OCC/FFIEC examiner. | [8][11][17] |

The FFIEC Development, Acquisition, and Maintenance booklet (updated Aug 2024) tells bank examiners to review
"Architectural designs, software development techniques, and systems engineering principles that promote effective
information security" [12]. So **US bank examiners explicitly look at architecture designs.**

### 1.2 What their week looks like

- **Gate-based reviews.** Reviews happen "after the design phase, before a build or purchase decision, and again before
  deployment to validate that the reviewed architecture matches the solution that was built" [1]. Complex items go to a live
  meeting. Simpler ones go through "offline mechanisms, such as email" [1].
- **Monthly cadence is typical for formal boards.** Sparx's ARB guidance says "most commonly once a month or more regularly
  when required" [36]. The Government of Canada's EARB uses a presenter template, a checklist in the appendices,
  "consent agenda items" for follow-ups, and condition templates to show compliance with conditions [37][38].
- **Packages take weeks.** One ARB practitioner describes a process that "can take multiple weeks". The team creates a package,
  circulates it, takes feedback, waits for the meeting, presents, then waits again. "This can delay the project by weeks" [39].
- **Queues.** Vendor-reported anecdotes include "two people assigned to reviews with 80+ in the backlog" and "average review cycles
  of seven days or longer" [27] [vendor]. One example cites 3 architects for 400 engineers [30] [vendor, no source given].
- **Staffing ratio.** About 1 AppSec engineer per 100 developers. This is attributed to ESG Research 2023 [28] [vendor citing analyst].

### 1.3 Tools they use today

- **Document stores**: Confluence, SharePoint, Google Docs, Box. Seezo's integration list (Confluence, Jira, Google Docs) shows where design docs live [35].
  ISO guidance commonly shows principles "in SharePoint" and standards "in Confluence" [7].
- **GRC platforms**: ServiceNow IRM (formerly GRC), RSA Archer, IBM OpenPages, MetricStream for large banks [40][41][42].
  ServiceNow IRM's pitch is "one control library serves every framework you carry". Each framework is "an authority document made of
  citations" [42]. This matters for integration (see 6).
- **Spreadsheets, still.** In the 2026 State of GRC survey of 748 practitioners, 18% said spreadsheets were their primary tool. That is more
  than any commercial platform [43]. A RegScale survey of 250+ InfoSec leaders found "58% are burning through more than 2,000
  person-hours every year on evidence collection alone" [43] [vendor survey].
- **Compliance automation** (Vanta, Drata, Secureframe) is mostly a SaaS and mid-market tool, not the bank's system of record [24][25].

### 1.4 Volume: how many design docs per month at a mid-size bank

**I could not find a credible public number.** Several targeted searches returned nothing. Proxies:
- Prime Security claims security teams review "only 10-15% of planned work before release". Its CEO also says "15-20%" in the same article.
  Neither figure has a source [31] [vendor].
- "Only about 10% of organizations believe their threat modeling meaningfully covers 90% or more of their applications" [31]. No source given.
- **[unsourced]** A rough estimate: a mid-size bank with 1,000-3,000 engineers might send tens of architecture-significant
  designs per month to formal review. Many more changes go through lighter self-attestation. Do not present this as fact.

**Implication:** pitch "most designs never get a second look after the gate," which the vendor data supports directionally.
Do not pitch "an ARB reviews N docs a month."

---

## 2. Which control frameworks get applied to design documents

### 2.1 Framework clauses that land on design artifacts (not on infrastructure)

| Framework | Clause | What it asks of a design document | Source |
|---|---|---|---|
| ISO/IEC 27001:2022 | **A.8.25** Secure development life cycle | Rules for the SDLC: when to test, who approves. | [4][6] |
| | **A.8.26** Application security requirements | Security requirements identified and approved when developing or acquiring apps. | [6] |
| | **A.8.27** Secure system architecture and engineering principles | Documented principles, applied. Auditors want "HLD or architectural diagrams showing layered controls (e.g., WAF, Firewall, IDS, Encryption, IAM)" [5]. A common finding is when firms "possess a documented policy but fail to provide evidence that it is actually utilized" [44]. | [4][5][6][44] |
| | **Clause 7.5.3** Control of documented information | Version control, approval, access restriction, retention of documents. | [45][46] |
| SOC 2 (AICPA TSC 2017, 2022 points of focus) | **CC8.1** Change management | "authorizes, designs, develops or acquires, configures, documents, tests, approves, and implements changes to infrastructure, data, software, and procedures" [47]. Note that "designs" and "documents" are in the criterion. | [47][48] |
| PCI DSS v4.0.1 | **1.2.3** network diagram, **1.2.4** data-flow diagram | Must be accurate and current. They are "audit prerequisites" [17]. | [17][18] |
| | **3.6.1.1** | "document their cryptographic architecture" (service providers) [18]. | [18] |
| NIST SP 800-53 r5 | **SA-8** Security and privacy engineering principles | Layered protections, boundaries, threat modelling [9]. | [9] |
| | **SA-17** Developer security and privacy architecture and design | Design spec "consistent with the organization's security and privacy architecture" that "accurately and completely describes the required security and privacy functionality, and the allocation of controls" [10]. | [10] |
| EU DORA (Reg. 2022/2554), applies from 17 Jan 2025 | **Art 8(1)** | "identify, classify and adequately document all ICT supported business functions... information assets and ICT assets... and their roles and dependencies" [13]. | [13][49] |
| | **Art 8(7)** | Risk assessment "before and after connecting technologies, applications or systems" [13]. | [13] |
| | **RTS 2024/1774** | "develop, document, and implement a policy on encryption and cryptographic controls". Protect keys "through their whole lifecycle" [50][51]. | [50][51] |
| | Art 28 and ITS 2024/2956 | Register of information on ICT third-party providers [52]. | [52] |
| US bank guidance | **FFIEC DA&M booklet (2024)** | Examiners review "architectural designs... and systems engineering principles" [12]. | [11][12] |
| | **OCC Bulletin 2023-17** (interagency TPRM) | Due diligence and ongoing monitoring of third parties across the lifecycle [21][22]. | [21][22][23] |
| | **12 CFR Part 30 App. B** | The Capital One $80M penalty cited "failure to establish effective risk assessment processes prior to migrating significant information technology operations to the public cloud" [53]. | [53] |
| GDPR | **Art 25** Data protection by design and by default | Design-time privacy measures [20]. | [20] |
| | **Art 35(7)** DPIA | Must contain "at least" a systematic description of processing and purposes, a necessity and proportionality assessment, a risk assessment, and the mitigating measures [19][20]. Art 35(11) requires review "at least when there is a change of the risk" [20]. **That clause is a legal hook for continuous re-review of a document.** | [19][20] |

### 2.2 Representative ARB checklists

- **TOGAF Architecture Compliance Review** provides published checklists by domain (security, information management,
  systems management). TOGAF says the "enterprise CIO or enterprise Architecture Board will mandate architecture reviews for all major
  projects, with subsequent annual reviews" [54][55]. (The 9.1 page is behind an Open Group login. The quote is from a mirror of 9.2 text [55].)
- **Government of Canada EARB** is the best fully public, real-world example. It has a presenter template, an assessment checklist
  in the appendices, conditions with a follow-up template, and a published framework across business, information, application,
  technology, and security domains [37][38][56].
- **AWS's own ARB guidance** recommends "a universal architecture template", documenting "approvals, reasons for recycles,
  exceptions required", and to "set expiration dates on the exceptions" [1].
- Vendor checklists such as Hava [57] and template sites are generic and weak as evidence.

### 2.3 Ten checkable controls a design-doc folder must evidence (the demo control list)

Each control is phrased so the AI can return Satisfied, Partially satisfied, Not evidenced, or Contradicted, with a quote.

| # | Control (checkable statement) | Typical evidence location | Framework mapping |
|---|---|---|---|
| C1 | **Data at rest is encrypted, and the key management model is stated** (for example customer-managed keys in KMS, rotation period) | Architecture doc, security section | ISO A.8.24/A.8.27; PCI 3.5, 3.6.1.1; DORA RTS 2024/1774 crypto policy [18][50] |
| C2 | **Data in transit is encrypted** with a minimum TLS version stated | Architecture doc | PCI 4.2; ISO A.8.24 [unsourced clause numbers] |
| C3 | **Data residency / processing region is stated** for each data store and processor | Architecture doc + DPA/vendor contract | GDPR Ch. V transfers; DORA Art 28 register [52] |
| C4 | **Personal data inventory**: data categories, data subjects, and the special-category flag | Data-flow doc, DPIA | GDPR Art 30, Art 35(7)(a) [19] |
| C5 | **Retention period is stated** as a number with a deletion mechanism | DPIA, data-flow doc | GDPR Art 5(1)(e); ISO 7.5.3 [45] |
| C6 | **Third-party processors and sub-processors are listed** and match the contract | Architecture doc vs vendor contract | GDPR Art 28; OCC 2023-17; DORA Art 28 [22][52] |
| C7 | **Network segmentation and trust boundaries are shown** (data-flow diagram current) | Architecture doc, diagrams | PCI 1.2.3, 1.2.4; ISO A.8.22 [17] |
| C8 | **Least-privilege access model** with named roles and no shared admin | Architecture doc | NIST SA-17(7) least privilege [10]; ISO A.8.27 [4] |
| C9 | **Logging and monitoring**: security events logged, retention and alerting stated | Runbook, architecture doc | ISO A.8.15/A.8.16; SOC 2 CC7 |
| C10 | **Rollback / recovery plan** with RTO/RPO stated | Runbook | DORA Art 11/12 continuity; SOC 2 CC8.1, A1 [47] |
| C11 (optional) | **DPIA risk-mitigation section maps each high risk to a measure** | DPIA | GDPR Art 35(7)(c)-(d) [19] |
| C12 (optional) | **Exceptions have an owner and an expiry date** | ARB decision record | AWS ARB guidance [1] |

**[unsourced]** The ISO 27002 clause numbers A.8.15, A.8.16, A.8.22, and A.8.24 are from my knowledge of the 2022 Annex A
numbering (logging, monitoring, network segregation, cryptography). Verify them before printing on a slide.

---

## 3. What evidence an auditor accepts

### 3.1 Attributes of acceptable document evidence

From ISO and SOC guidance:
- **Version-controlled, approved, access-restricted.** For Clause 7.5.3 the auditor "wants to see that your documents have the
  appropriate markup (like version control and classification) and that access is restricted based on role and need" [45].
  The document is "approved, versioned, access-restricted" [46].
- **Named approver with a timestamp.** "Every change is tracked, timestamped, and associated with a real person, the
  definition of audit-ready" [58]. The Confluence document-control apps that exist record "the approver, a UTC timestamp,
  the exact page version and a SHA-256 hash of the approved content" [33].
- **Living, not stale.** For A.8.27 an auditor wants "review dates or version history showing the document is alive". A principles document
  "written once in 2023 and never revisited invites the follow-up question of how it's kept current" [6].
- **Applied to real decisions, not just a policy.** A.8.27 needs "design review records showing the principles being applied to real
  decisions" [6]. UpGuard: "Policy documents alone won't satisfy an auditor, they need proof that the principles are actively
  governing design decisions" [4].
- **Inquiry alone is insufficient.** SOX practice guidance: "Inquiry alone does not provide sufficient evidence to support a conclusion about
  the effectiveness of a control" [59]. An AI saying "yes" is a form of inquiry. It needs the quote and location behind it.

**Proposed evidence event schema** (our design, consistent with the above): control ID, file ID, file version ID, content hash, exact quote,
section or page anchor, verdict, confidence, model ID and prompt version, timestamp, human reviewer identity, reviewer decision, and reason.

### 3.2 Evidence of design versus evidence of operation

- **Design effectiveness**: "whether a control is properly structured to mitigate a specific risk if followed correctly" [60].
  SOC 2 **Type 1** tests design "as of one date" [61].
- **Operating effectiveness**: "whether that properly designed control was actually executed consistently over a specific period" [60].
  **Type 2** covers "usually 3-12 months", so "the auditor samples a population of dated artifacts instead of a single snapshot" [61].
  Linford & Co. say a Type 2 usually covers at least six months [62].
- **How this maps to our product.** A design document is evidence of design. It shows the system was designed with encryption.
  **The ledger of reviews is evidence of operation of the design-review control itself.** It shows that every new version was
  checked, regressions were caught, and a human verified them within N days. That reframing matters. We are not claiming the
  bucket is encrypted (Vanta's job). We are producing the dated population of review events an auditor samples for the
  "secure design review" control under A.8.27 and CC8.1.

### 3.3 How auditors sample

- AICPA sets no mandatory size. Sizes follow AU-C 530 and the non-authoritative Audit Sampling Guide [63].
- Conventional sizes by control frequency: "1 for annual, 2 for quarterly, 2-5 monthly, 5-15 weekly, 20-40 daily, 25-60 for
  per-transaction controls" [64]. Another firm cites similar sizes [65].
- A design review is an **event-driven** control: it fires per design or per version. The auditor asks for **the full population**
  of design changes in the period, then samples about 25. One SOC 2 guide warns that "one of the more difficult things you will be
  asked to do during a SOC 2 audit is to provide the auditor with a list of all changes that have been made to the system" [48].
  **A ledger that can export the complete population with version IDs answers the hardest part of the request.**

### 3.4 Why a point-in-time yes/no is not enough

- **Drift is the named problem.** Drata defines compliance drift as "a control that was passing six months ago is now failing, with no record
  of when it broke, who changed what, or how long the gap has been open" [66] [vendor]. Ampcus: audits answer "were controls in place on the day
  we checked?", not "are controls working continuously, right now?" [67] [vendor].
- **GDPR Art 35(11)** requires DPIA review when risk changes [20]. **DORA Art 8(2)** requires identifying ICT risk "on a continuous basis" [13].
  Both are regulatory hooks for re-review on change.
- **Vanta, Drata, and Secureframe cover infrastructure, not design content.** Vanta advertises "automated, hourly tests" across integrations [24].
  Without integrations, organizations "must manually collect and provide substantial evidence" [68]. Independent estimates:
  "around 70-80%" automated evidence on a standard cloud stack, "50-60%" for custom or on-prem [25]. Truvo puts Drata at "roughly 40-60% of
  controls" automated [26] [vendor, a consultancy that sells services on top]. For documents, the platforms offer **policy templates,
  policy acceptance tracking, and document upload** [69]. **I found no evidence any of them parse a design document's content against
  a control or detect removal of a control statement across versions.** This is an absence-of-evidence claim. A judge from Vanta could
  contradict it, so phrase it as "we didn't find it."

---

## 4. What breaks today

| Failure | Evidence | Strength |
|---|---|---|
| **Regression after approval**: a later version removes or changes an approved statement, and the approval still looks valid | "A page gets approved, someone makes a 'minor' edit afterward, and the page continues to carry its 'Approved' status... In regulated environments, this is a compliance violation" [70] [vendor]. Confluence page history "tells you who saved a version, but not who formally reviewed and approved it" [71]. Paid apps flip a page to "Changed since approval" using a hash [33]. Gist describes a control "refactored out in March by someone who never saw the threat model" and an "encryption-at-rest reverted by a later PR" [30] [vendor]. | Medium. The pattern is consistent and a market of apps exists. All sources are vendors, and I found **no public incident** blamed specifically on a design-doc regression. |
| **Review once at the gate, never again** | AWS recommends a second review "before deployment to validate that the reviewed architecture matches the solution that was built", which implies it is often skipped [1]. "For years, the Well-Architected review was an event... then six months with nobody opening the report" [72]. TOGAF assumes "subsequent annual reviews" [55]. | Medium |
| **Evidence scattered across many files and tools** | 18% of 748 GRC practitioners run on spreadsheets as their primary tool. Others repurpose "Jira, Notion, or SharePoint" [43]. "A policy repository in SharePoint, risk registers in Excel, evidence screenshots in shared drives, and audit requests flying around by email" [73] [vendor]. | Medium-strong (survey-backed) |
| **Review boards are a bottleneck** | Multi-week ARB cycles [39]. 1:100 AppSec ratio [28]. 10-20% of planned work reviewed [31] [vendor]. "When review is slow, engineering routes around it" [30] [vendor]. | Medium |
| **AI-written documents that sound compliant but are not** | HBR/Stanford/BetterUp "workslop": "AI generated work content that masquerades as good work, but lacks the substance". 40-41% of US full-time workers received it in the last month, and it took nearly two hours of rework per instance [74][75]. On compliance documents specifically: "LLMs hallucinate compliance mappings... An AI-generated policy that is wrong is worse than no policy: it creates false confidence in compliance" [76] (low-quality source). Linford & Co. (CPA firm) warns of "processing integrity risks" when AI output is used "without adequate review" [77]. | Workslop data: medium. Compliance-specific: weak. Use workslop as the stat and do not overclaim. |
| **Regulators fine banks for inadequate pre-change risk assessment and vendor oversight** | Capital One: $80M OCC penalty for "failure to establish effective risk assessment processes prior to migrating significant information technology operations to the public cloud" [53]. Morgan Stanley: $60M OCC penalty. It "failed to adequately assess the risk of subcontracting the decommissioning work" and "failed to maintain appropriate inventory of customer data", and it "experienced similar vendor management control deficiencies" again in 2019 [78]. | Strong for "regulators punish weak design-time risk assessment". **Not** evidence that a doc-regression tool would have prevented either. Do not imply that. The Morgan Stanley repeat is a good line: the control failed again three years later. |

---

## 5. The hero moment (30 seconds, tech execs and engineers)

### Candidate A (rank 1): the silent regression
**Script:** "This folder passed the review board on Tuesday. Ten controls were green, each verified by a named person. Today an engineer
uploads v3 of the architecture doc, with an AI-polished rewrite of section 4." Upload. Within seconds C1 turns red in **Box Metadata**:
*Encryption at rest: REGRESSED*. The evidence card shows v2's quote ("All data at rest is encrypted with AWS KMS customer-managed keys,
rotated annually"), verified by Priya, Oct 14. Next to it, v3 shows the paragraph with that sentence gone. The status cannot go back to
Verified until a human acts. AI cannot re-verify. One click opens the ledger entry the auditor will sample.

**Why it wins:**
- It shows something **disappearing**, which hash-based tools cannot explain. They only say "changed" [33]. A human skimming a 30-page doc
  would not notice either. This is the "they couldn't do that before" moment.
- It ties to the workslop stat: AI rewrites are where sentences silently vanish [74].
- It shows all four product pillars in one beat: Box event trigger, Bedrock reasoning, Box Metadata write-back, and a human-in-the-loop ledger.
- It is deterministic enough to rehearse. You control v2 and v3.

**Risk:** if the model misses the deletion live, the hero dies. Mitigate by diffing at the claim level. Extract control-relevant statements
from v2 and v3, then have the model judge the delta. A pure "read v3 and judge" approach is less reliable. Keep a cached path as backup.

### Candidate B (rank 2): the cross-document contradiction
**Script:** The architecture doc says "all customer data stays in eu-west-1". The vendor contract that lands later lists a US sub-processor
for support tickets. C3 (data residency) flips to *Contradicted*, with two quotes from two files side by side.
**Why strong:** it shows reasoning across a folder, which no single-file tool or Box Automate rule does, and it is GDPR, DORA, and TPRM-relevant [22][52].
**Why second:** it needs two documents explained in 30 seconds. It is more fragile, because the model must connect "support ticket vendor" to
"customer data". It is a great **second beat** if time allows.

### Candidate C (rank 3): fluent but empty
**Script:** an AI-generated DPIA reads beautifully. The agent marks C5 (retention) *Asserted, not evidenced*: "Data is retained only as long as
necessary" has no number and no deletion mechanism. C6 is *Not evidenced*: no processor is named.
**Why third:** relatable, but it looks like a single-document linter, and Seezo and Prime already do single-document review [31][35]. It shows no time
dimension, which is our differentiator.

**Recommendation:** lead with A. If there are 20 spare seconds, add B as "and it reasons across files." Mention C in one sentence of narration.

---

## 6. What an enterprise architect or GRC lead needs to say "I would pilot this"

| Requirement | Why (evidence) | Hackathon-feasible version |
|---|---|---|
| **AI never self-approves; only a named human can mark Verified** | EU AI Act Art 14 requires that humans can "monitor, interpret, and override" high-risk AI [79]. Our tool is likely not high-risk under Annex III, but that is the direction regulators are taking. A "qualified human must be able to review and overturn" [80]. Auditors treat unreviewed AI output with "professional skepticism" [81]. | Status machine: AI can set *Proposed Satisfied*, *Regressed*, or *Not evidenced*. Only a reviewer action sets *Verified*. Show the disabled button. |
| **Separation of duties**: the doc author cannot verify their own control | CC8.1 and change management require "evidence that developers cannot independently push their own code to production" [82]. The same logic applies to self-verifying a design. | Reject verify if reviewer = file uploader (Box user ID). |
| **Identity from the enterprise directory** | Evidence must be "associated with a real person" [58]. | Use Box user identity (SSO-backed in enterprises). Do not build custom auth. |
| **Append-only, version-pinned evidence ledger** | Approval tied to "exact page version and a SHA-256 hash" [33]. Auditors sample from a full population [48][64]. | Every event stores Box file version ID plus content hash. Append only, no updates. |
| **Explainability: exact quote, location, and reasoning** | SR 11-7: "the hardest SR 11-7 requirement to meet for LLMs is effective challenge, because you cannot independently challenge an output you cannot trace back to its sources" [83]. Seezo reviewers praise being able to "trace the full reasoning path behind every finding" [35]. | Quote plus section anchor on every verdict. Reject model output with no verbatim quote found in the source text (validate the quote with string match). |
| **Honest uncertainty**: "insufficient evidence" is a valid answer | "Inquiry alone does not provide sufficient evidence" [59]. | Confidence plus a *Not evidenced* state. Never default to Satisfied. |
| **Model governance (bank-specific)** | SR 11-7 applies to an LLM "whenever the model informs a business decision" [83]. Banks will want model ID, prompt version, and monitoring. | Log Bedrock model ID and prompt hash on every event. One sentence in the pitch: "Every verdict records which model and prompt produced it." |
| **Data stays in the tenant and region** | DORA and bank TPRM scrutiny of ICT third parties [22][52]. | Bedrock in-region. Box content not used for training (Bedrock default). One sentence. |
| **Bring-your-own control library** | ServiceNow IRM models controls as citations of authority documents [42]. Vanta imports custom controls via CSV [84]. | Load controls from a JSON/CSV file. Show that one control maps to ISO, PCI, and DORA citations. |
| **Evidence export to the GRC system of record** | Banks run ServiceNow IRM or Archer [40][41]. OSCAL assessment-results is the machine-readable interchange format, and ServiceNow documents an OSCAL export [85][86]. | CSV evidence pack export, mention OSCAL as roadmap. **Do not build the ServiceNow integration in six hours.** |
| **Exceptions with owner and expiry** | AWS ARB guidance: "set expiration dates on the exceptions" [1]. | Optional. A reviewer can mark *Accepted risk until <date>*. |
| **Respect source permissions** | ISO 7.5.3 access restriction [45]. | The agent reads via Box API with the app's scoped access. Say so. |

**What will get it rejected in a bank, [unsourced but standard]:** the AI writing "Compliant" anywhere without a human, no way to see
which model produced a verdict, and a separate document store that duplicates Box.

---

## 7. Skeptical notes and open risks

- **Competitive overlap is real.** Prime Security [31][32] and Seezo [34][35] are funded, enterprise-sold, AI design-review products. Gist [30]
  explicitly markets "flagging drift when an approved control disappears downstream", though for code. Our differentiation must be stated
  crisply: **versioned, multi-document, control-level evidence ledger, living in Box, for the auditor.** It is not "AI reviews a design."
- **Hash-based "changed since approval" already exists** for Confluence [33]. Our step up is semantic. We say *which control* broke and *why*, so
  reviewers re-review one paragraph, not the whole doc. Say that out loud. It pre-empts the "Confluence apps do this" objection.
- **Most of the "what breaks" evidence is vendor content.** The strongest neutral sources are the HBR workslop survey [74], the GRC survey data [43],
  OCC enforcement actions [53][78], and the regulations themselves.
- **Design-doc compliance is not operational compliance.** A doc saying "encrypted with CMK" does not prove the bucket is. Pre-empt it: "Vanta checks
  the bucket. We check that the design that justified the bucket hasn't silently changed. Together that's design plus operation." [60][61]
- **No ARB volume data.** Do not invent it.

---

## Sources

1. AWS Architecture Blog, "Build and operate an effective architecture review board." https://aws.amazon.com/blogs/architecture/build-and-operate-an-effective-architecture-review-board/
2. LeanIX, "Architecture Review Board: Structure & Process." https://www.leanix.net/en/wiki/ea/architecture-review-board
3. Medium (S. Sharma), "Architecture & Design: Security Review." https://medium.com/@sandeepsharmaster/architecture-design-security-review-d295989c518f
4. UpGuard, "ISO 27001 Control 8.27." https://www.upguard.com/compliance/iso-27001/8-27
5. High Table, "How to Audit ISO 27001 Annex A 8.27." https://hightable.io/iso-27001-annex-a-8-27-audit-checklist/
6. AuditBadger, "Secure Development Controls in ISO 27001: A.8.25-A.8.28." https://auditbadger.com/blog/secure-development-controls-in-iso-27001-a-8-25-a-8-28-explained/
7. iso27001.com, "Annex A 8.27 Complete Guide." https://iso27001.com/iso-27001-annex-a-8-27-secure-systems-architecture-and-engineering-principles/
8. Linford & Co., "Design vs Operating Effectiveness." https://linfordco.com/blog/design-vs-operating-effectiveness/
9. CSF Tools, NIST SP 800-53 r5 SA-8. https://csf.tools/reference/nist-sp-800-53/r5/sa/sa-8/
10. CSF Tools, NIST SP 800-53 r5 SA-17. https://csf.tools/reference/nist-sp-800-53/r5/sa/sa-17/
11. FDIC, "Updated FFIEC IT Examination Handbook: Development, Acquisition, and Maintenance Booklet." https://www.fdic.gov/news/financial-institution-letters/2024/updated-ffiec-it-examination-handbook-development
12. FFIEC IT Handbook, DA&M Appendix A: Examination Procedures. https://ithandbook.ffiec.gov/it-booklets/development-acquisition-and-maintenance/appendix-a-examination-procedures/
13. DORA Article 8 text. https://www.digital-operational-resilience-act.com/Article_8.html
14. Risk Hub, "Three Lines of Defense Model Explained." https://riskhub.org/blogs/three-lines-of-defense-model-explained
15. Umbrex, "Three Lines of Defense risk-governance model." https://umbrex.com/resources/frameworks/organization-frameworks/three-lines-of-defense-risk-governance-model/
16. ISACA Journal 2018 v4, "Roles of Three Lines of Defense for Information Security and Governance." https://www.isaca.org/resources/isaca-journal/issues/2018/volume-4/roles-of-three-lines-of-defense-for-information-security-and-governance
17. Patronusec, "PCI DSS Network Diagrams." https://patronusec.com/en/pci-dss-network-diagrams-requirements/
18. Risk Cognizance, "PCI DSS v4.0" (1.2.3, 1.2.4, 3.6.1, 3.6.1.1). https://riskcognizance.com/framework/pci-dss-v4.0
19. GDPR.eu, "DPIA template" (Art 35 elements). https://gdpr.eu/data-protection-impact-assessment-template/
20. gdpr-info.eu, Art 35 GDPR. https://gdpr-info.eu/art-35-gdpr/ (Art 25: https://gdpr-info.eu/art-25-gdpr/)
21. OCC Bulletin 2023-17. https://www.occ.gov/news-issuances/bulletins/2023/bulletin-2023-17.html
22. Federal Register, Interagency Guidance on Third-Party Relationships (88 FR 37920). https://www.federalregister.gov/documents/2023/06/09/2023-12340/interagency-guidance-on-third-party-relationships-risk-management
23. Capco, "Interagency Guidance On Third Party Risk Management." https://www.capco.com/intelligence/capco-intelligence/interagency-guidance-on-third-party-risk-management
24. Vanta, "Automated compliance." https://www.vanta.com/products/automated-compliance
25. soc2auditors.org, "Vanta Review 2026." https://soc2auditors.org/insights/vanta-review/
26. Truvo Cyber, "SOC 2 Automation: What Vanta & Drata Don't Cover." https://truvocyber.com/blog/soc2-automation-compliance-as-code-guide
27. Gist Security, "The Change Coverage Gap." https://www.gist.security/blog/change-coverage-gap-unreviewed-security-changes/
28. Pixee, "Security Backlog Remediation" (cites ESG 2023 1:100 ratio). https://www.pixee.ai/blog/security-backlog-remediation-plan
30. Gist Security, "The Five Security Review Process Challenges of 2026." https://www.gist.security/blog/security-review-process-challenges-2026/
31. AlleyWatch, "Prime Security Raises $20M." https://www.alleywatch.com/2025/12/prime-security-product-design-stage-management-agentic-ai-security-architect-michael-nov/
32. Prime Security press release. https://www.primesec.ai/resources/prime-security-raises-20m-from-scale-venture-partners-to-transform-product-security-with-the-first-agentic-security-architect
33. Atlassian Marketplace, "Auditable: Document Control, Approvals & Audit Evidence." https://marketplace.atlassian.com/apps/2043716941/auditable-document-control-approvals-audit-evidence
34. AWS Marketplace, Seezo Security Design Review. https://aws.amazon.com/marketplace/pp/prodview-clxugwcqh2r5o
35. Gartner Peer Insights, Seezo. https://www.gartner.com/reviews/product/seezo
36. Sparx Systems, "Architecture Review Board." https://sparxsystems.com/enterprise_architect_user_guide/14.0/guidebooks/ea_architecture_review_board.html
37. GCwiki, "GC Enterprise Architecture/Board." https://wiki.gccollab.ca/GC_Enterprise_Architecture/Board
38. GCwiki, "GC Enterprise Architecture/10 Things You Need to Know." https://wiki.gccollab.ca/GC_Enterprise_Architecture/10_Things_You_Need_to_Know
39. N. Malik, "Changing the Role of the ARB" (LinkedIn). https://www.linkedin.com/pulse/changing-role-arb-nick-malik
40. Internal Audit Guide, "Archer vs ServiceNow IRM." https://internalauditguide.com/2026/09/archer-vs-servicenow-irm/
41. Decryption Digest, "ServiceNow vs Archer vs Drata." https://www.decryptiondigest.com/blog/guide-finding-best-grc-tools
42. BD Emerson, "ServiceNow IRM vs GRC." https://www.bdemerson.com/article/servicenow-irm-vs-grc
43. RegScale, "Why Spreadsheets Still Dominate GRC in 2026" (cites State of GRC 2026 survey, n=748, and RegScale CCM survey, n=250+). https://regscale.com/blog/grc-spreadsheets-problem-symptom/
44. WatchDog Security, "ISO 27001 A.8.27." https://watchdogsecurity.io/iso-27001/secure-system-architecture-and-engineering-principles
45. High Table, "ISO 27001 Clause 7.5.3." https://hightable.io/iso27001-clause-7-5-3-control-of-documented-information-essential-guide/
46. WatchDog Security, "ISO 27001 Clause 7.5.3." https://watchdogsecurity.io/iso-27001/control-of-documented-information
47. episki, "SOC 2 Change Management CC8.1." https://episki.com/frameworks/soc2/change-management
48. Design Compliance and Security, "SOC 2 CC8." https://www.designcs.net/soc-2-cc8-common-criteria-related-to-change-management/
49. Modulos, "DORA overview" (applies from 17 Jan 2025). https://docs.modulos.ai/frameworks/dora/index
50. EUR-Lex, Commission Delegated Regulation (EU) 2024/1774. https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX%3A32024R1774
51. IVASS PDF of Delegated Regulation 2024/1774. https://www.ivass.it/normativa/internazionale/internazionale-ue/regolamenti-europei/rd-2024-1774/Delegated_Regulation_2024_1774_of_13_march_2024.pdf
52. digital-operational-resilience-act.com (ITS 2024/2956 register of information). https://www.digital-operational-resilience-act.com/
53. OCC News Release 2020-101, Capital One $80M. https://occ.treas.gov/news-issuances/news-releases/2020/nr-occ-2020-101.html
54. The Open Group, TOGAF 7 "IT Architecture Compliance." https://www.opengroup.org/architecture/togaf7-doc/arch/p4/comp/comp.htm
55. TOGAF 9.2 Architecture Compliance Review text (mirror). https://groups.google.com/g/enballotar/c/I0H6mMsLw2Y
56. Canada.ca, "Government of Canada Enterprise Architecture Framework." https://www.canada.ca/en/government/system/digital-government/policies-standards/government-canada-enterprise-architecture-framework.html
57. Hava, "Architecture Review Board Checklist." https://www.hava.io/blog/architecture-review-board-checklist
58. ISMS.online, "ISO 27001 Clause 7.5.3." https://www.isms.online/iso-27001/requirements-2022/how-to-implement-iso-27001-2022-clause-7-5-3-control-of-documented-information/
59. Finrep, "Design vs Operating Effectiveness Testing Under SOX." https://www.finrep.ai/blog/design-vs-operating-effectiveness-testing-under-sox-2026-practitioner-walkthroug
60. Roz, "Control Design Testing vs Operating Effectiveness." https://www.getroz.com/blog/control-design-vs-operating-effectiveness
61. soc2auditors.org, "SOC 2 Type 2 Controls." https://soc2auditors.org/insights/soc-2-type-2-controls/
62. Linford & Co., "SOC 1 vs SOC 2." https://linfordco.com/blog/soc-1-vs-soc-2-audit-reports/
63. soc2auditors.org, "SOC 2 Sample Size." https://soc2auditors.org/insights/soc-2-sample-size/
64. GovernanceDocs, "SOX Control Testing: Sample Sizes." https://governancedocs.com/sox-control-testing/
65. Ledger Audits, "SOC 2 Sample Sizes." https://www.ledgeraudits.com/blog/soc-2-sample-size
66. Drata, "Continuous Drift Detection." https://drata.com/learn/agent-gov/continuous-drift-detection
67. Ampcus Cyber, "What Is Compliance Drift?" https://www.ampcuscyber.com/knowledge-hub/what-is-compliance-drift/
68. Vanta Help Center, "Alternative Compliance Paths." https://help.vanta.com/en/articles/11345426-alternative-compliance-paths
69. Vanta, "CIS v8" (policy templates, document tracking). https://www.vanta.com/products/cis-v8
70. Flowdence, "Confluence Page Approval Workflow Guide." https://flowdence.io/blog/posts/the-complete-guide-to-confluence-approval-workflows/
71. AppFox, "Confluence Version Control." https://www.appfox.io/blog/confluence-version-control-everything-you-need-to-know/
72. DEV Community, "Well-Architected Agent: architecture review becomes a weekly process." https://dev.to/fernando_azevedo_6844e930/well-architected-agent-architecture-review-becomes-a-weekly-process-58o
73. Compyl, "Unify Scattered Compliance Tools." https://compyl.com/blog/unify-scattered-compliance-tools-workflows/
74. HBR, "AI-Generated 'Workslop' Is Destroying Productivity" (Sept 2025). https://hbr.org/2025/09/ai-generated-workslop-is-destroying-productivity
75. PCMag, "AI 'Workslop' Is Plaguing American Companies." https://www.pcmag.com/news/ai-workslop-is-plaguing-american-companies-says-stanford-research
76. The Neural Base, "Policy generation." https://theneuralbase.com/ai-for-security/learn/beginner/policy-generation/
77. Linford & Co., "Shadow AI and SOC 2." https://linfordco.com/blog/shadow-ai-soc-2/
78. OCC News Release 2020-134, Morgan Stanley $60M. https://www.occ.gov/news-issuances/news-releases/2020/nr-occ-2020-134.html
79. EU AI Act Service Desk, Article 14. https://ai-act-service-desk.ec.europa.eu/en/ai-act/article-14
80. Alice Labs, "EU AI Act for Financial Services." https://alicelabs.ai/en/insights/eu-ai-act-for-financial-services
81. Censinet, "AI in SOC 2 Reporting." https://censinet.com/perspectives/ai-soc-2-reporting-transforming-audit-processes
82. WatchDog Security, "SOC 2 CC8.1." https://watchdogsecurity.io/soc2/authorize-test-and-implement-changes
83. Seekr, "Model Risk Management for Generative AI: SR 11-7." https://www.seekr.com/resource/model-risk-management-generative-ai-sr-11-7/
84. Vanta, "Custom frameworks." https://www.vanta.com/products/custom-frameworks
85. ServiceNow Docs, "Export in OSCAL format." https://www.servicenow.com/docs/r/governance-risk-compliance/grc-continuous-authorization-and-monitoring-workspace/oscal-support-cam.html
86. TruthVouch Docs, "OSCAL Export Format." https://docs.truthvouch.ai/platform/compliance/exports/oscal/
