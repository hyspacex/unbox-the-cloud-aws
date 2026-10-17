# EpistemicBox

> **Idea comparison (Oct 16 2026, evening):** this README describes idea #2 (agreement
> drift, now at V3 with folder intake and the Bedrock decision model). Three ideas were
> compared against the official judging rubric in [docs/idea-selection.md](docs/idea-selection.md),
> which recommends idea #1 (Epistemic Review) with fixed review criteria and version-bound
> verification borrowed from #2 and #3. That is a recommendation for the team to weigh, not
> a decision. See [docs/one-pager.md](docs/one-pager.md) for idea #1 and
> [docs/idea3-discussion.md](docs/idea3-discussion.md) for the idea #3 transcript.

## Pull requests for enterprise decisions

**Files have versions. Team agreement should have versions too.**

EpistemicBox is an Idea Hub for enterprise proposals. Teams upload documents to
Box, compare a candidate proposal against the last approved baseline, review
evidence-backed changes, and approve the exact revision they intend to accept.
The history connects what changed, when the system observed it, who reviewed it,
and which proposal version became the team's accepted baseline.

**Architecture in one sentence:** Box provides folder storage, metadata templates, AI extraction/citations and human review tasks; AWS provides the Idea Hub, an Amazon Bedrock decision model that recommends the right Project Template for an uploaded folder, Step Functions orchestration and a version-bound decision ledger.

> Status: product and architecture proposal. This repository does not yet contain
> a working application or deployed infrastructure. API availability, licenses,
> AI units, permissions and behavior must be tested in the hackathon tenant.

## The problem

A proposal can retain its title and most of its wording while quietly changing
its budget, data handling or implementation scope. File history records uploads;
an old approval does not explain whether the team accepted these new commitments.

EpistemicBox makes **agreement drift and idea evolution** visible:

- Compare with the last approved revision, not merely the previous upload.
- Visually track which sub-ideas or commitments were **`+ Added`**, **`↻ Pivoted`**,
  **`− Removed`**, or **`✓ Retained`** across a revision history graph.
- Separate material changes from harmless paraphrases.
- Show before/after evidence and source references.
- Route changes to the appropriate business reviewers.
- Keep approval bound to exact document versions and a specific change set.
- Preserve rejection, revision and approval history without rewriting it.

"Git for ideas" is a product metaphor. Git hosting, arbitrary branching and
automatic document merging are not part of the MVP.

## Project Templates

Different proposals need different review standards. A **Project Template** is
an EpistemicBox-managed group of Box Metadata Templates, document-role mappings,
extraction configurations and approval rules.

Example: **Enterprise AI Initiative / v1**

| Template | Example fields |
| --- | --- |
| Business Case | Objective, scope, owner, acceptance criteria |
| Architecture | Deployment region, dependencies, capacity, SLA |
| Data & Privacy | Data classification, retention, third-party processing |
| Finance | Annual cost, setup cost, budget limit |

Box Extract can suggest a metadata template from reference documents in its
native Custom Extract Agent builder. An administrator reviews the suggested
fields and extraction instructions. Idea Hub references the resulting templates
and groups them into a versioned Project Template.

Template generation is verified as a Box product UI capability, not assumed to
be a public API. Reference documents define review criteria; they do not
automatically become approved business facts.

### Folder intake with Amazon's decision model

Instead of manually tagging every file, a project owner uploads or selects a
**Box folder of documents**. An **Amazon Bedrock decision model** (`Converse`
API) inspects the folder inventory and document summaries against the controlled
template registry and Amazon's **Type 1 (One-Way Door) vs. Type 2 (Two-Way Door)**
decision framework:

1. **Suggests the Project Template bundle** best matching the folder (for example,
   `Enterprise AI Initiative / v1`, `Vendor Onboarding / v1`, or `Internal Fast-Track Pilot / v1`).
