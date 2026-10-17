# Keel build contracts (frozen shapes for the Saturday build)

Source of truth: `docs/research/30-design-v3.md` (design spec v3.4). Shapes: `app/src/lib/types.ts`.
Fixture: `demo-data/lantern/` (full, eight controls, five files). `live-slice/` is the fallback.

Rules: add optional fields, never rename or remove. Routes below do not change names. Every
service function branches on `MOCK_MODE` (default `true`) and the mock path runs the same
deterministic code as the live path; only the Box, Bedrock, Box AI and Decider adapters are swapped.

## Module layout (`app/src/`)

| Path | Lane | Contents |
| --- | --- | --- |
| `lib/types.ts` | shared | Frozen shapes |
| `lib/config.ts` | shared | Env: `MOCK_MODE`, `KEEL_MODEL_ID`, `KEEL_INFERENCE_PROFILE`, `KEEL_MRM_MODEL_ID`, `KEEL_PROMPT_VERSION`, reviewer and author identities, `DECIDER_URL`, Box creds |
| `lib/fixture.ts` | engine | Typed loader for `demo-data/lantern/*` (path resolved from repo root) |
| `lib/engine/normalize.ts` | engine | Normalization (whitespace, quotes, hyphens, backticks, case), quote validation against pinned text, section text extraction from markdown |
| `lib/engine/assess.ts` | engine | Assessment from clause support (all: found, some: weakened, none: absent), precedence, change classification vs prior binding |
| `lib/engine/staleness.ts` | engine | Verification holds and acknowledgment per tier materiality |
| `lib/engine/display.ts` | engine | The sixteen ordered rules → `DisplayedStatus`; count line from displayed outcomes |
| `lib/engine/projection.ts` | engine | Projection codes, folder metadata field set, encoded `keel_last_human_review` |
| `lib/engine/ledger.ts` | engine | Append-only hash chain compatible with the fixture: `sha256(prev_chain_hash + canonicalJSON(event without chain_hash))`, canonical JSON = Python `json.dumps(sort_keys=True)` default separators and `ensure_ascii=True` escaping. Must verify all 98 fixture events |
| `lib/engine/disposition.ts` | engine | Human response handler: identity check, author check, binding freshness, verify preconditions, dedup on `assignment_id|completed_at`, stale re-apply or rejection |
| `lib/engine/diff.ts` | engine | Prior-quote diff hints by hint terms; word-level diff for the card |
| `lib/engine/pipeline.ts` | engine | The review transaction: snapshot → fetch/coverage → diff hints → gate → evaluate → validate → assess → staleness → ledger → projection → tasks |
| `lib/store.ts` | engine | `app/data/store.json` (gitignored). Ledger events, snapshots, tasks, task mapping, current snapshot pointer, runs/traces. Reset to seed in mock mode |
| `lib/service.ts` | engine | Facade used by API routes. Branches on `MOCK_MODE` |
| `lib/agent/schema.ts` | agent | Zod `FindingSet`: per control `{control_id, clause_support[], basis[], suggested_action}`; no disposition field, no history field, unknown ids rejected |
| `lib/agent/prompt.ts` | agent | Prompt v3 text, hashed |
| `lib/agent/evaluator.ts` | agent | Strands TS `Agent` on `BedrockModel` (`KEEL_INFERENCE_PROFILE`, default `us.anthropic.claude-sonnet-4-6`), tools `get_prior_evidence`, `read_snapshot_file` (snapshot-constrained), `search_snapshot` (Box AI ask with citations, string-search fallback). Emits `TraceStep`s via a callback |
| `lib/agent/mock-evaluator.ts` | agent | Returns the model's raw output for a scenario from the fixture; same shape as the real evaluator |
| `lib/agent/decider.ts` | agent | Strands Decider 2B input gate adapter: `available:false` when not running; never fakes a pass |
| `lib/box/adapter.ts` | box | `BoxAdapter` interface (below) |
| `lib/box/real.ts` | box | `box-typescript-sdk-gen` implementation |
| `lib/box/mock.ts` | box | In-memory Box seeded from the fixture: files, versions, texts, folder metadata, tasks and assignments, Box AI ask and text gen |
| `components/**`, `app/**/page.tsx`, `app/globals.css`, `app/layout.tsx` | ui | Package view, finding card, ledger and export, trace, rules, architecture |
| `app/api/**` | engine | Routes below |
| `scripts/**` | box/agent | `integration-gate.ts`, `decider-smoke.ts` |
| `test/**` | engine | Vitest: acceptance cases 1 to 20 from spec section 12 |

