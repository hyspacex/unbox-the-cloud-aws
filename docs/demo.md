# Keel presenter runbook (UI v4)

Three minutes, one laptop, synthetic data. The design is `docs/research/50-ui-v4-box-owl.md`, section 6 for the
script and section 7 for the acceptance list. Spec v3.4 (`docs/research/30-design-v3.md`) still governs the engine.

There are three things on screen: a replica of the Box folder page, the Keel owl at the bottom right, and one
side panel that opens when you click the owl. The reviewer never leaves the Box page. Bold names below are the
exact labels on screen.

## Pre-flight checklist

1. `app/.env.local` has `MOCK_MODE=true`, or the file is absent. Use live mode only after `docs/INTEGRATION.md`
   section 7 works end to end on this laptop.
2. Start in production mode so no dev overlay can appear: `cd app && npm run build && npm run start`. Open
   `http://localhost:3000`. `npm run dev` is fine for rehearsal only.
3. Use one browser tab on the store. A second tab or a second dev server on the same `store.json` will race the
   first. Close any `/ledger` tab left over from the old runbook.
4. Reset: click the owl, open the **⋯** menu (Keel menu) in the panel header, press **Reset demo**, then confirm
   **Reset demo** under "Back to snapshot S3?". Reset appears in mock mode only.
5. Rehearse once: run the whole script below, then Reset again. The rehearsal run stays listed under **Replay a
   run** as the fallback, and the store is back at S3.
6. Window 1440 pixels wide, zoom 100 percent. At 1180 pixels and wider the open panel pushes the Box page left,
   and the owl sits at the panel's left edge with its bubble beside it.
7. Projector at 1024x768: test once at that size. Below 1180 pixels the panel overlays the page instead of
   pushing it, and the owl and its bubble hide while the panel is open. At 768 tall **Approve and send** is
   visible without scrolling. Press **✕** (Close Keel) before clicking **ⓘ** on the Box page.
8. Close the panel. The owl is idle with no badge and no dot on any file row.
9. Check the mode line at the bottom of the **⋯** menu. It reads **Mode · Mock**, **Mode · Live** or **Mode ·
   Replay**. Say which one out loud at 0:00. Never present mock output as live.

## What the owl says at each beat

The owl never composes its own text. Every line comes from the API: `bubble` on each run step, and
`decision_summary` on the package.

| Beat | Owl bubble | Badge |
| --- | --- | --- |
| Baseline, after Reset | none (the panel header reads "snapshot S3 · 8 verifications hold") | none |
| During the run, one line at a time, in this order | "New version seen: architecture.md v3.", "Pinning 5 files at their current versions…", "Reading 5 files by version…", "Decider checked the text. Clean.", "Comparing with what was verified…", "Re-checking 8 controls on Bedrock…", "Asking Box AI across 4 files…", "23 of 23 quotes matched.", "Applying the status rules…", "Writing the record…", "Writing Box metadata…", "Creating 3 Box tasks…" | hidden |
| After the run | "1 Critical needs your decision. 2 more to look at." | 3 |
| After the return on SEC-ARCH-07 and the verify on SEC-ARCH-22 | "1 High needs your decision." | 1 |
| After the acknowledgment on SEC-ARCH-05 | "All 8 recorded on S4." | none |

**Some run lines pass quickly.** Each line stays up for at least 650 ms, and the early steps arrive in a burst, so
"Pinning 5 files…", "Reading 5 files…" and "Comparing with what was verified…" go by fast. Every line is shown.
"Re-checking 8 controls on Bedrock…" and "Asking Box AI across 4 files…" stay longest, because the agent step
takes most of the run. Read those two aloud.

**Where the bubble appears while the panel is open.** At 1440 the panel pushes the page, so the owl stays visible
at the panel's left edge. "1 High needs your decision." and "All 8 recorded on S4." appear beside the owl there,
as the decisions land. At 1024 the panel overlays the page and the owl hides. Those two lines then do not show
until you close the panel, and the summary fades four seconds after it appears.

