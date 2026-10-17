# Keel UI v4: the Box page, the owl, and one panel

Status: confirmed with Harry on Oct 17 2026 through a wireframe interview (three rounds, twelve
decisions). This revises only the experience layer. Spec v3.4 (`30-design-v3.md`) still governs the
engine: the thirteen-step transaction, the sixteen display rules, staleness and materiality, the ledger,
the task mapping, and the wording rules. Nothing below changes a stored field or a status decision.

## 0. The one-sentence brief

The reviewer never leaves Box. A small owl at the bottom right does the agent's work, says one line when
it needs a human, and opens a single side panel where the reviewer reads two quotes and presses one button.

## 1. Decisions taken (the interview)

| # | Question | Decision |
| --- | --- | --- |
| 1 | Home surface | A pixel-faithful replica of the Box folder list: left nav, search, file table with a Version column, Upload menu. |
| 2 | Avatar behaviour | Thinks during the run, then badge count plus one speech line that fades after 4 s. |
| 3 | Panel structure | Two levels: a short list of rows that need the reviewer, then one control with the was/now quote pair and buttons. |
| 4 | Where the proof lives | A three-line receipt under each recorded decision, with "Show the record" expanding the chain. No ledger page in the demo path. |
| 5 | Actions | Inline expand inside the panel, no modals. Return keeps the Box AI draft as a second inline card. |
| 6 | Avatar look | Illustrated character. |
| 7 | Old screens | Hidden behind a menu in the panel header: How it works, Status rules, Full record, Replay, Reset. |
| 8 | Keel on the Box page | One dot on the changed file's row. Amber while a decision is open, blue when every decision on that file is recorded. |
| 9 | Character | Lighthouse-keeper owl: navy body, cream face, Box-blue cap. Blinks idle, pupils sweep while working, cap tips on attention. |
| 10 | Agent trace | Live steps in the speech bubble while working. After the run the bubble shows the summary line. No step list in the panel. |
| 11 | Upload beat | Box's own Upload menu, mocked: Upload new version opens a small chooser with architecture.md v3 ready, Box-style progress, row flips to v3. Live mode performs the real upload. |
| 12 | Trace in panel | None (follows 10). "How it was checked" is reachable from the menu for judges who ask. |

Decisions I made without asking, flagged here so they can be reversed:

- Panel width 420 px, slides in from the right in 320 ms. Build change (Oct 17, after the first integrated pass): at 1180 px and wider the panel pushes the Box page aside, as Box's own details sidebar does, so Name, Updated, Version and Size stay visible; below 1180 px it overlays and the owl hides while open. The page never dims.
- The owl speaks in the first person, short, never evaluative: it reports what it did and what needs a person. It never says a control is fine.
- The Box details pane (the "i" icon) is kept as a native affordance and shows the `keelReview` metadata fields. It is closed by default and is not in the script. It exists so a Box judge can ask "where is this in Box" and get an answer in one click.
- The badge count is the number of open human decisions (Needs review plus Acknowledge). After the run it reads 3.
- Scenarios other than `architecture_v3` (injection, unreadable, fabricated quote) stay reachable under the menu as "Other scenarios". They are not in the script.

## 2. Surfaces

There are exactly three things on screen: the Box page, the owl, the panel.

### 2.1 The Box page (replica)

```
┌──────────────────────────────────────────────────────────────────────────┐
│ box   [ Search files and folders                       ]      ⊕  🔔  (D) │
├──────────┬───────────────────────────────────────────────────────────────┤
│ All Files│ All Files › Project Lantern › Security Review Package         │
│ Recents  │                                     [ New ▾ ]  [ Upload ▾ ] ⓘ │
│ Synced   │ Name                                 Updated   Version   Size │
│ Notes    │ ▣ architecture.md                    Oct 12    v2       38 KB │
│ Trash    │ ▣ runbook.md                         Oct 12    v2       22 KB │
│          │ ▣ data-flow-and-classification.md    Oct 7     v1       19 KB │
│          │ ▣ vendor-contract-summary.md         Oct 7     v1       11 KB │
│          │ ▣ approved-services-and-exceptions.md Oct 7    v1       14 KB │
│          │                                                               │
│          │                                                               │
│          │                                                    ╭───────╮  │
│          │                                                    │  owl  │  │
│          │                                                    ╰───────╯  │
└──────────┴───────────────────────────────────────────────────────────────┘
```