## BoxAdapter interface (lib/box/adapter.ts)

```ts
interface BoxAdapter {
  listFolderItems(folderId): Promise<{ fileId; fileName; currentVersionId; sha1?; size }[]>;
  listFileVersions(fileId): Promise<{ versionId; createdAt; uploader?: BoxIdentity; comment? }[]>;
  downloadVersionText(fileId, versionId): Promise<{ text; sha256 } | { error: { code; message } }>;
  readFolderMetadata(folderId, template): Promise<Record<string, string | null> | null>;
  writeFolderMetadata(folderId, template, fields): Promise<{ ok: true } | { ok: false; error }>;
  createTask(fileId, message, action: "review" | "complete", dueAt?): Promise<{ task_id }>;
  assignTask(taskId, assignee: { id } | { login }): Promise<{ assignment_id; assigned_to: BoxIdentity }>;
  listTaskAssignments(taskId): Promise<{ assignment_id; assigned_to: BoxIdentity; resolution_state; message; completed_at }[]>;
  aiAsk(fileIds[], prompt, { citations: true }): Promise<{ answer; citations: { fileId; versionId?; content }[] } | { unavailable: true; reason }>;
  aiTextGen(fileIds[], prompt): Promise<{ text } | { unavailable: true; reason }>;
}
```

The mock implementation keeps the task state machine: a reviewer "responds" through
`POST /api/action` in mock mode, which the mock Box turns into an assignment resolution; the
service then ingests it through the same handler the live poller uses.

## API routes (`app/src/app/api/`)

| Route | Method | Request | Response |
| --- | --- | --- | --- |
| `/api/config` | GET | | `AppConfig` |
| `/api/package` | GET | | `PackageView` for the current snapshot |
| `/api/finding/[id]` | GET | finding id or control id | `FindingCard` |
| `/api/submit` | POST | `SubmitRequest` | `SubmitResponse`; starts the run asynchronously |
| `/api/run/[runId]` | GET | | `Trace` with steps so far plus `{ done: boolean }` |
| `/api/run/[runId]/stream` | GET | | SSE of `TraceStep` then `{event: "done"}` |
| `/api/action` | POST | `ActionRequest` | `ActionResponse` |
| `/api/draft-author-message` | POST | `{ finding_id, reason }` | `{ text, drafted_by }` (Box AI text gen or template fallback, labelled) |
| `/api/ledger` | GET | `?control=SEC-ARCH-07` optional | `Ledger` (events filtered) |
| `/api/export` | GET | `?part=csv` or `?part=manifest` | CSV text or `ExportManifest` |
| `/api/reset` | POST | | mock only: back to the S2/S3 baseline |
| `/api/tasks` | GET | | open and completed Box tasks (mock: in-memory; live: polled) |

## UI routes (`app/src/app/`)

| Route | Screen |
| --- | --- |
| `/` | Package view with the trace panel and the finding card as a drawer or route |
| `/finding/[id]` | Finding card (deep-linkable) |
| `/ledger` | Ledger and export |
| `/rules` | Status rules, published |
| `/architecture` | What Box does, what AWS does, what code does, what a person does; built vs proposed |

## Mock state machine (the three-minute demo)

1. Boot: store = seed phase of `ledger.json` (S1 to S3, ARB decision, eight verifications), current snapshot S3, all rows Verified holds, count line computed.
2. `POST /api/submit {scenario: "architecture_v3"}`: mock Box gets `architecture.md` v3; the pipeline runs for real against the mock adapters; the mock evaluator returns the clause support recorded in `expected-findings.json`; trace steps stream with compressed timing (about eight seconds, labelled compressed); ledger gains the S4 events; folder metadata written; review tasks A, C, D created.
3. `POST /api/action {action: "return_to_author"}` on SEC-ARCH-07: mock Box resolves task A `rejected` with the reviewer's reason as the configured reviewer identity; handler ingests it; author task B is created with the Box AI draft (mock: fixture text); only then `returned_to_author` is recorded; projection rewritten.
4. `POST /api/action {action: "verify"}` on SEC-ARCH-22: task C `approved` with the attestation phrase; preconditions checked; `verified` recorded on runbook.md v2.
5. `POST /api/reset` returns to step 1.

