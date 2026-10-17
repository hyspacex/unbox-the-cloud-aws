# Design spec v1: Keel (working name)

**Control evidence that holds across versions.**
Folder-level continuous compliance for design documents in Box, judged by an agent on Bedrock,
verified only by humans, recorded in an append-only evidence ledger an auditor can sample.

Status: v1 for adversarial review. Research inputs: `01-enterprise-problem.md`, `02-aws-agentic.md`, `03-box-ai.md`.

---

## 1. The problem in three sentences

A bank's architecture review board approves a design on Tuesday: ten controls, each backed by a sentence in a document, each signed off by a named person. On Thursday an engineer uploads v3 of the architecture doc with an AI-polished rewrite of section 4, and the sentence that satisfied "data at rest encrypted with customer-managed keys" is gone. Nothing in Box, Confluence, Vanta, or the review board's process notices, and six months later an auditor asks for the full list of changes in the period and which version proved each control.

## 2. Who it is for

| Role | What they need | How Keel serves them |
| --- | --- | --- |
| Security architect on the architecture review board (daily user) | Know which control broke, in which paragraph, so they re-review one paragraph instead of a 30-page doc | Review queue of AI findings with the exact quote that vanished, one-click Confirm or Override |
| Head of technology risk / GRC (buyer) | Proof that the design-review control operated continuously, not once at the gate | Append-only ledger: every status change with version id, hash, quote, reviewer, timestamp, model id |
| Auditor / examiner (consumer) | A dated population to sample, and the complete list of changes in the period | Ledger export (CSV now, OSCAL on the roadmap), each entry pinned to a Box file version |
| Project team (author) | What is missing and what to add | Per-control "suggested fix" and the folder's open items |

## 3. What Keel does

1. **Watches a Box project folder.** The folder holds the architecture doc, data-flow doc, DPIA, runbook, vendor contract. A control profile (JSON, bring-your-own) lists 10 checkable controls, each mapped to ISO 27001, PCI DSS 4.0, GDPR, DORA citations.
2. **On any new file or new version,** a Strands agent on Bedrock evaluates the change against the controls, in the context of the whole folder.
3. **Re-verifies what the change could have broken.** Code, not the model, computes the mandatory re-check set: every control whose current evidence cites the changed file. The model is asked "here is the quote that used to satisfy C1; is C1 still satisfied by the new version or by any other file in the folder?" It has a folder-search tool so evidence that moved to another document is found rather than flagged.
4. **Returns typed findings.** Status, verbatim quotes with file and version, missing quotes for regressions, confidence, reasoning, suggested fix. Code validates every quote against the actual version text. A quote that is not found is dropped. A regression without a vanished quote is rejected.
5. **Writes an evidence event** for every status change, append-only, with Box file version id, content hash, quote, model id, prompt hash.
6. **Projects status into Box.** Metadata template on the folder (control statuses) and on each file (controls it evidences). Box comment on the file for regressions. Downstream agents and Box users see it where they already look.
7. **Hands judgment to a human.** The agent can propose Satisfied, Not evidenced, Contradicted, or Regressed. It cannot write Verified. Only a named reviewer who is not the uploader can Verify, Override with reason, or Accept risk until a date.
8. **Renders the folder's history** as an evidence timeline: one row per control, status changing over time, each change clickable to its ledger entry and the exact file version.

## 4. Status model

```
                 AI proposes                 Human acts
Open ──────────> Proposed Satisfied ───────> Verified
  ^                    │                        │
  │                    │ evidence gone          │ evidence gone (mandatory re-check)
  │                    v                        v
  └──────────────── Not evidenced          Regressed ──> human: Re-verify | Override (reason) | Accept risk until <date>
                       │
                       └── Contradicted (two files disagree) ──> human resolves
```

Rules the code enforces, not the prompt:
- Only a human action writes Verified. There is no tool, API, or code path for the agent to do it.
- Reviewer ≠ uploader of the file that provides the evidence (Box user ids).
- Every evidence quote must string-match the stated file version after whitespace normalization.
- Regressed requires at least one previously cited quote that is absent from the new version.
- Events are append-only. Corrections are new events.

## 5. The experience

### Screen 1: Folder view (what the architect opens Monday morning)
Left: the Box folder's files with version badges. Center: ten control rows. Each row shows status chip, framework citations, the evidencing file and version, and who verified it and when. Top: "8 Verified, 1 Regressed, 1 Not evidenced" and a Review Queue button with a count. This is the "what is missing, what do I do next" view.