The baseline summary in the API is "8 verifications hold." The summary bubble fades after four seconds and the
badge stays. The agent's substeps add short lines such as "Reading requirements and evidence…" and "Fetching what
was verified for SEC-ARCH-07…". Each line stays up long enough to read. A step the engine sends without a bubble
shows nothing new.

Dots on the Box page after the run: amber on architecture.md (two controls) and amber on runbook.md (one control).
After all three decisions both dots turn blue.

## The three-minute script

Both human fields start empty by design: the Return reason and the Verify attestation. The two chips fill them
on click, so the room watches the checks tick. The machine does not attest for the reviewer.

| Time | Narration | On screen | Click |
| --- | --- | --- | --- |
| 0:00 | "This is Box. The review board approved this folder on October 7, and the verifications were recorded the next day. Eight controls, five documents, each verified by a named reviewer against these exact versions. Keel is the owl." | Box folder, five files with a Version column, owl idle | Nothing. |
| 0:20 | "The project uploads a rewritten architecture document." | Upload menu, chooser with "architecture.md (v3 draft)", row reads "Uploading new version…", then "Upload complete", then v3 | **Upload ▾** → **Upload new version** → select **architecture.md (v3 draft)** → **Upload**. |
| 0:35 | "Keel pins all five files, Decider clears the text, the agent re-checks all eight controls on Bedrock and asks Box AI whether the other four files say anything about customer-managed keys." | Owl working, pupils sweep, bubble replaces itself step by step | Nothing. Read the bubble aloud if the room is quiet. |
| 0:50 | "Three need me. Five hold, so nobody clicks anything for those." | Bubble "1 Critical needs your decision. 2 more to look at.", badge 3, amber dots | Click the owl. Level 1 opens: NEEDS YOUR DECISION, ACKNOWLEDGE, "5 verifications hold". |
| 1:00 | "The reviewed text named customer-managed keys. The rewrite says all data is protected with industry-standard encryption. Encryption is still stated; the key-management commitment is gone. Box AI searched the other four files: nothing." | Level 2: WAS and NOW quotes, the verdict line "4 of 5 clauses unsupported in every file of this snapshot. Box AI found 0 citations across the other 4 files.", Verify off with its reason | Row **SEC-ARCH-07**. |
| 1:15 | Reviewer, first person: "The machine told me where to look. It did not tell me what to decide. I'm returning this with the sentence that disappeared and the requirement it has to meet. Verify is off for me too, because nothing in this package supports the key model." | Empty reason field, suggested reason inserted, "Box AI drafted this task for J. Park" tagged "Drafted by Box AI", then the receipt "Returned to author by Dana Okafor" | **Return to author** → **Use suggested reason (drafted by Keel)** → **Return and draft author task** → read the draft → **Approve and send**. |
| 1:45 | "Recovery targets moved to the runbook. Same sentence, different file. That is a changed binding, not lost support. Thirty seconds, Low." | Level 2 for SEC-ARCH-22, NOW reads "Current binding · runbook.md v2 §3", the checklist ticks as the phrase is inserted, then the green receipt "Verified by Dana Okafor" | **‹** (Back) → row **SEC-ARCH-22** → **Verify** → **Insert attestation phrase** → **Confirm verify**. |
| 2:00 | "One more is a glance. The sentence is unchanged, but the section around it was rewritten, and this control is High tier." | Level 2 for SEC-ARCH-05, verdict line "The section around the verified sentence was rewritten. The sentence is unchanged.", optional note, then "Acknowledged by Dana Okafor"; at 1440 the bubble "All 8 recorded on S4." appears beside the owl at the panel's left edge | **‹** (Back) → row **SEC-ARCH-05** → **Acknowledge** → **Confirm acknowledgment**. Leave the note empty. |
| 2:10 | "Every decision is recorded against the exact versions, under my name, with a hash chain. Box holds the files, the metadata and the tasks." | Receipt expanded into events with short chain hashes and "Chain verified N/N"; Box details pane with Folder details and the Keel review metadata fields, where SEC-ARCH-05 reads VERIFIED_HOLDS | **Show the record**. Then **ⓘ** (Details) on the Box page. At 1024, press **✕** first. Keep this beat after the acknowledgment. |
| 2:30 | "Box holds files, metadata, tasks, and Box AI is how the agent reads. Bedrock judges. Decider gates locally. Code validates quotes and keeps the record. The machine has its field; the reviewer has hers." | Six stacked boxes with the wall "The machine cannot write past this line." before the person | **⋯** → **How it works**. |
| 2:45 | "Next: a shadow evaluation over fifty historical packages, measuring misses, false alerts and review time." | Same | Nothing. |
| 2:50 | "Know what changed, and who reviewed that exact evidence." | Box page, blue dots. At 1024 this is where "All 8 recorded on S4." shows, for four seconds after the panel closes | **✕** (Close Keel). |