Expected labels at each step are in `expected-findings.json` (`expected_display`, `expected_count_line_before`, `expected_count_line_after`). Those are test oracles, never inputs.

## Round 2 additions (engine review fixes, Oct 17)

Additive only; nothing above is renamed or removed.

| Route | Method | Response |
| --- | --- | --- |
| `/api/poll` | POST | `{ poll, tasks, open, completed, awaiting_drafts }`. Live: polls every open Box review task and ingests resolved assignments through the disposition handler (serialized per package); failures land in `poll.errors`, never thrown. Mock: no-op returning the task list. |
| `/api/runs` | GET | `{ runs: [{ run_id, mode_label, snapshot_id, prior_snapshot_id, started_at, total_duration_ms, status, step_count, compressed_timing, scenario?, error? }] }`, newest first. Replay a stored trace read-only with `GET /api/run/[id]` (spec 7 fallback: labelled replay with its run id). |

`GET /api/tasks` now also returns `awaiting_drafts`, and in live mode polls first and returns `poll`.

**New action.** `POST /api/action { action: "approve_author_draft", finding_id, control_id, author_message }`: the reviewer approves the author-task draft. A Return to author that arrived from Box without an approved draft is recorded as Confirm finding with `awaiting_draft` and resumes here: author task first, then `returned_to_author`. In mock mode, `return_to_author` in Keel approves `author_message` (or the fresh Box AI draft) itself.

**State rules.** The finding, control and decision snapshot come from the immutable task mapping only; a client `decision_snapshot_id` is recorded as `client_snapshot_id` for the notice. Rows stay `pending_recheck` (prior label struck through, prior evidencing kept) until `evaluation_completed`. Events that do not project carry `projection.box_metadata: "n/a"`.

**New error codes.** 400 `FINDING_CONTROL_MISMATCH`, 409 `NO_AWAITING_DRAFT`, 409 `LIVE_RESPOND_IN_BOX`, 400 `DRAFT_REQUIRED`, 503 `STORE_UNREADABLE` (the store exists but fails structure or chain validation; Keel fails closed and leaves the file untouched; mock `/api/reset` moves it to `*.unreadable-<ts>` and reseeds). All errors are `{ error: { code, message } }`.

**Optional fields added to `types.ts`.**
- `AppConfig.decider.kind`: `"mock" | "decider" | "absent"`.
- `ActionRequest.action` gains `"approve_author_draft"`.
- `PackageView.poll`: `{ at, ok, ingested, errors }`, live only.
- `PackageView.awaiting_drafts`: `[{ finding_id, control_id, task_id, target_snapshot_id, updated_at }]`.
- `FindingCard.opened_at`, `FindingCard.pending_author_draft`: `{ reason, draft?, drafted_by?, task_id, snapshot_id? }`.
- `FindingCard.actions.return_to_author.suggested_reason`.
- `DisplayedStatus.tone` gains `"teal"`: rule 10 "Verified, holds" returns teal; green stays only for a rule 9 Verified. The UI maps API tones directly.

**Ledger fields added.** `wording_filter` (machine text withheld by the banned-word filter); `removed: true` on `file_version_observed`; `attempt` N on retries of the same `evaluation_id`; `client_snapshot_id` in `freshness_check`; `orphaned_author_task_id` on `action_rejected_stale`; `late_result_recorded` with `superseded_by`; `RUN_INTERRUPTED` on restart recovery.

**Store files.** Mock: `app/data/store.json`. Live: `app/data/runs/store-live.json` (gitignored), so flipping `MOCK_MODE` never overwrites the other ledger. `KEEL_STORE_PATH` overrides either. New persisted keys: `gate_decisions` (quarantine by file version), `processing` (human-response stages for resume), `approved_drafts`.

**Round 4 (Codex verification).** These were added in round 4:
- 409 `TASK_FINDING_MISMATCH`: the named finding is not the one the open task answers.
- 503 `PACKAGE_BUSY`: the package lock was not acquired within `KEEL_LOCK_TIMEOUT_MS` (default 60000).
- `RUN_TIMEOUT` on runs that pass `KEEL_TRANSACTION_TIMEOUT_MS` (default 240000). The abort signal is passed to Box calls and as an optional fourth `evaluate()` argument.
- `KEEL_EXTRA_REVIEWER_LOGINS`: additional live reviewers, by login.
- Submit scenario `"none"` (mock): evaluate the mock Box as it stands.
- `return_to_author` without `author_message` waits for `approve_author_draft` in mock mode too.

