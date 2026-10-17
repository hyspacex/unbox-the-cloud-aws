# Working brief: folder-level continuous compliance for design documents

Context: Box + AWS Agentic Enterprise AI Hackathon, Seattle, Oct 16-17 2026.
Judging: 50% technical execution ("pushing the limits of tools, working demo, scalable design"),
30% business value ("solves a problem, enterprise-ready"), 20% presentation ("3 minutes flat").
Team of 3, under 6 hours of build time on Saturday morning, submission 1pm, presentation 2pm.
Must use Box and AWS. Code must be written during the hackathon.

## The idea (working version, to be pressure-tested)

A project lives in a Box folder: architecture doc, data-flow doc, DPIA, runbook, vendor
contract, etc. The project must satisfy a named control list (think: a bank's architecture
review board checklist derived from ISO 27001 / SOC 2 / PCI DSS / DORA style controls).

When a new file lands in the folder, or a file gets a new version, a Bedrock-powered agent:
1. Reads the new file in the context of the whole folder.
2. Reasons about which controls it affects. A control can be satisfied by evidence spread
   across several documents.
3. Detects regressions: a new version silently removed the encryption-at-rest statement,
   so control 4 flips from Satisfied back to Open. Catching what disappeared is the hero.
4. Writes an evidence event for each status change: control, file, version, exact quote,
   verdict, confidence.
5. Writes the control status to Box Metadata on the folder/files so Box itself shows it.
6. A human reviewer confirms or overrides each AI finding. Only a human can mark a
   control Verified. AI never self-approves.

The folder's compliance history is rendered as an evidence timeline: control by control,
when each became satisfied, which file version proved it, who verified it, and when
something regressed. Two audiences: the project team ("what is missing, what do I do next")
and the auditor / review board ("show me the evidence trail").

## Why this and not the alternatives

- Box Automate already does: classify an upload, run fixed checks, notify, assign approval.
  We must NOT rebuild that. We position on top of it: Automate checks completeness;
  we check whether the controls are actually satisfied by the content, across files, over time.
- A "movie timeline" with no user is presentation sugar. The timeline must be an evidence
  ledger an auditor would accept.
- Approve/reject must mean: human confirms or overrides an AI compliance finding
  (human-in-the-loop on the AI verdict), not re-approving a settled fact.

## Open questions the research must answer

- Who exactly is the user (role, title, daily workflow)? What do they do today? What breaks?
- Which control frameworks actually get applied to architecture / design documents in
  banks and regulated enterprises? What does an architecture review board checklist look like?
- What evidence does an auditor accept? What does "continuous compliance" mean for documents
  as opposed to infrastructure (Vanta / Drata territory)?
- What AWS agentic offerings are real, usable in 6 hours, and impressive to AWS judges?
- What Box AI offerings are real and usable, and where exactly is the line between what Box
  Automate / Box AI already do and what we add?
- What is the single hero moment for a 3-minute demo?
- What would make an enterprise architect or compliance lead say "I would actually use this"?