2. **Classifies the decision tier** (`Type 1 One-Way Door` for irreversible or
   high-consequence commitments such as cross-border data transfer, sensitive data
   or major spend; `Type 2 Two-Way Door` for bounded reversible experiments).
3. **Maps each file in the folder to a document role** (`Proposal.docx -> Business Case`,
   `Architecture.pdf -> Architecture`, `DPIA.docx -> Data & Privacy`,
   `Budget.xlsx -> Finance`) so the matching Box Metadata Template runs on each file.
4. **Flags missing required documents or tier escalations** (for example, when a
   folder shifts from a Type 2 pilot to a Type 1 rollout).

The project owner confirms or adjusts the recommendation before extraction and
approval routing run.

## User journey

1. Upload or select a Box folder of project documents.
2. Review and confirm the Amazon Bedrock decision model's suggested Project
   Template, Type 1 / Type 2 decision tier and file-to-role mapping.
3. Capture a revision manifest containing each folder document's exact version.
4. Extract relevant fields across the folder with the grouped Box AI Metadata
   Templates and compare with the approved baseline.
5. Inspect material changes, old/new excerpts and unresolved evidence.
6. Confirm a proposed review plan and create Box review tasks.
7. Reviewers approve or reject using their own Box identities.
8. Promote the candidate only if all required approvals and version checks pass.
9. Explore the decision timeline or retrieve the approved revision.

## Hackathon scope

Build one enterprise scenario, one Project Template bundle, a before/after
review screen, two approval roles, real Box Tasks and an auditable timeline.

Do not start with a vector database, a general workflow designer, private
reviewer-context reasoning, MCP, real Git integration or compliance certification.
Cross-document conflict detection is a follow-on capability.

## Design documents & interactive prototypes

- [Cross-Platform Desktop Client (`desktop-client/README.md` — Windows & macOS Tesla-inspired 2-Box HUD)](desktop-client/README.md)
- [Desktop Client Widget UI (`desktop-client/widget.html`)](desktop-client/widget.html)
- [Interactive Web Interface Prototype (`demo/index.html`)](demo/index.html)
- [Keel Design Spec v3.3 (`docs/research/30-design-v3.md`)](docs/research/30-design-v3.md)
- [Architecture and API breakdown](docs/architecture.md)
- [Enterprise demo and acceptance plan](docs/demo.md)
- [Idea evolution history: V1 One-Pager to V3 current design](docs/idea-evolution.md)

### Cross-Platform Desktop Client (`desktop-client/`)

In addition to the web interface, the repository includes a cross-platform
**Windows & macOS Desktop Client** ([`desktop-client/`](desktop-client/README.md))
styled with minimalist **Tesla HMI design elements**:

- **Lightweight native shell:** Tauri uses WebView2/WKWebView instead of
  distributing Chromium or requiring Python.
- **Compact progressive disclosure:** two icon counters, hover previews and
  click/long-hover checklist accordions. Neutral change notifications can
  expand, collapse and dismiss independently of the current review status.
- **Project links:** an installed `keel://` handler reuses the running widget,
  exchanges a one-time connection code, and polls the selected project's
  authorized state. See the [service contract](desktop-client/project-connection.md).
- **Clear prototype boundary:** local fixture mode is visibly labelled.
  File/folder drops do not yet upload to Box or run an evaluation. Uploading
  a file never automatically grants human verification.
- **Installation:** Windows setup and macOS app/DMG build targets are included.
  Native macOS validation and production signing remain separate release steps.

![Desktop Client Main HUD](desktop-client/screenshots/hud-main.png)

## Trust boundaries

AI proposes findings; humans approve. Model output cannot select arbitrary
privileged users, execute workflow code or grant approval. An application role
does not grant Box content access. An approved baseline does not restrict users
who independently access newer drafts in Box.

The ledger is intended to be auditable, not automatically tamper-proof or
compliance-certified. No detection accuracy or latency claims have been measured.