**Env vars.** `KEEL_POLL_INTERVAL_MS` (default 5000; live only; the poller starts lazily on the first `/api/package`; 0 disables). Gate threshold: `DECIDER_INJECTION_THRESHOLD` (preferred), else `KEEL_GATE_INJECTION_THRESHOLD`, default 0.5; `config.ts` is the single source and passes it to `DeciderGate`. Identities: `KEEL_REVIEWER_BOX_USER_ID` and `KEEL_AUTHOR_BOX_USER_ID`; when unset in live mode, tasks are assigned by login.

## Round 5 (UI v4: the Box page, the owl, one panel)

Additive only. Design: `docs/research/50-ui-v4-box-owl.md`. All strings below are computed by the engine and
pass the banned-word filter; the UI renders them and never composes a label, count or sentence.

**New route.** `POST /api/upload-version { file_name, file_id?, scenario?, content_base64? }` returns `SubmitResponse` (202).
- Mock: the same as `POST /api/submit { scenario: scenario ?? "architecture_v3" }`. A second v3 upload returns 409 `ALREADY_SUBMITTED`.
- Live: uploads `content_base64` as a new version of `file_name` in `BOX_FOLDER_ID` through `src/lib/box/upload.ts`, then submits.
  Without `content_base64`, `architecture.md` uploads the fixture v3 text, which is the demo beat. Any other file uploads nothing and only submits.
- Errors: 400 `FILE_NAME_REQUIRED`, 400 `BAD_SCENARIO`, 400 `BAD_CONTENT`, 409 `RUN_ACTIVE`, 502 `UPLOAD_FAILED`.
- Client: `api.uploadVersion(body)` in `src/lib/client.ts`.
- `scripts/upload-v3.ts` keeps its CLI and its `uploadV3` export. It now wraps `uploadNewVersion` from `src/lib/box/upload.ts`.

**PackageView.**
- `files?: PackageFile[]` lists the current snapshot's files in snapshot order. Each entry has `file_id`, `file_name`, `version_id` and `version_label`.
  It also has `updated_at` (version createdAt), `size_bytes` and `uploader`. Size comes from the Box folder items in live mode and from the pinned text's UTF-8 byte length in mock mode.
  `control_ids` lists the controls whose current binding is on this file. A not-evaluated control is listed under the file its evaluation event names.
  `open_decisions` and `recorded_decisions` count those rows.
- `open_decisions?: number` counts rows that need a human, for the owl badge. It is 0 while the snapshot is pending.
  A row counts when its kind is `needs_review_*`, `acknowledge`, `pending_review` or `not_evaluated` and no decision is recorded on the snapshot.
  An `acknowledge` row stops counting once a human acknowledgment is recorded, even though its label does not change.
- `decision_summary?: string` is at most 12 words:
  - pending: "Re-checking 8 controls on S4…"
  - quarantine: "I did not read runbook.md v3. It carried instructions."
  - open decisions: "1 Critical needs your decision. 2 more to look at." The most severe open severity is named first.
  - not evaluated only: "1 control was not evaluated. It needs you."
  - all recorded: "All 8 recorded on S4."
  - baseline: "8 verifications hold."
  - error: "The check on S4 stopped. Nothing was decided."

**TraceStep.bubble?: string** is at most 12 words. It comes from `bubbleFor(step)` in `src/lib/engine/bubble.ts` and is computed from the step's kind and its detail, label, args and result.
- It is set at emit time in the pipeline and in the service's `onStep`.
- It is added again on read by `getRun`, which feeds `/api/run/[id]` and its SSE stream. Runs recorded before Round 5 therefore replay with bubbles.
- Box AI substeps get "Asking Box AI across 4 files…". These are `kind: "tool_call"` with `tool: "box_ai_ask"`, `tool: "string_search"` or `args.agent_tool: "search_snapshot"`.

**DisplayedStatus.short?: string** is at most 10 words. It comes from `shortStatus()` in `display.ts`, is set by `displayStatus`, and is added on read to recorded run outcome rows.
Examples: "Key-management evidence missing", "Same sentence, now in runbook.md", "Section changed, quote unchanged", "Verified sentence unchanged", "Input quarantined".

