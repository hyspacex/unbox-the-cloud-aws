# Idea selection record (Oct 16 2026, evening before submission)

This file captures the decision process for what to build at the Box + AWS
Agentic Enterprise AI Hackathon. It is the context behind the code, so a teammate
or a Claude session starting cold can see what was considered and why.

Related files:
- `docs/one-pager.md`: the original idea (#1), Epistemic Review & Context Governance.
- `README.md`, `docs/architecture.md`, `docs/demo.md`, `docs/idea-evolution.md`, `demo/index.html`: the second idea (#2), EpistemicBox / agreement drift, now at V3 with folder intake and a Bedrock decision model.
- `docs/idea3-discussion.md`: transcript and summary of the voice memo where idea #3 was proposed.

## The hackathon

Source: the Luma registration page linked from Devpost. The Devpost page lists
judging as "TBD"; Luma has the real rubric.

| Weight | Criterion | Organizers' words |
| --- | --- | --- |
| 50% | Technical execution | pushing the limits of tools, having a working demo, scalable design |
| 30% | Business value | solves a problem, is enterprise-ready |
| 20% | Presentation | clearly communicates all of the above in 3 minutes flat |

Rules: coded during the hackathon, GitHub link, must use Box and AWS, teams of 2 to 4.
Schedule Sat Oct 17: submission 1pm, presentations 2pm, judging and awards 4pm.
Judges: a mix of tech execs and engineers.

Implications: a stalled demo loses half the points, so a mock-mode safety net
matters more than feature count. "Scalable design" is scored even though nothing
is deployed, so one architecture slide is worth real points. Presentation is
the cheapest 20 points on the board.

## The three ideas

### #1 Epistemic Review (one-pager)

Asks: *is this document true?* AI makes it easy to write 10 confident pages.
The product surfaces the 5 to 7 load-bearing claims, lets the reviewer's own
agent test them against private plus shared context, posts a Challenge Card
to Box with private sources stripped, and marks claims Human-Verified in Box
Metadata so downstream agents only consume verified claims.

Strength: the most original insight, a Bedrock agent doing real reasoning,
a visible trust mechanic (private-source stripping), and a direct answer to
agent governance. Weakness: "load-bearing claim" extraction is fuzzy, and a
teammate called the idea "too vague."

### #2 EpistemicBox / agreement drift (this repo's README)

Asks: *did we agree to this?* A proposal gets approved, someone edits one
sentence, the plan is materially different, the old approval still shows.
Compare candidate against approved baseline, flag material changes, route to
the right human via Box Tasks, promote a version-bound baseline into a ledger.

Strength: clearest enterprise buyer, fits Box primitives (versions, metadata,
Tasks). Weakness: it is an approval workflow with a decision ledger, which the
one-pager explicitly rejected; the live approval on stage is the riskiest demo
step; AWS is plumbing (Step Functions, DynamoDB) rather than intelligence.
A teammate called it "easy to build but too simple."

### #3 AI-routed compliance checklists with a timeline (voice memo)

Asks: *does this packet meet the checklist?* AI classifies an upload, routes
it to a fixed admin-configured checklist (onboarding, design review, security
review), checks deterministically, records an audit trail, and replays file
history as a timeline of when each criterion was met. Pitch line: "configure
anything, cover everything."

Strength: safest build, nothing can fail interestingly on stage. Weakness:
everything except the timeline is Box Automate (see below). On the recording
nobody could say what the timeline was for. A teammate noted it collapses into
#2's Project Template, and that it resembles the driver's-license extraction
demo Box already showed.

Unresolved on the recording: self-evolving template (one teammate wanted it,
the proposer said too hard and that compliance criteria must stay fixed).

## Box Relay and Box Automate

Box Relay is Box's older no-code workflow builder. Its public API only lists
and starts existing manual-start workflows. Box's developer docs say new builds
should use Box Automate.

Box Automate is Relay with AI as a native step: triggers scoped to folders or
metadata, a Box AI step that extracts or classifies and branches on the result,
outcomes including apply metadata, assign approval task, notify. Box recommends
an approval task after every AI step. Box's support site describes "continual
learning that adapts to new document formats."

Mapped against #3: AI classification, routing to fixed checklists, admin
configuration, human review on failure, and learning are all Automate. The
compliance timeline is not. Box Automate has per-workflow run history, file
version history, current metadata values, and per-task approval records, but
nothing assembles them into "how this project reached compliant over time."

Conclusion: do not compete with Automate. The honest framing is "Automate
checks the document is complete. We check whether it is true."

## Comparison

| | #1 Epistemic Review | #2 Agreement drift | #3 Routed checklists |
| --- | --- | --- | --- |
| Core question | Is it true? | Did we agree? | Does it pass the checklist? |
| Governance unit | Claim | Document version | Checklist item |
| Build certainty (6 h) | Medium | Lowest (live approval) | Highest |
| Story strength | Strongest | Medium | Weakest as pitched |
| AWS role | Bedrock agent is the brain | Plumbing | Bedrock classifies |
| Overlap with Box products | Low | Medium (Tasks, Extract) | High (Automate) |
| Fatal weakness | Fuzzy extraction | Live approval on stage, AWS as plumbing | It is Automate; timeline had no purpose |

## Recommendation: build #1, fixed with the best piece of #2 and #3

This is one analysis for the team to weigh against the V3 work on idea #2 described below. The team decides.

Each idea's fatal weakness is cured by a piece of another idea.

| Weakness | Cure | Borrowed from |
| --- | --- | --- |
| #1 extraction is vague | A review template fixes the criteria. Claims are the sentences that answer the template's questions. | #3 fixed criteria |
| #2 needs live approval | Drop the workflow. Keep "verified against file version N" as one field on the claim. | #2 version binding |
| #3 timeline has no purpose | Timeline shows when each criterion became Human-Verified and against which version. | #3 timeline, #2 version binding |

### Finalized idea in one paragraph

A design-review template defines the 5 to 7 questions every design doc must
answer (latency, cost, data region, failover, scalability, rollback). Bedrock
reads the doc and pulls out the one sentence that answers each question. Those
are the load-bearing claims. Each gets a Box Metadata status. The reviewer's
own Strands agent challenges one claim using private notes the author cannot
see, and posts a Challenge Card to Box with private sources stripped. When the
reviewer marks a claim Human-Verified it is bound to the exact Box file
version. The project timeline shows when each criterion became verified.
Downstream agents get only verified claims.

### Scoring against the rubric

- Technical execution: two Bedrock jobs (template-guided extraction, Strands reviewer agent over private plus shared context), Box AI, Box Metadata, Box comments, and file versions all written to, a visibly enforced private-source stripping step. Mock mode guarantees "working demo."
- Business value: AI-written docs flood Box and downstream agents read unverified filler as truth. Enterprise-ready is answered by the governed endpoint and the Human-Verified gate.
- Presentation: three acts, one hero claim, one Box tab switch.

### Cut without discussion

Self-evolving templates. Live Box Task approvals. Automate-style routing between
many checklists. Multi-document cross-file conflict detection. A real MCP server
(call it a governed endpoint). Any deploy, any auth.

### Build order

1. Template plus Bedrock extraction on one hardcoded doc. Run three times. Nothing else starts until the hero claim lands all three.
2. Signal View with status badges from the template.
3. Reviewer agent with one private notes file, Challenge Card, Box comment write with stripping.
4. Status flip, Box Metadata write, timeline from stored events, governed endpoint.
5. Rehearse three times with a canned JSON fallback for every model call.

Freeze features by 11am Saturday. Record a backup video by noon. Spend the last
hour on the README and the 3-minute script. If extraction is unreliable at the
end of hour 2, keep the agent in Act 2 real and mock extraction.

## End-user experience

You are a senior engineer. A teammate drops a 12-page, mostly AI-written
design doc into the team's Box folder and asks you to review it.

1. You open it in the app and hit Signal View. The filler goes gray. Six sentences stay bright, each labeled with the template question it answers. These are the claims the doc rests on.
2. One is red: "Replication latency stays under 50ms." Red means it contradicts your private Q3 pilot notes. Only you see that badge.
3. You click it. A panel suggests "Does this hold under burst load?" You click it. Your agent reads your private notes, the shared folder, and the web, and returns an evidence list and a verdict: contradicted.
4. You add one sentence of judgment and hit Post. A comment appears on the doc in Box with the question, public evidence, and verdict. Where your private notes were it says "2 private sources withheld." The badge flips to Challenged.
5. The author fixes the number. You mark it Verified. The badge turns green and records "verified against version 4." The timeline shows each criterion turning green over the last two weeks.
6. Any agent reading this folder later gets only the green claims.

## Skepticism and answers

### What if the suggested question is wrong or irrelevant?

It will be, sometimes. The design assumes that:

- A suggestion never acts. A human triggers every write to Box. The blast radius of a bad suggestion is one wasted glance.
- Suggestions come from humans, not thin air. They are drawn from the team-written template's checklist for the claim's category plus whatever contradicted it in the reviewer's private notes. Show the provenance next to each question ("suggested because: template criterion L2, your Q3 notes p.3").
- Log whether each suggestion was clicked, edited, or ignored. That is the self-evolving template done safely: humans edit the template, usage data tells them what to edit. Future work.

Stage line: "The agent proposes. The reviewer decides. Every question the agent suggests is traceable to a criterion your team wrote."

### A project has many files, the demo reviews one

The one-doc demo is a scope cut, not a design limit. The Box folder is the
project. Every claim is keyed by file id and version. The folder view rolls
files up (4 files, 23 claims, 17 verified) and the timeline is the same rollup
over time. The template has document roles, so each file is checked against
its slice. Cross-file conflict (architecture doc says EU-only, finance doc
budgets US egress) is the same machinery pointed at two files; it is a
follow-on. For the demo, seed three files in the mock folder so the folder view
and timeline are visibly multi-file, and run the full flow on one.

### Gaps to admit on stage rather than hide

- No authentication. The reviewer's agent should run under the reviewer's own Box identity. The demo uses one service credential.
- State is a local JSON cache. Box Metadata is the intended system of record and the demo writes to it, but the app store is not production storage.
- Claim extraction quality is unmeasured. The template makes it reliable enough for a demo; an enterprise would want a held-out set and a precision number.
- Prompt injection. The doc under review is untrusted text fed to an agent with private-note access. The write path strips private sources, but production needs the agent's tools scoped so the document cannot steer it.

The way to win "enterprise-ready" is not to claim it. It is to show the
decisions that matter for an enterprise were made on purpose (human gate,
Box-native audit trail, reviewer-scoped permissions, version-bound
verification) and to name the gaps in one breath.

## Idea #2 V3, pushed in parallel with this analysis

While this record was being written, a teammate pushed a V3 of idea #2:

- Folder intake: a project owner selects a Box folder, and an Amazon Bedrock decision model suggests the Project Template, maps each file to a document role, and flags missing documents.
- Decision tier: Bedrock classifies the proposal as Type 1 (one-way door) or Type 2 (two-way door) and flags escalations between folder versions.
- Idea evolution view: changes between revisions are labeled Added, Pivoted, Removed, or Retained. `docs/idea-evolution.md` dogfoods this on our own project history.
- `demo/index.html`: an interactive HTML prototype of the commit timeline and Box sidebar diff.

How it relates to this analysis:

- It answers the "AWS is plumbing" weakness of #2. Bedrock now has a reasoning job at intake, which helps on the 50% technical-execution line.
- The Added / Pivoted / Removed view is the same instinct as #3's timeline, with a purpose attached: what disappeared since we last agreed.
- It keeps the live Box Task approval on stage, which remains the riskiest demo step. The pending-step fallback in `docs/demo.md` is the mitigation.
- It still scopes out private reviewer context, which is the piece of #1 that no Box product offers.

Both paths are documented here so the team can choose with the rubric in view.
Whichever is chosen, the architecture in `docs/architecture.md` (Cognito, Step
Functions, DynamoDB, webhooks) is the scalable-design slide, not the six-hour build.