**Expected text after all three decisions.**

| Where | Text |
| --- | --- |
| Level 1, RECORDED, in this order | SEC-ARCH-07 "Returned to author by Dana Okafor", SEC-ARCH-22 "Verified by Dana Okafor", SEC-ARCH-05 "Verified, holds · Acknowledged by Dana Okafor" |
| Level 1, below | "5 verifications hold" with "SEC-ARCH-01 · 02 · 04 · 17 · 20" |
| Count line, in the API and the record only | "8 controls on snapshot S4: 6 Verified holds, 1 Verified, 1 Returned to author" |
| Details pane, SEC-ARCH-05 | VERIFIED_HOLDS |
| Owl | "All 8 recorded on S4.", no badge, both dots blue |

The count line is no longer on screen. An acknowledged control counts as a verification that holds, so the count
line reads six while level 1 lists SEC-ARCH-05 under RECORDED.

**If time is short.** Skip the SEC-ARCH-05 beat. The badge then reads 1, the bubble reads "1 High needs your
decision.", and the architecture.md dot stays amber. That is correct behaviour, not a fault, and you can say so.

**The return is two steps on purpose.** **Return and draft author task** records the reviewer's reason as the
Box task response and asks Box AI for a draft. The row still reads Needs review at that point. Returned to author
is recorded only after **Approve and send**, when the author task exists. If you close the panel between the two
steps, level 1 shows "Draft awaiting your approval" under the row, and the button on level 2 reads **Review Box AI
draft**. **Edit** on the draft is optional; **Done editing** closes the edit.

**Mock and live.** In mock mode the panel buttons stand in for the Box task responses. In live mode the chooser
asks which file to replace and takes a real file from this computer, and Upload performs the real Box upload
before the run. The reviewer can also resolve a task in Box; Keel picks the response up by polling every five
seconds and the owl shows the new summary.

## Fallbacks

**The run misbehaves, or live mode is over its rehearsed window.** Open **⋯** → **Replay a run**. The list is newest first, and the newest
rehearsal is tagged "Latest rehearsal". Press **Replay** on that row. The panel shows "Replaying run-…" and level 1 shows a banner reading "Replay of
run-…. Nothing is re-evaluated." The rows read Re-check pending and are not clickable until the recorded outcome
lands. It ends on the state right after the run: badge 3, the bubble "1 Critical needs your decision. 2 more to
look at.", and three open decisions. The mode line reads **Mode · Replay**. Press **End replay** to return to the
live store. A replay records nothing, so narrate the decisions from that point rather than clicking them. If the
live adapters fail outright, set `MOCK_MODE=true`, restart, and Reset.

**Author task unavailable at 1:15.** If the author task cannot be created when you press **Approve and send**,
the engine records Confirm finding automatically. An acknowledgment event is written, no disposition is written,
and the row keeps its Needs review label. The panel shows that label with the new event id instead of a receipt.
Say: "The reviewer confirms the key-management gap with her reason. We record it against these versions. The gap
stays open; routing to the author is proposed."

