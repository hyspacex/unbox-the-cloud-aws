# Keel: 3-minute deck and speaker script

**Open:** `http://localhost:3000/deck.html` (served by the app). Press **F** for full screen and **T** to start the timer.

**Keys:**

- **← / →:** change slide. 
- **V** (on slide 3): play the recorded fallback, if `public/deck/fallback.mp4` exists.
- Number keys **1–4** jump straight to a slide.
- **Shift+R** (on slide 3): reset the demo (mock mode only).

**Clicks inside the demo** go to the app. Click the grey margin or the right-hand rail to give keys back to the deck.

**What the rail does.** Slide 3 is the live app in a frame. The rail on its right lights each Box API and AWS service as the run actually reaches that step; it reads the run's own trace from `/api/runs` and `/api/run/{id}`. The Box/AWS talking points are spoken while the owl works; there is no extra slide for them.

**Scenario: ISO 27001 regression.** Control SEC-ARCH-07 (encryption at rest and key management) is mapped, illustratively, to ISO/IEC 27001:2022 Annex A **A.8.24, Use of cryptography**. The v3 rewrite drops "customer-managed keys, rotated annually".

**Structure:**

- **Slide 1** states the problem.
- **Slide 2** shows how Box and AWS solve it.
- **Slides 3–4** show it working and close.

**Style:** Box colours (white, Box blue, Lato). Motion is subtle: the arrows flow and one gap dot breathes. Nothing vanishes or flashes.

| Time | Slide | Say | Do |
| --- | --- | --- | --- |
| 0:00–0:25 | **1 · The problem** | "Approved design documents keep changing. Nobody can tell which compliance evidence still holds. On October 7 our review board verified this sentence: customer-managed keys, rotated annually. That's our ISO 27001 encryption evidence. Ten days later it was rewritten 'for clarity'. It still says encrypted and reads fine, but the key ownership and rotation are gone. The old approval still looks valid. Reviewers reread everything, and auditors rebuild the evidence by hand." | Point left to right along the cards. → |
| 0:25–0:50 | **2 · How we solve it: Box + AWS** | "Keel re-checks every control on every new version, and asks a person only about what changed. Box is the governed record: versions, metadata, tasks, and Box AI for cited search and drafting. AWS is the judge: Bedrock through a Strands agent, with the Decider gate against prompt injection. Four steps: Box pins every file version, Bedrock re-checks each control, code matches every quote to that version, and a named person decides in a Box task." | Point at the four-step line. → |
| 0:50–1:05 | **3 · Demo:** baseline | "This is our project folder in our Box replica. Synthetic bank, simulated integrations, same engine. It's checked against ISO 27001, NIST and PCI. Eight verifications hold." | Point at the "Checked against" badges and the board. Click the owl. |
| 1:05–1:30 | **3 · Demo:** upload, then the rail | "J. Park uploads the new version." While the owl works, point at the rail: "Here are the services from the last slide, lighting up as the run uses them: versions pinned, the gate, Bedrock, Box AI across the other files, every quote matched." | **Upload ▾ → Upload new version → architecture.md (v3 draft) → Upload.** |
| 1:30–2:00 | **3 · Demo:** the finding | "Five still hold. Three need a person. Encryption is critical: here is what was agreed, here is what changed. Four of five clauses are no longer supported anywhere, and Box AI found no citation in the other files." | Open **Encryption at rest and key management**. Point at AGREED / CHANGED. |
| 2:00–2:30 | **3 · Demo:** a person decides | "The reviewer returns it to the author. Box AI drafts the task, she approves it, and Keel records the decision against this exact version, under her name. The gap stays open until it's fixed." | **Return to author → Use suggested reason → Return and draft author task → Approve and send.** |
| 2:30–2:50 | **4 · Close** | "Keel: know what changed, and who reviewed that exact evidence. Next: a decisions ledger across every document, certification packs, and a governed endpoint so downstream agents read only verified evidence." | Stop. 10 s buffer. |

## If something breaks

- **App stalls during the run:** keep talking over the rail. If nothing moves for 10 s, open the panel's **⋯ → Replay a run** and say "this is a recorded run".
- **App down:** press **V** for the recorded fallback (if present) and say so.
- **Projector at 1024×768:** the deck scales to fit, but the app inside the frame stays 1440 wide and also scales. Test once.

## Honesty lines (keep them)

- Say "simulated integrations, same engine" once, early, if the app is in mock mode. Slide 2 shows the mode it reads from the app.
- Framework mappings are illustrative. Never say "ISO certified" or "compliant". Say "ISO 27001 evidence".
- All data is synthetic.

## Q&A pocket answers (from the judge research)

- **Carter (Box DevRel): "Why Box metadata, not your own database?"** Status lives on the folder's `keelReview` metadata, so it inherits Box permissions, search and retention. The human step is a Box task, an audited Box event.
- **Chris (Box DevRel): "How do you stop the model from making things up?"** Every quote must string-match the pinned version text. Box AI citations are re-validated. No match means "not evaluated", never a pass. The model has no tool that writes a decision.
- **Janny (AWS Field CTO): "How does this deploy?"** A Box webhook goes to a Lambda URL, then SQS FIFO with one run per folder, then the runner, then DynamoDB and S3 Object Lock for the ledger. This is proposed, not built today. Compute is stateless, with Box as the system of record.
- **Kaushik (Amazon Product): "Who pays, and what moves?"** The buyer is the head of technology risk or the security architecture board. What moves: review effort scales with what changed, not with package size, and the auditor gets a version-bound evidence export.
- **Magan (MCP founder): "Can agents consume this?"** Next step: a governed endpoint that serves only evidence a person has verified. Enforcement happens server-side, before serialization, not in a prompt.
- **Karthik (Amazon SA): "Is it live?"** Name the mode. Show the rail reading the real trace. Offer `docs/INTEGRATION.md` for the live path.