### Screen 2: Finding card (the hero)
Opened from the Review Queue or by clicking the red row. Two columns. Left: v2, the quote that satisfied C1, highlighted, with "Verified by Priya N., Oct 14, 10:32." Right: v3, the same section, the sentence gone, the surrounding paragraph shown so the reviewer sees the AI rewrite that swallowed it. Below: the agent's reasoning in three sentences, confidence, the folder search it ran ("searched 4 other files for key management statements, none found"), and three buttons: **Re-verify** (disabled until a quote exists), **Override: evidence is elsewhere** (requires a quote), **Accept risk until [date]**. A small line: "Model: claude-sonnet-4-6, prompt v3, evaluation 11.4 s."

### Screen 3: Evidence timeline (what the auditor sees)
Ten horizontal lanes, one per control. Time on the x-axis. Each lane changes color at each status event. Click any change to open the ledger entry: control, old status, new status, file, version id, hash, quote, actor (agent or human), timestamp, model id. An **Export evidence pack** button produces CSV. This is the "show me the full list of changes in the period" view.

### Screen 4: Live agent trace (shown during the demo, collapsible after)
When a new version lands, a side panel streams the agent's steps: Guardrail check passed, extracted 23 assertions from v3, diff found 2 removed and 4 changed, re-check set is C1 C3 C8, calling get_prior_evidence(C1), calling search_folder("customer-managed keys"), judging, 3 findings validated, 1 regression. This is what turns "a spinner then a result" into "an agent working."

### In Box itself
The folder's metadata sidebar shows the control template with ten statuses. The architecture doc has a comment from Keel: "C1 Encryption at rest: REGRESSED in v3. The sentence verified on Oct 14 no longer appears. Review queued for the ARB." The reviewer can work from Box or from Keel.

## 6. The three-minute demo

| Time | Beat | On screen |
| --- | --- | --- |
| 0:00 | Team, one sentence each on what they built | Title |
| 0:15 | "This project folder passed the review board Tuesday. Ten controls, each verified by a named person. Box Automate routed it. Vanta checks the buckets. Nobody checks whether the design that justified the buckets is still the design." | Folder view, ten green rows |
| 0:40 | "An engineer uploads v3 of the architecture doc. AI-polished rewrite of section 4." Click upload. | Agent trace streams: guardrail, extract, diff, re-check set C1 C3 C8, search_folder, judge |
| 1:00 | C1 turns red in Keel and in the Box metadata sidebar. | Folder view, then Box tab |
| 1:10 | Open the finding. "Here is the sentence that satisfied encryption-at-rest, verified by Priya on Oct 14. Here is v3. It is gone. The agent searched the other four files. It is not anywhere." | Finding card |
| 1:40 | "The agent cannot fix this. It can only ask." Show the disabled Re-verify button. Click Accept risk until a date, type a reason. | Finding card, action |
| 2:00 | Timeline. "Every change, pinned to a version, with who and when. This is the list the auditor asks for." Click one entry, show the ledger record with model id and hash. Export. | Timeline, ledger entry |
| 2:30 | Architecture strip. "Box is the content, the metadata, and the review surface. Bedrock is the judgment. Code owns the state. A human owns the verdict." | One slide |
| 2:45 | "Files have versions. Compliance evidence should too." | Title |

Second beat if there are 20 spare seconds: the vendor contract lists a US sub-processor, the architecture doc says EU-only, C3 flips to Contradicted with two quotes from two files.

## 7. Architecture

### Built in the six hours
- Next.js app, mock mode by default (canned findings and trace), real mode on the integration laptop.
- Strands TypeScript agent with BedrockModel on the bedrock-runtime Converse endpoint. Haiku 5.5 extracts assertions per file. Sonnet 4.6 judges (Sonnet 5.5 behind an env var after rehearsal). Zod schema for findings. Tools: get_prior_evidence, get_file_text(file, version), search_folder.
- Deterministic layer: assertion diff between versions, mandatory re-check set, quote validation, status machine, append-only JSON ledger.
- Bedrock Guardrails ApplyGuardrail on document text (prompt attack, PII) before the agent sees it.
- Box: file download by version, metadata template on folder and files, comment on regression. Trigger is a button or folder polling, no webhook on a laptop.
- Live trace from Strands stream events.