**Upload error.** A red Box-style toast appears at the top. "A re-check is already running on this folder." means
wait. "This version is already uploaded. Reset the demo from the Keel menu to upload it again." means you skipped
Reset.

**API unreachable.** The owl closes its eyes, turns grey and says "I can't reach Keel." Restart the server; the
owl recovers on the next poll.

## Other scenarios (not in the script)

**⋯** → **Other scenarios** lists Fabricated quote, Injected instructions, Unreadable file, Conflicting evidence and
Missing finding. Each asks "Reset and upload … ?" and runs with **Reset and run**, which resets the store first.
Injected instructions puts the owl in quarantine with the line "I did not read runbook.md v3. It carried
instructions." Reset afterwards before going back to the main script.

## Questions judges may ask

**Why does nothing turn green after the agent runs?**
Green means a named person verified this control on the current snapshot and binding, and only display rule 9
produces it. In this script only the SEC-ARCH-22 receipt and its row are green. The agent only proposes a machine
assessment.

**Why are there two dots after the run, not one?**
SEC-ARCH-22's supporting sentence moved from architecture.md to runbook.md. The dot is per file and counts the
open decisions whose evidence lives in that file, so architecture.md carries two and runbook.md carries one. The
hover text says how many.

**Why can't the machine write a disposition?**
The model's output schema has no disposition field, and the agent has no write tool. The ledger rejects a machine
event that carries a human disposition. Only the human response handler writes one, after identity, author and
binding checks.

**What if the model hallucinates a quote?**
Every quote must string-match the pinned version text after disclosed normalization. A required quote that fails
validation makes the control `not_evaluated`. **⋯** → **Other scenarios** → Fabricated quote shows it.

**What if Box AI is unavailable?**
The search tool falls back to normalized string search over the pinned texts. The bubble says "Box AI unavailable.
Searching 4 files as text…". An uncited or unvalidated Box AI answer counts as no evidence.

**What is Decider?**
Strands Decider 2B is a 1.9-billion-parameter open decision model that returns a choice with probabilities and
never generates text. It runs locally and gates each changed file for injection and materiality before any text
reaches Bedrock. When it is not running the step is omitted rather than shown as clean.

**Where is the agent's trace?**
**⋯** → **How it was checked** shows the run's steps with timings. **⋯** → **Full record** shows the ledger with
filters, export and the chain line. **⋯** → **Status rules** shows the sixteen display rules.

**Where is this in Box?**
**ⓘ** on the Box page opens the details pane with the folder's `keelReview` metadata: the snapshot id, one status
field per control, the last human review and the record URL.

**How does this scale?**
The proposed path is a Box webhook to a Lambda URL, EventBridge, SQS FIFO per folder, and the same agent on
AgentCore Runtime, with a DynamoDB ledger streamed to S3 Object Lock. None of that is built. **How it works** tags
those boxes PROPOSED.

**What is actually built?**
The full review transaction runs end to end on one laptop: snapshot, gate, one Bedrock evaluation, validation,
staleness, hash-chained ledger, folder metadata, review and author tasks. Exceptions, not-applicable, compensating
controls, Jira, IRM and cloud hosting are proposed and have no transition behind them.

**Where does the data go?**
In live mode, document text goes from Box to the laptop and to Bedrock under a `us.` inference profile in
us-east-1, and it is stored in the local ledger. The inference profile is a routing choice, not a residency
guarantee, and a bank pilot needs a data-classification decision first.

**Why does Dana Okafor review the encryption control when Priya Natarajan verified it?**
The demo tenant has one configured reviewer identity, so every review task in the demo is assigned to her. Level 2
still shows the original verifier and version under the title. Routing by reviewer role from the directory is a
bank-owned pilot gate.

**Why does the baseline say S3 rather than S2?**
On October 12 the runbook changed its escalation contact, Keel re-evaluated, nothing changed, and every
verification was recorded as holding. That is the most common outcome in the system, and showing it first is the
point: a no-change evaluation is still recorded. The verifications themselves were made on S2, and level 2 names
the reviewer and version.
