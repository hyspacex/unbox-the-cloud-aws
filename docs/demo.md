# Enterprise Demo and Build Plan

## Scenario: a bank's customer-support AI rollout

Use synthetic documents and identities. A bank approved a constrained pilot.
A revised rollout proposal quietly changes commitments that Privacy, Security
and Finance previously reviewed.

| Dimension | Approved V1 | Candidate V2 |
| --- | --- | --- |
| Processing region | EU | US |
| Log retention | 30 days | 365 days |
| Annual budget | USD 60,000 | USD 180,000 |

Also introduce a harmless wording change. The system should distinguish it
from material agreement drift.

Select an Enterprise AI Initiative Project Template containing Business Case,
Architecture, Data & Privacy and Finance metadata templates. For a compact demo,
the relevant values can be in one proposal document; expand to multiple roles
only after the end-to-end path works.

## Three-minute narrative

| Time | Action | Proof |
| --- | --- | --- |
| 0:00-0:25 | Show V1 and its named reviewers | The accepted baseline is explicit |
| 0:25-1:10 | Upload V2 and inspect change cards | Three material differences have old/new evidence |
| 1:10-1:50 | Confirm the review plan; a real reviewer rejects region transfer | Box Tasks carry human decisions; V1 stays accepted |
| 1:50-2:30 | Upload V3 restoring EU and 30-day retention; Finance approves the remaining budget change | Approval binds to the exact candidate and packet |
| 2:30-3:00 | Show the timeline and approved revision endpoint | V3 is accepted; a later unapproved draft cannot replace it |

If the approval policy requires additional owners, show their actual approvals;
do not imply a single Finance decision satisfies unrelated required reviews.
Box template setup can be demonstrated briefly or prepared before the timed
walkthrough. AI-assisted setup is not the same as team approval.

All example times and business facts are synthetic. Live inference and live
human review must be accurately described. Any replay or fixture must be
explicitly labeled; no hidden prerecorded "live" responses.

Closing line: **Files have versions. Team agreement should have versions too.**

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

- All three seeded material changes produce the correct old/new values.
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
