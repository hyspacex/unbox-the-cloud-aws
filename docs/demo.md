# Keel presenter runbook (UI v4.2)

Two minutes, one laptop, synthetic data. The primary script follows the team's running order in
`presentation/README.md` (draft 02): a fixed checklist, its current status, one update, one finding, one response.
The longer three-minute path is kept under "Extended path" for a longer slot and for judges' questions.

Design sources: `docs/research/50-ui-v4-box-owl.md` (the Box page, owl and panel) and
`docs/research/51-ui-v4-1-team-review.md` (tiles, timelines, rule-source chips, AGREED and CHANGED, the file
preview). Spec v3.4 (`docs/research/30-design-v3.md`) still governs the engine.

On screen are a replica of the Box folder page, the Keel owl at the bottom right, and one side panel. Bold names
below are the exact labels on screen. Quoted owl lines and panel text come from the API, never from the UI.

## Say this honestly

- **Mock mode.** The Box page is our Box replica, not an installed Box extension. Say "our Box replica" at 0:15.
  Say once, early: "This demo uses simulated integrations with the same review engine." When describing Bedrock,
  Box AI and Box tasks at 0:30, open with "In the live design".
- **Live mode.** Use the present tense only after the real Box upload, Bedrock call and task creation have worked
  on this laptop today.
- **Data.** Meridian Trust Bank, Project Lantern and every person in it are synthetic.
- **Rule sources.** The standards, the "Bank standard" origin labels and the framework maps are illustrative. The
  panel marks the maps "illustrative". Do not claim any certification.
- **What a return means.** Returning to the author records the reviewer's decision. It does not close the gap.
  Say "sent" only after the receipt appears.
- **Recordings.** If you fall back to a recording or a replay, say so.

## Pre-flight checklist

1. `app/.env.local` has `MOCK_MODE=true`, or the file is absent. Use live mode only after `docs/INTEGRATION.md`
   section 7 works end to end on this laptop.
2. Start in production mode so no dev overlay can appear: `cd app && npm run build && npm run start`. Open
   `http://localhost:3000`. `npm run dev` is fine for rehearsal only.
3. Use one browser tab on the store. A second tab or a second server on the same `store.json` will race the first.
4. Reset: click the owl, open the **⋯** menu (Keel menu) in the panel header, press **Reset demo**, then confirm
   **Reset demo** under "Back to snapshot S3?". Reset appears in mock mode only.
5. Rehearse once: run the two-minute script, including the wait for the run, then Reset again. The rehearsal run
   stays under **Replay a run**, tagged "Latest rehearsal", as the fallback.
6. Window 1440 pixels wide, zoom 100 percent. At 1180 pixels and wider the open panel pushes the Box page left.
   The Upload menu stays visible, and the owl sits at the panel's left edge with its bubble beside it.
7. Projector at 1024x768: test once at that size. Below 1180 pixels the panel overlays the page, and the owl and
   its bubble hide while it is open. Press **✕** (Close Keel) before **Upload ▾**, then click the owl again after the
   run. At 768 tall **Approve and send** is visible without scrolling.
8. Open the starting frame. With the panel closed, the folder page shows the project welcome screen: "Checked
   against" framework badges, the timeline scrubber and the board at Need you 0, Recorded 0, Still verified 8. The script
   below starts from the panel instead: click the owl so the panel is open at level 1 on the baseline. Clicking a
   board row also opens the panel, and the panel's expand button returns to the welcome screen. The tiles read Still verified 8,
   Need you 0, Recorded 0. There is no badge and no dot on any file row.
9. Check the mode line at the bottom of the **⋯** menu, then close the menu. It reads **Mode · Mock**, **Mode ·
   Live** or **Mode · Replay**. Never present mock output as live.

## The two-minute script