**FindingCard.**
- `verdict_line?: string` comes from `verdictLine()` in `card.ts`. It describes the machine evidence, not the disposition.
  - Weakened or absent: "4 of 5 clauses unsupported in every file of this snapshot. Box AI found 0 citations across the other 4 files."
  - Moved: "The same sentence is now in runbook.md v2 §3."
  - Acknowledge (section changed): "The section around the verified sentence was rewritten. The sentence is unchanged."
  - Holds: "The verified sentence is unchanged."
  - Not evaluated: "Not evaluated: file unreadable on S4. No clause was checked."
- `receipt?: FindingReceipt | null`, where `FindingReceipt` is `{ line1, line2, line3, event_ids, tone: "green" | "blue" | "grey" }`. It comes from `receiptFor()` in `src/lib/engine/summary.ts`.
  It is null until a human decision is recorded on the current snapshot.
  - Verified (green): "Verified by Dana Okafor" / "on runbook.md v2 §3 · snapshot S4" / "Box task 77120932 approved · 16:45Z"
  - Returned (blue): "Returned to author by Dana Okafor" / "Box task 77120934 for J. Park (Eng) · due Oct 23" / "on architecture.md v3 · snapshot S4"
  - Acknowledged (blue): "Acknowledged by Dana Okafor" / "on architecture.md v3 §4.2 · snapshot S4" / "Box task 77120933 completed · 16:45Z"
  - `event_ids` are listed newest first. They are the disposition or acknowledgment event, the author `box_task_created` event (returns only), the `box_task_response_ingested` event, and the `control_evaluated` event.

**Round 5 follow-ups.**
- `ControlRow.needs_decision?` and `ControlRow.decision_recorded?` are booleans, computed by `decisionFlags()` in `summary.ts`. An acknowledgment sets `decision_recorded` without changing the label.
- `Trace.outcome.open_decisions?`, `Trace.outcome.decision_summary?` and `Trace.outcome.files?: PackageFile[]` are written when the outcome is recorded. Older runs get them on read, from the recorded rows and `outcome.snapshot`.
- `POST /api/upload-version` accepts the same `scenario` values as `POST /api/submit`.

**Round 5 engine decision (judge A1): an acknowledgment ends rule 11.** Spec v3.4 defines rule 11 for a verification whose materiality requires an acknowledgment. It does not say what the row displays once that acknowledgment is recorded. Keel decides it here, additively.
- **When it applies.** A human `acknowledgment_recorded` event exists for the control on the current snapshot. It must answer the current evaluation's finding, so it is on the current binding, and no disposition may be newer. The Confirm-finding fallback (`fallback: "confirm_finding"`) does not count.
- **What the row shows.** Rule 11 no longer fires, and the row reads rule 10, "Verified, holds": tone teal, `projection_code` VERIFIED_HOLDS.
  The secondary line still names the original review. `detail` reads "Acknowledged by Dana Okafor, <utc>" and `short` reads "Acknowledged by Dana Okafor".
- **Engine plumbing.** `DisplayInputs.acknowledgment?: { actor, role, at }` is added, and `ControlState.acknowledgment_event` is added on the internal state.
- **Box metadata.** An acknowledgment reprojects folder metadata. `keel_last_human_review` now takes the latest human disposition or non-fallback acknowledgment, encoded as `name|role|controlId|snapshotId|utc`.
- **Unchanged.** The Confirm-finding fallback leaves a Needs review row as Needs review. A re-evaluation, such as a new snapshot, starts without the acknowledgment.
- **Count line.** After the demo's three actions (return 07, verify 22, acknowledge 05) it reads "8 controls on snapshot S4: 6 Verified holds, 1 Verified, 1 Returned to author". The fixture's `expected_count_line_after` is still the line after the first two actions, "… 5 Verified holds, 1 Acknowledge (High), 1 Verified, 1 Returned to author".
- `needs_decision` and `decision_recorded` behave as before. The acknowledgment receipt stays blue.

**Round 5, Codex round (`app/.review/v4/codex-ui-review.md`).** All additive.

*Upload route.*
- **Raw bytes (Codex 1).** `content_base64` is decoded to a Buffer and passed unchanged through `uploadNewVersion` and `RealBoxAdapter.uploadFileVersion(fileId, name, content: string | Buffer, note?)`, with no string round trip.
  The identical-content check compares raw hashes: Box's sha1 of the current version when known, else the sha256 of the downloaded bytes.