- Fidelity: Box's layout, spacing, type scale, blue, row height and icons, reproduced from the public Box web app. The wordmark reads "box". No Keel branding on the page except the owl and the dot.
- The file table is driven by `GET /api/package`: file names, current version labels and upload dates come from the current snapshot. Nothing is typed into the table.
- The Version column is the only non-default Box column, and Box offers it, so it is in-character.
- The row dot (decision 8) appears to the right of the file name. Hover text: "Keel: 1 control needs your decision". The dot is derived from the rows whose evidencing file is this file and whose displayed status needs a human.
- The details pane (ⓘ) opens Box's right-hand pane with Folder details and the `keelReview` metadata template fields as Box renders metadata. Closed by default.

### 2.2 The upload beat (decision 11)

```
   [ Upload ▾ ]                      row during upload
   ┌───────────────────┐
   │ Upload files      │             ▣ architecture.md   ▰▰▰▰▰▱▱▱  Uploading v3…
   │ Upload folder     │
   │ ───────────────── │             row after upload
   │ Upload new version│
   └───────────────────┘             ▣ architecture.md •  Oct 17    v3     39 KB
          ↓
   ┌──────────────────────────────┐
   │ Choose a file                │
   │ ○ architecture.md (v3 draft) │
   │   Section 4 rewrite          │
   │               [ Upload ]     │
   └──────────────────────────────┘
```

