# Enterprise Demo and Build Plan

## Scenario: a bank's customer-support AI rollout

Use synthetic documents and identities. A bank approved a constrained pilot.
A revised rollout proposal quietly changes an approved data-processing
commitment. The on-stage story focuses on one change and one required Privacy
reviewer. Finance and multi-role routing remain supporting test fixtures.

| Dimension | Approved V1 | Candidate V2 |
| --- | --- | --- |
| Processing region | EU | US |
| Log retention | 30 days | 30 days (unchanged) |
| Annual budget | USD 60,000 | USD 60,000 (unchanged) |

Also introduce a harmless wording change. The system should distinguish it
from material agreement drift.

Select an Enterprise AI Initiative Project Template containing Business Case,
Architecture, Data & Privacy and Finance metadata templates. For a compact demo,
the relevant values can be in one proposal document; expand to multiple roles
only after the end-to-end path works.

## Three-minute stage plan: 60-second introduction, 100-second demo

Do not squeeze the full product tour into three minutes. Show one material
change, its exact evidence, one real review and the accepted baseline.
The target is a visible agreement-drift reveal within 15 seconds of opening
the demo, not a claim that live AI inference finishes in 15 seconds.

| Time | Action | Proof |
| --- | --- | --- |
| 0:00-0:15 | Introduce team name and members' actual build responsibilities in one sentence | No individual biographies or invented credentials |
| 0:15-0:40 | Explain the bank's problem: an approved EU-only plan becomes a US rollout draft | Old approval is not consent to a new commitment |
| 0:40-1:00 | State the promise and show one architecture strip: Box content/AI/review, AWS app/workflow/ledger | The platform roles are clear without an architecture tour |
| 1:00-1:15 | Open the prepared comparison: "EU only" becomes "US processing" while V1 remains approved | A large before/after card exposes the hidden change immediately |
| 1:15-1:35 | Expand the old/new source excerpts, version IDs and observation time | The finding has inspectable evidence, not just an AI verdict |
| 1:35-1:55 | Confirm the review plan and create the required Privacy review task in Box | A detected change becomes a real assigned workflow |
| 1:55-2:20 | The actual reviewer approves the synthetic region exception in a pre-opened Box tab; refresh authoritative status | Consent is a human action on a version-bound review packet |
| 2:20-2:40 | Show V2 becoming the accepted baseline and the decision timeline; open a pre-existing unapproved V3 | V2's approval cannot authorize V3; the accepted endpoint still resolves V2 |
| 2:40-2:50 | Deliver the closing line | Restate the business value |
| 2:50-3:00 | Buffer | No new feature or extra click |

The stage fixture's explicit policy requires only the Privacy reviewer for this
synthetic exception. It is a fictional business decision, not a legal/compliance
determination. If the actual policy requires other reviewers, satisfy those
requirements; never silently skip them for timing.

V3 is an independently prepared unapproved draft, not a new upload or a second
inference run on stage. Keep comparison viewing separate from submitting a
candidate for review: open V3 only after V2 has been promoted. Viewing a prepared
draft must not silently supersede an active review.

### Suggested spoken lines

- Team: "We are [team name]. [Names] built the Box integration, AWS workflow and
  review experience." Replace placeholders with true names and responsibilities.
- Problem: "Your team approved EU-only processing. Someone changes one sentence
  to US processing. The document still looks approved. Did your team agree?"
- Reveal: "This is not a wording change. It changes where customer data goes."
- Review: "Box AI found the difference. It cannot approve it. The assigned
  reviewer must make that decision."
- Payoff: "Now we can show exactly what changed, who accepted it, and which
  version that acceptance applies to. The next draft does not inherit consent."

All example times and business facts are synthetic. Live inference and live
human review must be accurately described. Any replay or fixture must be
explicitly labeled; no hidden prerecorded "live" responses.

### Stage preparation and latency contract

- Prepare the Box Project Template bundle before the presentation. Show a
  template badge, not template creation, OAuth, uploads or configuration screens.