- **Admission (Codex 2).** The active-run check, any Box upload, and the run's start up to snapshot capture are serialized under the lock key `admission:<folderId>`. This is a different key from the pipeline's package lock, so the two cannot deadlock.
  `POST /api/submit` and `POST /api/upload-version` share this guard. A concurrent second request gets 409 `RUN_ACTIVE` or, in mock mode, `ALREADY_SUBMITTED`. The current version is re-read inside the guard.
- **Target file (Codex 12).** A supplied or mapped file id is used only if Box reports both the package folder as parent and the exact `file_name`. A mismatched supplied id gets 409 `FILE_ID_NAME_MISMATCH`, and a mismatched map entry is dropped and the file resolved by name. Other target errors are 409 `FILE_NOT_FOUND` and `FILE_OUTSIDE_FOLDER`.
- **Validation (Codex 13).** `src/lib/upload-request.ts` defines a strict zod schema; unknown keys are 400 `BAD_REQUEST`.
  - `file_name` is a plain name of 1 to 255 characters, with no path separators.
  - `file_id` must look like a Box id.
  - `scenario` must be one of the submit scenarios.
  - `content_base64` must be strict base64, encoding at most `KEEL_UPLOAD_MAX_BYTES` decoded bytes (default 10 MiB). An empty decoded file needs `allow_empty: true`.
  - The body is limited to the encoded limit plus 16 KiB, else 413 `PAYLOAD_TOO_LARGE`.
- **Partial success (Codex 14).** Once Box holds the new version, the review starts even when the version note or `box-map.json` failed. The response carries `upload: { uploaded, fileId, versionId? }` and `warnings: [{ code, message }]`, with codes `VERSION_NOTE_FAILED`, `MAP_SAVE_FAILED` and `MAP_READ_FAILED`.

*Wording.*
- **Short line (Codex 17).** `shortStatus()` output passes the banned-word filter. An offending interpolated name falls back to "Open the control for details".
- **Verdict coverage (Codex 22).** `verdict_line` says "in every file of this snapshot" only when every pinned file was read, none were withheld, and the control's search covered all files except the primary one.
  Otherwise it reads, for example: "4 of 5 clauses unsupported in the files checked: architecture.md and runbook.md. vendor-contract-summary.md was not read. Box AI found 0 citations across the other 2 files."
- **Outcome backfill (Codex 23).** The read-time backfill of a recorded outcome honours the row flags `needs_decision` and `decision_recorded`, and never consults the live ledger.

*Display strings (Codex 15, 16, 18).* The UI renders these and composes none of them.

| Field | Examples |
| --- | --- |
| `PackageView.header_line` | "8 verifications hold" (baseline, no run on the snapshot) / "Re-checking 8 controls…" / "Re-checked 8 controls" / "Re-checked 6 controls · 2 not evaluated" |
| `PackageView.holds_line` | "5 verifications hold". It counts rule-10 rows with no decision recorded, and is absent when there are none. |
| `PackageView.changed_files` | `["architecture.md"]`. Names whose version differs from the prior snapshot's manifest; new and removed files are included. |
| `PackageView.changed_line` | "architecture.md v3 · snapshot S4". It is "snapshot S1" when there is no prior snapshot. |
| `PackageView.pending_status` | The rule-1 `DisplayedStatus` `{ rule: 1, kind: "pending_recheck", label: "Re-check pending", projection_code: "PENDING", tone: "grey", short: "Re-checking against the new snapshot" }`. The UI applies it to rows during a run or replay. |
| `PackageFile.hover_line` | "Keel: 2 controls need your decision" / "Keel: 1 control needs your decision" / "Keel: every decision recorded". Absent when the file has no open or recorded decision. |
| `FindingCard.quote_pair_note` | Set only when the "now" quote is null. "No sentence in the current snapshot supports this control." is used only for evidence_absent. |
| `Trace.outcome.header_line`, `holds_line`, `changed_files`, `changed_line` | The same strings for the recorded rows. Older runs are backfilled on read. |

The other `quote_pair_note` strings are:
- "The current file was withheld by the input gate, so no sentence was checked."
- "The current file could not be read, so no sentence was checked."
- "This control was not evaluated on this snapshot, so no sentence was checked."
- "The re-check is still running; no current sentence yet."
- "No current sentence is bound to this control."

