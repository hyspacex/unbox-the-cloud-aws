# Keel presenter runbook

Three minutes, one laptop, synthetic data. The script is spec v3.4 section 7 (`docs/research/30-design-v3.md`). The "Click" column names the control in the app.

## Pre-flight checklist

1. `app/.env.local` has `MOCK_MODE=true`, or the file is absent. Use live mode only after `docs/INTEGRATION.md` section 7 passes.
2. Start the dev server: `cd app && npm run dev`. Open `http://localhost:3000`.
3. Press **Reset to baseline** on the package view. Confirm the count line reads the baseline line below.
4. Browser window 1440 pixels wide, zoom 100 percent. Check that all eight rows fit without scrolling.
5. Close the finding drawer. No modal open.
6. Open `/ledger` in a second tab. Leave it on the event list.
7. The mode label in the header reads Mock or Live. Say which one out loud at 0:00.
8. Live mode only: open the reviewer's Box task list in a third tab, logged in as the reviewer.

## Expected count lines

Baseline, after **Reset to baseline**:

```
8 controls on snapshot S3: 8 Verified holds
```

After the submit run:

```
8 controls on snapshot S4: 5 Verified holds, 1 Acknowledge (High), 1 Needs review (Low), 1 Needs review (Critical)
```

After the two human actions:

```
8 controls on snapshot S4: 5 Verified holds, 1 Acknowledge (High), 1 Verified, 1 Returned to author
```

The spec's 0:15 row says "eight rows Verified, snapshot S2". The app boots on S3, the no-change snapshot after the runbook edit, so the rows read "Verified, holds". The narration still holds: the verifications were made on S2 and the secondary line on each row names them.

## The three-minute script

| Time | Narration | On screen | Click |
| --- | --- | --- | --- |
| 0:00 | "Approved design evidence can change. Keel shows which control needs another look, and who reviewed which version. This is a synthetic bank example." | Title, tagline, mode label | Nothing. Package view is open. |
| 0:15 | "Lantern's package passed the review board on October 7. Eight controls across five documents, each verified by a named reviewer against these exact file versions." | Package view, eight rows Verified, snapshot S2 | Nothing. Point at the secondary review lines. |
| 0:40 | "The project submits a rewritten architecture document. Keel pins all five files, Decider clears the text as safe and material, and the agent re-checks all eight controls, asking Box AI whether the other four files say anything about customer-managed keys." | Real upload; trace with application, Decider, Box AI, and agent events, coverage, elapsed time | **Submit rewritten architecture document**. Live mode: run `npx tsx scripts/upload-v3.ts --write` from `app/` instead. |
| 1:05 | "Five verifications hold: the evidence is unchanged, so nobody clicks anything. One needs a glance: the sentence is still there, but the section around it was rewritten, and that control is High tier. Two need a look." | Package view on S4: five Verified holds, one Acknowledge, one Low, one Critical | Nothing. Point at the count line, then at row SEC-ARCH-05. |
| 1:15 | "The reviewed text named customer-managed keys. The rewrite only says all data is encrypted. Encryption is still stated; the key-management commitment is gone. Box AI searched the other four files with citations: nothing." | Finding card, two quotes, word diff, clause marks, "Needs review: key-management evidence missing" | Row **SEC-ARCH-07**. The finding card opens in the drawer. |
| 1:35 | "Recovery targets left this document too, but they are here in the runbook. That is a changed evidence binding, not lost support. A thirty-second acknowledgment, severity Low, not an investigation." | SEC-ARCH-22 row, runbook quote and version | Row **SEC-ARCH-22** (close the drawer first if it covers the rows), then **Verify**, then **Confirm verification**. The attestation phrase is prefilled. |
| 1:45 | Reviewer, first person: "The machine told me where to look. It did not tell me what to decide. I am returning this to the author with the sentence that disappeared, the requirement it has to meet, and a due date of October 23. That is recorded against these exact file versions, under my name and role. Verify is disabled for me too, because no document in this package supports the key model. When v4 lands, Keel re-checks, and I review one paragraph. What you see on this card is what the ledger says I saw when I decided." | Box task completed in a pre-opened tab; Keel shows responding identity, reason, author task id, binding check, ledger event; row reads "Returned to author, open"; the author's task appears as the first block in the card's thread | Row **SEC-ARCH-07**, then **Return to author**. Step 1: check the prefilled reason, press **Draft author task**. Step 2: show the Box AI draft, press **Confirm and return to author**. |
| 2:15 | "Every evaluation is recorded, including the five where nothing changed. The export covers what Keel observed. Complete audit coverage needs reconciliation, which is pilot work." | Ledger, export with counts from the run and the limitation line | Nav **Ledger** (or the pre-opened tab, refreshed), then **Download manifest**. |
| 2:30 | "Box holds the files, the metadata, and the tasks, and Box AI is how the agent reads the package. Bedrock judges. Decider gates the input locally. Code validates quotes and records history, locally in this build. The machine has its field, the reviewer has hers, and the machine cannot write to hers." | Three-box strip with Box AI and Decider placed, built versus proposed separated, local ledger named | Nav **Architecture**. |
| 2:45 | "Next: a shadow evaluation over fifty historical packages, measuring misses, false alerts, and review time." | One line | Nothing. |
| 2:50 | "Know what changed, and who reviewed that exact evidence." | Title, tagline, final evidence pair | Nothing. |