| Time | Narration | On screen | Click |
| --- | --- | --- | --- |
| 0:00 | "Your project has a compliance checklist. Its documents keep changing. How do you know where the review stands today? Keel shows the current status of each checklist item, with the evidence behind it." | Box page with the panel open at level 1. Tiles **8** Still verified, **0** Need you, **0** Recorded. "snapshot S3 · 8 verifications hold". Package timeline S1 "baseline", S2 "8 verified", S3 "runbook v2 · holds". The eight holding items listed below | Nothing. |
| 0:15 | "Here is our example package, in our Box replica. Eight previous verifications hold. Open an item to see its rule, its supporting text, and who verified it." | Level 2 for Encryption at rest and key management: the chip "IS-STD-014 §5.1 · Bank standard", "Set up by Security Architecture (ARB)", the AGREED sentence on customer-managed keys, the byline "Verified by Priya Natarajan · v2 §4.3 · Oct 8", and "The verified sentence is unchanged." | Row **SEC-ARCH-07** in the hold list. Point at the chip and the byline. Then **‹** (Back). |
| 0:30 | "Now we upload a new version." Mock, while the owl works: "This demo uses simulated integrations with the same review engine. In the live design, Bedrock reassesses the controls and uses Box AI to search for evidence across the package. Code checks the quotes against exact document versions. Box stores the documents and review tasks." | Row reads "Uploading new version…", then "Upload complete" and v3. The panel rows read "Re-check pending". The owl's pupils sweep and its bubble steps through the run | **Upload ▾** → **Upload new version** → select **architecture.md (v3 draft)** → **Upload**. At 1024, press **✕** first. |
| 0:55 | "The overview updates: five verifications hold, three items need a person. For encryption, the new document no longer supports the required key-management details. Here is the previous commitment, and here is the replacement." | Bubble "1 Critical needs your decision. 2 more to look at.", badge 3. Tiles **5** Still verified, **3** Need you, **0** Recorded. The S4 point reads "architecture v3 · 3 need you". On level 2: the rule chip, then AGREED, then "Changed in architecture.md v3 §4.3" with the new words underlined, then "4 of 5 clauses unsupported in every file of this snapshot. Box AI found 0 citations across the other 4 files." | Point at the tiles. Then the Encryption row under NEED YOU. At 1024, click the owl first. |
| 1:15 | "The timeline shows the earlier verification, when it continued to hold, and the file version that triggered this review." | The control timeline: S2 "verified by Priya", S3 "holds", S4 "architecture v3 · needs review", with the current point filled | Point along the strip. Hover the S4 dot for "architecture.md v3 changed." if the room is close. |
| 1:30 | "The reviewer returns this item to the author, checks the drafted task, and approves sending. Keel records the response against this version. The evidence gap remains open." | Empty reason field, then the suggested reason. "Box AI drafted this task for J. Park", tagged "Drafted by Box AI". Then the receipt: "Returned to author by Dana Okafor" / "Box task … for J. Park (Eng) · due Oct 23" / "on architecture.md v3 · snapshot S4" | **Return to author** → **Use suggested reason (drafted by Keel)** → **Return and draft author task** → read the draft → **Approve and send**. |
| 1:50 | "Keel gives teams a current view of their compliance review, with evidence explaining every status." | Level 1: tiles **5** Still verified, **2** Need you, **1** Recorded. Encryption under RECORDED with "Returned to author by Dana Okafor". The recovery item under NEED YOU, least privilege under ACKNOWLEDGE. At 1440 the owl beside the panel says "1 High needs your decision. 1 more to look at.", badge 2 | **‹** (Back). Stop here. |

The reason field starts empty by design, and so does the attestation field in the extended path. The chip fills
it on click, so the room sees the reviewer choose the words. The machine does not decide for the reviewer.

**The return is two steps on purpose.** **Return and draft author task** records the reviewer's reason as the Box
task response and asks Box AI for a draft. The row still reads Needs review at that point. Returned to author is
recorded only after **Approve and send**, when the author task exists. If you close the panel between the two
steps, level 1 shows "Draft awaiting your approval" under the row. The level 2 button then reads **Review Box AI
draft**. **Edit** on the draft is optional, and **Done editing** closes the edit.

**Counts come from the run.** 8, 5, 3 and 2 are the expected fixture values. If the screen shows different
numbers, say what the screen shows.

## What the owl says

The owl never composes its own text. Every line comes from the API: `bubble` on each run step, and
`decision_summary` on the package.

| Beat | Owl bubble | Badge |
| --- | --- | --- |
| Baseline, after Reset | none. The panel line reads "snapshot S3 · 8 verifications hold" | none |
| During the run, one line at a time, in this order | "New version seen: architecture.md v3.", "Pinning 5 files at their current versions…", "Reading 5 files by version…", "Decider checked the text. Clean.", "Comparing with what was verified…", "Re-checking 8 controls on Bedrock…", "Asking Box AI across 4 files…", "23 of 23 quotes matched.", "Applying the status rules…", "Writing the record…", "Writing Box metadata…", "Creating 3 Box tasks…" | hidden |
| After the run | "1 Critical needs your decision. 2 more to look at." | 3 |
| After the return on encryption, the end of the two-minute path | "1 High needs your decision. 1 more to look at." | 2 |
| Extended: after the verify on recovery | "1 High needs your decision." | 1 |
| Extended: after the acknowledgment on least privilege | "All 8 recorded on S4." | none |

**Some run lines pass quickly.** Each line stays up for at least 650 ms. When lines back up, they move on after
400 ms. The early steps arrive in a burst, so "Pinning 5 files…", "Reading 5 files…" and "Comparing with what was
verified…" go by fast. "Re-checking 8 controls on Bedrock…" and "Asking Box AI across 4 files…" stay longest,
because the agent step takes most of the run. The agent's substeps add lines such as "Reading requirements and
evidence…" and "Fetching what was verified for SEC-ARCH-07…".

**Where the bubble appears while the panel is open.** At 1440 the panel pushes the page and the owl stays visible
at the panel's left edge. Summary lines appear beside it as decisions land, and they fade after four seconds while
the badge stays. At 1024 the panel overlays the page and the owl hides. Summary lines then show only after you
close the panel.

**Dots on the Box page.** After the run, architecture.md carries an amber dot for two controls and runbook.md
carries one for one control. A dot turns blue once every decision on that file is recorded.

## Extended path (about one more minute)