- Run real Box extraction/comparison beforehand for the exact V1/V2 snapshots.
  Label the screen "Pre-analyzed with Box AI" and retain source/version references.
  Say explicitly that analysis ran before the presentation.
- Keep the live part focused on task creation, the actual review decision,
  reconciliation and baseline promotion. Do not call those live unless they are.
- Pre-open the real reviewer's authenticated Box session on a separate tab or
  device, using synthetic documents. No password/MFA step belongs on stage.
- Show one main screen with an approved-baseline badge, the before/after card,
  review status and a compact timeline. Use one source expansion and one Box tab
  switch, not a tour across service consoles.
- Give each asynchronous live step a 10-second stage wait budget. This is a
  presentation cutoff, not a service SLA. If a step is still pending, show its
  actual state and switch to an explicitly labeled recorded walkthrough.
- Prepare a short, honestly labeled recording of the same scenario for outages.
  Never swap in canned successful approvals or falsely promote the baseline.

Closing line: **Files have versions. Team agreement should have versions too.**

## Rehearsal acceptance

These are targets to measure, not achieved results:

- The complete talk, including the team introduction, ends within 180 seconds.
- The scripted content ends by 170 seconds, leaving 10 seconds of buffer.
- The first visible before/after reveal occurs by 1:15.
- No live upload, template authoring, login or second AI run is required.
- The audience can read the old value, new value and accepted version on screen.
- A prepared unapproved V3 cannot inherit V2's approval.
- Rehearse three complete runs; record elapsed times and exercise the pending-step
  fallback before claiming stage readiness.

## Build sequence

1. **Prove tenant prerequisites:** Box AI/Extract access, AI units, metadata
   templates, versions, two real reviewer accounts, Tasks and webhook reachability.
2. **Create the native template bundle:** reference documents, human-confirmed
   fields, role mappings and a captured template revision.
3. **Build intake and manifest capture:** one document type, source versions,
   access checks, content hashes and an explicitly initialized approved fixture.
4. **Build extraction and comparison:** typed comparisons plus cited AI analysis,
   clear unsupported/error states and one change-review screen.
5. **Wire real approval:** review packet, controlled routing, Box Tasks,
   authoritative reconciliation and conditional baseline promotion.
6. **Build the timeline:** source links, reviewer identities, decisions and an
   authorized approved-revision endpoint.
7. **Exercise failure cases, then polish:** avoid expanding scope before the
   rejection and stale-approval paths work.

## Acceptance fixtures

These are planned tests, not results already achieved.

- The stage fixture detects EU-to-US processing with correct old/new evidence.
- A separate multi-change fixture changes retention to 365 days and annual cost
  to USD 180,000 as well; all three material changes are detected and routed.
- The harmless paraphrase does not trigger business approval.
- Every displayed evidence quote belongs to the referenced snapshot.
- Missing evidence is Unverified, never an invented citation or location.
- Rejection or a missing required approval blocks baseline promotion.
- A new candidate supersedes the pending candidate without erasing its history.
- Late approval cannot promote a superseded candidate.
- Changed source/review-packet hashes block promotion.
- Concurrent baseline changes require re-comparison.
- Duplicate events do not duplicate logical reviews or decisions.
- Ambiguous task-creation timeouts are reconciled before retrying creation.
- Missing webhooks are recovered by reconciliation.
- Unauthorized users cannot read protected findings or approve for another user.
- The approved endpoint never returns an unapproved draft.
- AI, rate-limit and Box failures remain visible; they never become approval.
- A template upgrade is identified as changed review criteria, not author drift.

## Not in the MVP

- Git server integration, branching or automatic document merges.
- General enterprise search or a new vector database.
- Arbitrary generated workflow execution.
- Cross-document conflict detection beyond the stable demo path.
- Reviewer-private reasoning or guaranteed private-context non-disclosure.
- Pixel-perfect highlighting for arbitrary scanned document layouts.
- WORM/compliance certification or autonomous business approval.