**Order note.** The spec narrates SEC-ARCH-22 at 1:35 and the hero return at 1:45. Verifying SEC-ARCH-22 at 1:35 keeps the hero as the last human beat. If time is short, skip the Verify click and narrate the row only. The final count line then shows "1 Needs review (Low)" in place of "1 Verified".

In mock mode the two modals stand in for the Box task responses, and their footers say so. In live mode the reviewer resolves the task in Box, and Keel ingests the response by polling.

## Fallbacks

**Author task unavailable at 1:45.** If author task creation fails, the engine records Confirm finding automatically. An acknowledgment event is written, no disposition is written, and the row keeps its Needs review label. Say: "The reviewer confirms the key-management gap in Box with her reason. We record it against these versions. The gap stays open; routing to the author is proposed."

**Live run over its rehearsed window.** Show a labelled replay of the real run with its run id, or set `MOCK_MODE=true`, restart `npm run dev`, and press **Reset to baseline**. The mode label must read Replay or Mock. Never present mock output as live.

## Questions judges may ask

**Why does nothing turn green after the agent runs?**
Green means a named person verified this control on the current snapshot and binding, and only rule 9 produces it. The agent only proposes a machine assessment, which is labelled "machine assessment, not a verdict".

**Why can't the machine write a disposition?**
The model's output schema has no disposition field, and the agent has no write tool. The ledger rejects a machine event that carries a human disposition, and only the human response handler writes one after identity, author and binding checks.

**What if the model hallucinates a quote?**
Every quote must string-match the pinned version text after disclosed normalization. A required quote that fails validation makes the control `not_evaluated`, which is acceptance case 7.

**What if Box AI is unavailable?**
The search tool falls back to normalized string search over the pinned texts. The trace label says "Box AI unavailable", and an uncited or unvalidated Box AI answer counts as no evidence.

**What is Decider?**
Strands Decider 2B is a 1.9-billion-parameter open decision model that returns a choice with probabilities and never generates text. It runs locally and gates each changed file for injection and materiality before any text reaches Bedrock, and when it is not running the step is omitted rather than shown as passed.

**How does this scale?**
The proposed path is a Box webhook to a Lambda URL, EventBridge, SQS FIFO per folder, and the same agent on AgentCore Runtime, with a DynamoDB ledger streamed to S3 Object Lock. None of that is built, and it is on the architecture page as proposed.

**What is actually built?**
The full review transaction runs end to end on one laptop: snapshot, gate, one Bedrock evaluation, validation, staleness, hash-chained ledger, folder metadata, review and author tasks. Exceptions, not-applicable, compensating controls, Jira, IRM and cloud hosting are proposed and shown with no transition behind them.

**Where does the data go?**
In live mode, document text goes from Box to the laptop and to Bedrock under a `us.` inference profile in us-east-1, and it is stored in the local ledger. The inference profile is a routing choice, not a residency guarantee, and a bank pilot needs a data-classification decision first.

**Why does Dana Okafor review the encryption control when Priya Natarajan verified it on October 7?**
The demo tenant has one configured reviewer identity, so every review task in the demo is assigned to her; the card still shows the original verifier, role and version on the secondary line. Routing by reviewer role from the directory is a bank-owned pilot gate, named as such in the spec and on the architecture page.

**Why does the baseline say S3 and "Verified, holds" rather than S2 and "Verified"?**
On October 12 the runbook changed its escalation contact, Keel re-evaluated, nothing changed, and every verification was recorded as holding. That is the most common row in the system, and showing it first is the point: a no-change evaluation is still recorded.