Use this when the slot is three minutes, or to answer a judge. It continues from the 1:50 frame.

| Step | Narration | On screen | Click |
| --- | --- | --- | --- |
| E1 | "Open in document takes me to the sentence in Box." | Box file preview of architecture.md v3 with the sentence highlighted and the margin pill "Keel · changed the status of SEC-ARCH-07". The panel stays open | Encryption row under RECORDED → **Open in document ↗** under the CHANGED block. |
| E2 | "And here is what the reviewer approved before." | The version menu lists V1, V2 and V3 with V3 marked Current. On V2 the banner "Keel · this sentence is not in v2" appears, because the v3 sentence is new. Back in the panel, **Open v2 in document ↗** under AGREED highlights the agreed sentence in v2 | The **V3 ▾** version menu → **V2**. Then **Open v2 in document ↗** in the panel. |
| E3 | "Recovery targets moved to the runbook. Same sentence, different file. That is a changed binding, not lost support." | Level 2 for the recovery item: "Now in runbook.md v2 §3". The checklist ticks as the phrase is inserted. Then the green receipt "Verified by Dana Okafor" | Back to the folder via the preview's back arrow. In the panel: **‹** → the recovery row → **Verify** → **Insert attestation phrase** → **Confirm verify**. |
| E4 | "One more is a glance. The sentence is unchanged, but the section around it was rewritten, and this control is High tier." | "Section changed around it · v3 §4.2" and "The section around the verified sentence was rewritten. The sentence is unchanged." Then "Acknowledged by Dana Okafor". At 1440 the bubble "All 8 recorded on S4." appears | **‹** → the least privilege row → **Acknowledge** → **Confirm acknowledgment**. Leave the note empty. |
| E5 | "Every decision is recorded against the exact versions, under my name, with a hash chain. Box holds the files, the metadata and the tasks." | Receipt events with short chain hashes and "Chain verified N/N". The Box details pane with Folder details and the Keel review metadata, where SEC-ARCH-05 reads VERIFIED_HOLDS | **Show the record**. Then **ⓘ** (Details) on the Box page. At 1024, press **✕** first. Keep this after E4. |
| E6 | "Box holds files, metadata and tasks, and Box AI is how the agent reads. Bedrock judges. Decider gates locally. Code validates quotes and keeps the record. The machine has its field; the reviewer has hers." | Six stacked boxes, the wall "The machine cannot write past this line." before the person, BUILT and PROPOSED tags | **⋯** → **How it works**. |

**Expected text after the extended path.**

| Where | Text |
| --- | --- |
| Tiles | **5** Still verified, **0** Need you, **3** Recorded |
| Level 1, RECORDED, in this order | Encryption "Returned to author by Dana Okafor", recovery "Verified by Dana Okafor", least privilege "Verified, holds · Acknowledged by Dana Okafor" |
| Package timeline, S4 | "architecture v3 · recorded" |
| Count line, in the API and the record only | "8 controls on snapshot S4: 6 Verified holds, 1 Verified, 1 Returned to author" |
| Details pane, SEC-ARCH-05 | VERIFIED_HOLDS |
| Owl | "All 8 recorded on S4.", no badge, both dots blue |

The count line is not on screen. An acknowledged control counts as a verification that holds, so the count line
reads six while the tiles keep least privilege under Recorded.

## Fallbacks

**The run misbehaves, or live mode is over its rehearsed window.** Open **⋯** → **Replay a run**. The list is newest first, and the newest
rehearsal is tagged "Latest rehearsal". Press **Replay** on that row. The panel shows "Replaying run-…" and level 1 shows a banner reading "Replay of
run-…. Nothing is re-evaluated." The rows read Re-check pending and are not clickable until the recorded outcome
lands. It ends on the state right after the run: badge 3, the bubble "1 Critical needs your decision. 2 more to
look at.", and three open decisions. The mode line reads **Mode · Replay**. Press **End replay** to return to the
live store. A replay records nothing, so narrate the decisions from that point rather than clicking them. If the
live adapters fail outright, set `MOCK_MODE=true`, restart, and Reset.

**Author task unavailable at 1:30.** If the author task cannot be created when you press **Approve and send**,
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

**Where do the rule chips come from, and who set them up?**
Each control in the profile names its standard and clause, such as "IS-STD-014 §5.1", and an origin: Bank standard,
International standard, or Learned from reviews. Hovering the chip shows who set it up, the profile version and
the framework map. The data is synthetic and the maps are marked illustrative, not reviewed by a compliance owner.

**What is a point on the timeline?**
One point per snapshot of the package, labelled with the file that changed and the status after it. A human action
inside the same snapshot updates that point's status. It does not add a point. Every action is in the record.

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
still shows the original verifier and version in the AGREED byline. Routing by reviewer role from the directory is a
bank-owned pilot gate.

**Why does the baseline say S3 rather than S2?**
On October 12 the runbook changed its escalation contact, Keel re-evaluated, nothing changed, and every
verification was recorded as holding. That is the most common outcome in the system, and showing it first is the
point: a no-change evaluation is still recorded. The verifications themselves were made on S2, and level 2 names
the reviewer and version.
