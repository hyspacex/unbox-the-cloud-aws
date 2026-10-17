# EpistemicBox

## Pull requests for enterprise decisions

**Files have versions. Team agreement should have versions too.**

EpistemicBox is an Idea Hub for enterprise proposals. Teams upload documents to
Box, compare a candidate proposal against the last approved baseline, review
evidence-backed changes, and approve the exact revision they intend to accept.
The history connects what changed, when the system observed it, who reviewed it,
and which proposal version became the team's accepted baseline.

**Architecture in one sentence:** Box provides content, metadata extraction, AI
analysis and human review tasks; AWS provides the application, workflow
orchestration and version-bound decision ledger.

> Status: product and architecture proposal. This repository does not yet contain
> a working application or deployed infrastructure. API availability, licenses,
> AI units, permissions and behavior must be tested in the hackathon tenant.

## The problem

A proposal can retain its title and most of its wording while quietly changing
its budget, data handling or implementation scope. File history records uploads;
an old approval does not explain whether the team accepted these new commitments.

EpistemicBox makes **agreement drift** visible:

- Compare with the last approved revision, not merely the previous upload.
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

## User journey

1. Select a Project Template and create a project.
2. Upload or select proposal documents in Box and assign document roles.
3. Capture a revision manifest containing each document's exact version.
4. Extract relevant fields with Box AI and compare with the approved baseline.
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

## Design documents

- [Architecture and API breakdown](docs/architecture.md)
- [Enterprise demo and acceptance plan](docs/demo.md)

## Trust boundaries

AI proposes findings; humans approve. Model output cannot select arbitrary
privileged users, execute workflow code or grant approval. An application role
does not grant Box content access. An approved baseline does not restrict users
who independently access newer drafts in Box.

The ledger is intended to be auditable, not automatically tamper-proof or
compliance-certified. No detection accuracy or latency claims have been measured.