### Slide only, and we say so
Box webhook to Lambda URL (signature check) to EventBridge to SQS FIFO per folder to AgentCore Runtime. AgentCore Identity holds Box OAuth. AgentCore Policy (Cedar) forbids status=Verified from any agent. AgentCore Memory holds folder context. AgentCore Observability to CloudWatch. DynamoDB ledger with Streams to S3 Object Lock for the auditor export. AgentCore Evaluations as a regression-accuracy gate in CI. Box AI Studio agent registration so a Box Automate workflow calls Keel as its judgment step.

### What Box and AWS each do
- Box: content and versions, metadata on folder and files, comments and tasks for the human step, Box AI extract_structured with include_reference for per-file evidence and Box AI ask multiple_item_qa for cross-file questions where useful, the review surface users already have.
- AWS: Bedrock models with structured output, Strands agent loop and tools, Guardrails, the production hosting and ledger story.

## 8. Positioning

- **Versus Box Automate.** Automate fires on upload, runs a Box AI step, routes an approval. We do not rebuild it. Automate cannot say whether control 4 is still satisfied across the folder, which version proves it, and when that stopped being true. In production Keel is the judgment step Automate calls.
- **Versus Vanta / Drata.** They test the bucket through APIs. Documents are upload-only. We check that the design that justified the bucket has not silently changed. Design plus operation.
- **Versus Prime Security / Seezo.** They threat-model one document at a time. We track control evidence across files and versions for the auditor.
- **Versus Confluence "changed since approval" apps.** They flag every edit by hash. We name which control broke and why, so the reviewer re-reviews one paragraph.
- **One line for AWS judges.** The LLM never owns state. It proposes findings with quotes; deterministic code diffs, records, and enforces that only a human can mark Verified.

## 9. Enterprise readiness, stated honestly

Built into the design: AI never self-approves; separation of duties; Box identity, no custom auth; append-only version-pinned ledger; verbatim quote validation; "Not evidenced" as a first-class answer; model id and prompt hash on every event; data stays in-region on Bedrock; bring-your-own control JSON; CSV export.

Not in the hackathon build, said out loud: production ledger (DynamoDB plus Object Lock), webhook trigger, AgentCore hosting, ServiceNow or Archer integration, OSCAL export, measured precision on a held-out set, per-reviewer permissions beyond Box's own.

## 10. Measured, not claimed

From the live probe in `02-aws-agentic.md`: a 7-page doc with 12 controls evaluates in 10 to 17 seconds depending on model, at $0.002 to $0.07 per evaluation, and all four Claude models caught the planted regression. We will quote these only as "in our tests."

## 11. Build plan (Saturday)

| Hour | Milestone |
| --- | --- |
| 0 to 1 | Demo data: five documents, v1 to v3 of the architecture doc, control profile JSON. Extraction plus judge on the hero regression, three runs, all three catch it. |
| 1 to 2.5 | Deterministic layer: diff, re-check set, quote validation, state machine, ledger. Folder view and finding card from mock data. |
| 2.5 to 4 | Real Box: download versions, write metadata, post comment. Live trace panel. Timeline view. |
| 4 to 5 | Guardrails call, export, Box tab rehearsal, architecture slide. Feature freeze. |
| 5 to 6 | Three full rehearsals. Backup recording. README. Submit by 1pm. |

## 12. Risks

| Risk | Mitigation |
| --- | --- |
| Free Box developer plan keeps one file version | Snapshot text plus version id on every detected upload into our store. Ask organizers for an Enterprise sandbox. |
| Model misses the regression live | Re-check set is computed by code and the model is handed the vanished quote. Cached finding as fallback. |
| Sonnet 5.5 rejects forced tool choice | Default judge is Sonnet 4.6. Model ids in env vars. |
| CCG service account gets 404 | Collaborate the service account on the demo folder first. |
| Agent takes 15 seconds on stage | The trace panel makes the wait the demo. |
| "Isn't this Prime / Seezo / Automate?" | Positioning section, rehearsed. |

## 13. Open questions for review

1. Is "Keel" the right name, and is the one-liner clear to a non-specialist?
2. Does the finding card give a security architect enough to act in under a minute?
3. Is the status model too complex for three minutes, or too simple for an auditor?
4. Which of the three screens would a real ARB reviewer open first, and does the demo open that one?
5. Is anything here something Box Automate or Box AI already does that we are presenting as new?
6. What would make a head of technology risk say no to a pilot?