## Round 6 (UI v4.1: rule source, dashboard, timeline, agreed/changed, file text)

Design: `docs/research/51-ui-v4-1-team-review.md`, section "API additions". All additive, and every string passes the wording filter.

**Profile fixture** (`demo-data/lantern/profile-us-bank.json`). Every control gains `rule_name`, at most 5 words, and `source: { origin, set_by, reference?, note? }`. Both are listed in `fields`, and neither is handed to the model.
- `origin` values: `team_standard` (set up by "Security Architecture (ARB)"), `learned_from_reviews` (SEC-ARCH-01, "ARB review history 2024–2026"), and `international_standard` (SEC-ARCH-17, reference "ISO/IEC 27001:2022 A.8.15"). The data is synthetic.

**ControlRow.**
- `rule_name?: string` comes from the profile and falls back to the title, capped at 5 words. Example: "Encryption and key management".
- `rule_source?: RuleSource` is built in `engine/rule-source.ts`:
  - `standard`: "IS-STD-014 Cryptography v4.2"
  - `clause`: "§5.1"
  - `chip`: "IS-STD-014 §5.1"
  - `origin`: `"team_standard"`
  - `origin_label`: "Bank standard", "International standard" or "Learned from reviews"
  - `set_by`: "Security Architecture (ARB)"
  - `reference?`, `note?`, `profile_version`: "2026.3"
  - `framework_map?`: e.g. ["NIST CSF 2.0 PR.DS-01", "ISO 27001:2022 A.8.24", …]
  - `framework_map_status`: "illustrative; not reviewed by a compliance owner"
  `standard` and `clause` are parsed from the profile's `standard` string. These fields also appear on card rows and recorded outcome rows.

**PackageView.**
- `dashboard: { tiles: DashboardTile[] }`. Each tile is `{ key: "hold" | "need_you" | "recorded", label: "Hold" | "Need you" | "Recorded", value, tone }`, computed from displayed outcomes and decision flags.
  - Hold counts rule-10 rows with no decision recorded.
  - Need you equals `open_decisions`.
  - Recorded counts rows with `decision_recorded`.
  - Tones are teal, amber and blue, and grey when the value is 0.
  - Values: S3 is 8/0/0, after the run 5/3/0, after the three actions 5/0/3.
- `timeline: TimelinePoint[]` has one point per snapshot. A point is `{ snapshot_id, at (captured_at), label, detail, tone, changed_files, current }`.
  - `label` is at most 4 words, not counting "·" and bare numbers. `detail` is at most 12 words.
  - Demo values: S1 "baseline" (grey); S2 "8 verified" (blue); S3 "runbook v2 · holds" (teal); S4 "architecture v3 · 3 need you" (amber), which becomes "architecture v3 · recorded" (blue) after the actions.
  - S4 detail: "architecture.md v3 changed. 3 need your decision."

**FindingCard.**
- `timeline: TimelinePoint[]` covers this control. SEC-ARCH-07 reads "needs review" → "verified by Priya" → "holds" → "architecture v3 · needs review", which becomes "returned to author" after the return.
  - Point tone follows the row's status tone. A Verified on an earlier snapshot is blue; green appears only on the current snapshot.
- `agreed: { quote, file, file_id, version_id, version_label?, section?, verified_by?, verified_at?, byline } | null`. The byline reads "Verified by Priya Natarajan · v2 §4.3 · Oct 8".
- `changed: { kind, heading, quote?, file, file_id, version_label?, version_id, section? } | null`. The headings are:
  - `replaced`: "Changed in architecture.md v3 §4.3"
  - `moved`: "Now in runbook.md v2 §3"
  - `section_changed`: "Section changed around it · v3 §4.2", with the unchanged sentence
  - `none`: "Not checked in runbook.md v3", for a control not evaluated; it has no quote
  It is null for a hold or while pending.
- `open_in_document?: { file_id, version_id, sentence? }` targets the changed sentence. Failing that it targets the current binding, then the agreed sentence.

**New route.** `GET /api/file-text?file_id=&version_id=` returns `{ file_id, version_id, version_label?, file_name, text, snapshot_ids }`.
- It serves the pinned text of a version some snapshot pinned: from the store, else a live read of that exact version through the adapter, checked against the pinned content hash.
- A version no snapshot pinned gets 404 `NOT_FOUND`. Missing parameters get 400. The route is read-only.