- Mock: the chooser lists the fixture's v3 file. Upload posts `POST /api/submit {scenario: "architecture_v3"}` and plays a 1.2 s Box-style progress bar on the row, then the row reads v3 and the owl starts working.
- Live: the chooser accepts the real file. Upload calls a new additive route `POST /api/upload-version` that performs the Box upload (today's `scripts/upload-v3.ts` logic) and then starts the run. Same progress bar, real duration.
- The dot appears only after the run, not after the upload.

### 2.3 The owl

Flat vector SVG, 56 px, two tones plus Box blue. Drawn as parts so eyes, lids, pupils and cap animate independently with `motion`. Respects `prefers-reduced-motion` (no sweeps, state changes still shown).

| State | Trigger | Look | Bubble |
| --- | --- | --- | --- |
| idle | no run, no open decision | slow blink every 4 s | none |
| working | run started | pupils sweep left-right, 1.6 s period | current step, replaces in place |
| attention | run done with open decisions, or new task response ingested | eyes widen once, cap tips once, amber badge with count | summary line, fades after 4 s, badge stays |
| clear | every decision on the snapshot recorded | small nod, badge gone | "All 8 recorded on S4." fades after 4 s |
| quarantine | gate quarantined a file | amber badge, eyes narrow | "I did not read runbook.md v3. It carried instructions." |
| offline | API unreachable | eyes closed, grey | "I can't reach Keel." |

Bubble copy while working is derived from `TraceStep.kind`, never typed per run:

| kind | bubble |
| --- | --- |
| snapshot_captured | Pinning 5 files at their current versions… |
| texts_fetched | Reading 5 files by version… |
| input_gate | Decider checked the text. Clean. |
| prior_quotes_diffed | Comparing with what was verified… |
| agent_evaluation | Re-checking 8 controls on Bedrock… |
| box_ai_ask (tool step) | Asking Box AI across 4 files… |
| quotes_validated | 23 of 23 quotes matched. |
| findings_applied | Applying the status rules… |
| ledger_events_written | Writing the record… |
| box_folder_metadata_written | Writing Box metadata… |
| box_task_created | Creating 3 Box tasks… |
| done | 1 Critical needs your decision. 2 more to look at. |

Numbers in the bubble come from the step's detail fields. The bubble is at most twelve words. Clicking the owl or the bubble opens the panel.

### 2.4 The panel

420 px, full height, right edge. Header: owl mark, "Keel", a ⋯ menu, close. Two levels, with a back arrow at level 2. The panel remembers its level while open and resets to level 1 on close.

#### Level 1

```
┌─ 🦉 Keel ───────────────────────── ⋯  ✕ ┐
│ architecture.md v3 · snapshot S4           │
│ Re-checked 8 controls · 8.4 s              │
│                                            │
│ NEEDS YOUR DECISION                        │
│ ┌────────────────────────────────────────┐ │
│ │ ● SEC-ARCH-07  Encryption at rest and ›│ │
│ │   key management                       │ │
│ │   Critical · key-management evidence   │ │
│ │   missing                              │ │
│ ├────────────────────────────────────────┤ │
│ │ ● SEC-ARCH-22  Recovery targets and   ›│ │
│ │   rollback path                        │ │
│ │   Low · same sentence, now in runbook  │ │
│ └────────────────────────────────────────┘ │
│                                            │
│ ACKNOWLEDGE                                │
│ ┌────────────────────────────────────────┐ │
│ │ ○ SEC-ARCH-05  Least privilege, PAM   ›│ │
│ │   High · section changed, quote        │ │
│ │   unchanged                            │ │
│ └────────────────────────────────────────┘ │
│                                            │
│ 5 verifications hold                    ▾  │
│ SEC-ARCH-01 · 02 · 04 · 17 · 20            │
└────────────────────────────────────────────┘
```

- Sections are driven by the displayed status from the engine: Needs review rows under NEEDS YOUR DECISION, Acknowledge rows under ACKNOWLEDGE, holds collapsed. Empty sections are not rendered.
- Each row: control id, title, one secondary line of at most ten words taken from `DisplayedStatus.detail`. Severity or tier is a labelled chip, same grammar everywhere.
- After a decision is recorded the row moves to a RECORDED section with a check and its receipt's first line. Order is stable: 07, 22, 05.
- Baseline (before any run): header reads "snapshot S3 · 8 verifications hold", no sections, the hold list expanded. The panel is useful but quiet.

#### Level 2, the hero (SEC-ARCH-07)

```
┌─ ‹ SEC-ARCH-07 ────────────────── ⋯  ✕ ┐
│ Encryption at rest and key management      │
│ Severity Critical · Verified by Priya      │
│ Natarajan on architecture.md v2 · Oct 7    │
│                                            │
│ WAS · v2 §4.3                              │
│ │ …AES-256 per-store keys under AWS KMS    │
│ │ customer-managed keys, rotated annually; │
│ │ key custodians are the Card Servicing    │
│ │ Platform leads.                          │
│                                            │
│ NOW · v3 §4.3                              │
│ │ All customer data is protected with      │
│ │ industry-standard encryption and managed │
│ │ in line with corporate policy.           │
│                                            │
│ 4 of 5 clauses unsupported in every file   │
│ of this snapshot. Box AI found 0 citations │
│ across the other 4 files.                  │
│                                            │
│ [ Return to author ]     [ Verify ]        │
│ Verify is off: no document in this package │
│ supports the key model.                    │
│                                            │
│ Clauses ▾   Versions ▾   Show the record ▾ │
└────────────────────────────────────────────┘
```

- The quote pair is the first screen. Reviewed quote is the sentence Priya verified, pinned to v2. The replacement is the sentence at the same section in v3 with the diff hint words underlined.
- One verdict sentence, computed: clause counts, Box AI citation count, file count. Machine text passes the wording filter.
- Buttons: the engine's `FindingCard.actions` decides which are enabled and why. The disabled reason is one line.
- Three disclosures carry everything the old card showed: clause table, version columns with Box ids and hashes, and the record.

#### Level 2, inline Return to author (decision 5)

```
│ ▾ Return to author                         │
│ ┌────────────────────────────────────────┐ │
│ │ Your reason. Recorded as the Box task  │ │
│ │ response, in your words.               │ │
│ │ ┌────────────────────────────────────┐ │ │
│ │ │                                    │ │ │
│ │ └────────────────────────────────────┘ │ │
│ │ Use suggested reason (drafted by Keel) │ │
│ │ Due 2026-10-23                         │ │
│ │       [ Return and draft author task ] │ │
│ └────────────────────────────────────────┘ │
                 ↓ after click
│ ┌────────────────────────────────────────┐ │
│ │ Box AI drafted this task for J. Park   │ │
│ │ │ architecture.md v3 §4.3 no longer    │ │
│ │ │ states the KMS customer-managed key  │ │
│ │ │ model… Restore them or cite where    │ │
│ │ │ they are now documented.             │ │
│ │                              [ Edit ]  │ │
│ │ Stored verbatim · Returned to author is│ │
│ │ recorded when the task exists in Box.  │ │
│ │              [ Approve and send ]      │ │
│ └────────────────────────────────────────┘ │
                 ↓ after click
│ ✓ Returned to author by Dana Okafor         │
│   Box task 7721 for J. Park · due Oct 23    │
│   on architecture.md v3 · snapshot S4       │
│ Show the record ▾                           │
```

- Both human fields start empty. The two chips insert text on click so the "attestation present" and "reason present" checks tick live.
- No "Later" button on stage. The draft card has Edit and Approve only; closing the panel leaves the draft awaiting, and level 1 shows a quiet "Draft awaiting your approval" line under the row.

#### Level 2, inline Verify (SEC-ARCH-22)

```
│ ▾ Verify on runbook.md v2 §3               │
│ ┌────────────────────────────────────────┐ │
│ │ Your attestation                       │ │
│ │ ┌────────────────────────────────────┐ │ │
│ │ │                                    │ │ │
│ │ └────────────────────────────────────┘ │ │
│ │ Insert attestation phrase              │ │
│ │                                        │ │
│ │ ✓ Quote present in runbook.md v2 §3    │ │
│ │ ✓ Snapshot S4 is current               │ │
│ │ ✓ You are the configured reviewer      │ │
│ │ ○ Attestation phrase in your message   │ │
│ │                  [ Confirm verify ]    │ │
│ └────────────────────────────────────────┘ │
```

Five preconditions exist in the engine; the panel shows the four a presenter can watch change and keeps the fifth (no open conflicting disposition) in the record.

#### Level 2, Acknowledge (SEC-ARCH-05)

One paragraph: "The section around the verified sentence was rewritten. The sentence is unchanged. This control is High tier, so the change needs an acknowledgment." Then one button, Acknowledge, with an optional note field. Receipt after.

#### The receipt (decision 4)

```
│ ✓ Verified by Dana Okafor                  │
│   on runbook.md v2 §3 · snapshot S4        │
│   Box task 8812 approved · 09:14Z          │
│ Show the record ▴                          │
│ ┌────────────────────────────────────────┐ │
│ │ EVT-0101 human_disposition_recorded    │ │
│ │   verified · Box user 30118804         │ │
│ │   chain 9c41…e2a7                      │ │
│ │ EVT-0100 box_task_response             │ │
│ │   approved · attestation present       │ │
│ │   chain 77b0…1d93                      │ │
│ │ EVT-0097 evaluation_completed          │ │
│ │   found · binding moved · chain 3fa1…  │ │
│ │ Chain verified 102/102 · Export CSV    │ │
│ └────────────────────────────────────────┘ │
```

Events come from `GET /api/ledger?control=…`. The chain line comes from the manifest. Export links to the existing CSV and manifest.

#### The menu (decision 7)

```
┌───────────────────┐
│ How it works      │  six boxes stacked inside the panel with a wall before Person
│ Status rules      │  the sixteen rules, inside the panel, same chips
│ Full record       │  the ledger table, inside the panel, with filters and export
│ How it was checked│  the run's steps with timings (the old trace)
│ ───────────────── │
│ Other scenarios   │  injection, unreadable, fabricated quote, none
│ Replay a run      │  labelled replay of a recorded run
│ Reset demo        │  mock only, back to S3
│ Mode · Mock       │  read-only, says Mock or Live
└───────────────────┘
```

Each item opens inside the panel as a level-2 screen with the back arrow. The old `/ledger`, `/rules`, `/architecture` routes stay for deep links but leave the navigation.

## 3. Copy and density budget

- Bubble: at most twelve words.
- Level 1: at most sixty words visible before scrolling at 900 px tall.
- Level 2 first screen: at most one hundred and twenty words before any disclosure.
- No sentence over twenty words. No paragraph over two sentences. Chips are one labelled word.
- Machine text never contains satisfied, compliant, passed or regressed. Green appears only on a human Verified on the current snapshot.
- Dates read "Oct 23" in prose and ISO in the record.

## 4. Motion

- Owl: idle blink 120 ms, every 4 s. Working pupils ease in-out 1.6 s. Attention: eyes widen 200 ms, cap tips 300 ms, badge scales in 200 ms. One spring, no bounce chains.
- Bubble: fade and 6 px rise, 200 ms. Replace in place while working; no stacking.
- Panel: translate from 420 px to 0, 320 ms, ease-out. Level change: horizontal slide 240 ms, content cross-fades.
- Inline action: height auto with 240 ms, content fades in after 80 ms.
- Row dot: scale in 200 ms; colour change 300 ms.
- Upload: progress bar 1.2 s in mock; then version text crossfades.
- Reduced motion: all durations 0, states still visible.

## 5. What this needs from the app

No engine change. Additive only:

- `POST /api/upload-version` (live: real upload then run; mock: alias for submit `architecture_v3`).
- `PackageView.files[]` with `{ file_id, file_name, version_label, updated_at, size_bytes, uploader?, open_decisions }` so the Box table and the dot are computed. If `size_bytes` is unknown in mock, derive from text length.
- `DisplayedStatus.detail` is already the secondary line; cap it at ten words in the engine's wording layer if any exceed it.
- `TraceStep` gains an optional `bubble` string computed in the service from `kind` and detail fields, so the UI never composes it.
- `FindingCard.verdict_line`: the one computed sentence for level 2.

Components (new, `app/src/components/box/`, `owl/`, `panel/`): `BoxShell`, `BoxNav`, `FolderTable`, `UploadMenu`, `UploadChooser`, `DetailsPane`, `Owl`, `Bubble`, `Panel`, `PanelHeader`, `PanelMenu`, `Level1`, `Level2`, `QuotePair`, `InlineReturn`, `InlineVerify`, `InlineAcknowledge`, `Receipt`, `RecordList`, `HowItWorksStrip`. Existing engine-facing components (`RulesPage`, `LedgerScreen` table, `TracePanel` list, `Versions`, `Clauses`) are reused inside the panel.

Removed from navigation: the package table, the header with tagline and count line, the trace column, the projection block, the tasks panel. Their data stays in the API.

## 6. The three-minute script, v4

| Time | Narration | On screen | Click |
| --- | --- | --- | --- |
| 0:00 | "This is Box. This folder passed the review board on October 7. Eight controls, five documents, each verified by a named reviewer against these exact versions. Keel is the owl." | Box folder, five files, owl idle | Nothing. |
| 0:20 | "The project uploads a rewritten architecture document." | Upload ▾, Upload new version, chooser, progress, row reads v3 | Upload ▾ → Upload new version → Upload. |
| 0:35 | "Keel pins all five files, Decider clears the text, the agent re-checks all eight controls on Bedrock and asks Box AI whether the other four files say anything about customer-managed keys." | Owl working, bubble cycles the steps | Nothing. Read the bubble aloud if the room is quiet. |
| 0:50 | "Three need me. Five hold, so nobody clicks anything for those." | Bubble: "1 Critical needs your decision. 2 more to look at." Badge 3. Dot on architecture.md. | Click the owl. |
| 1:00 | "The reviewed text named customer-managed keys. The rewrite says all data is encrypted. Encryption is still stated; the key-management commitment is gone. Box AI searched the other four files: nothing." | Level 2, was/now pair, verdict line | Row SEC-ARCH-07. |
| 1:20 | Reviewer, first person: "The machine told me where to look. It did not tell me what to decide. I'm returning this with the sentence that disappeared and the requirement it has to meet. Verify is off for me too, because nothing in this package supports the key model." | Inline Return, empty field, suggested reason inserted, Box AI draft, approve, receipt | Return to author → Use suggested reason → Return and draft author task → Approve and send. |
| 1:50 | "Recovery targets moved to the runbook. Same sentence, different file. That is a changed binding, not lost support. Thirty seconds, Low." | Back, row SEC-ARCH-22, inline Verify, checklist ticking | ‹ → SEC-ARCH-22 → Verify → Insert attestation phrase → Confirm verify. |
| 2:10 | "Every decision is recorded against the exact versions, under my name, with a hash chain. Box holds the files, the metadata and the tasks." | Receipt expanded; ⓘ details pane with keelReview fields | Show the record. Then ⓘ on the Box page. |
| 2:30 | "Box holds files, metadata, tasks, and Box AI is how the agent reads. Bedrock judges. Decider gates locally. Code validates quotes and keeps the record. The machine has its field; the reviewer has hers." | ⋯ → How it works strip | ⋯ → How it works. |
| 2:45 | "Next: a shadow evaluation over fifty historical packages." | Same | Nothing. |
| 2:50 | "Know what changed, and who reviewed that exact evidence." | Back to the Box page, owl idle, blue dot | ✕. |

Expected bubble after the run: "1 Critical needs your decision. 2 more to look at." Expected level 1 after both actions: RECORDED holds SEC-ARCH-07 (Returned to author) and SEC-ARCH-22 (Verified), ACKNOWLEDGE holds SEC-ARCH-05, 5 verifications hold. The engine's count line still exists in the API and in the record; it is no longer on screen.

## 7. Acceptance for the judge pass

1. At 1440x900 and 1024x768 the Box page shows all five files and the owl without scrolling.
2. The upload beat completes in under 3 s of presenter time; the row reads v3 before the owl starts.
3. During the run the bubble changes at least five times and never shows two steps at once.
4. After the run: badge 3, amber dot on architecture.md, bubble summary fades, badge stays.
5. Level 1 fits without scrolling at 900 px tall. Level 2 shows both quotes and both buttons without scrolling.
6. Both human fields start empty; the chips fill them; the checks tick live.
7. Receipts show who, which version, which task, which event, and the chain verifies.
8. After both actions the dot turns blue and the owl says "All 8 recorded on S4." only when SEC-ARCH-05 is also acknowledged; otherwise the badge reads 1.
9. No machine text contains the four banned words. Green appears only on the Verified receipt and its row.
10. Replay from the menu ends on the recorded outcome. Reset returns to S3 with the owl idle.
11. Keyboard: Esc closes level 2 then the panel; focus returns to the owl.
12. Reduced motion: every state is still legible.
