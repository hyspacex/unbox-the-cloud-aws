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

**Ledger fields added.** `wording_filter` (machine text withheld by the banned-word filter); `removed: true` on `file_version_observed`; `attempt` N on retries of the same `evaluation_id`; `client_snapshot_id` in `freshness_check`; `orphaned_author_task_id` on `action_rejected_stale`; `late_result_recorded` with `superseded_by`; `RUN_INTERRUPTED` on restart recovery.

**Store files.** Mock: `app/data/store.json`. Live: `app/data/runs/store-live.json` (gitignored), so flipping `MOCK_MODE` never overwrites the other ledger. `KEEL_STORE_PATH` overrides either. New persisted keys: `gate_decisions` (quarantine by file version), `processing` (human-response stages for resume), `approved_drafts`.

**Env vars.** `KEEL_POLL_INTERVAL_MS` (default 5000; live only; the poller starts lazily on the first `/api/package`; 0 disables). Gate threshold: `DECIDER_INJECTION_THRESHOLD` (preferred), else `KEEL_GATE_INJECTION_THRESHOLD`, default 0.5; `config.ts` is the single source and passes it to `DeciderGate`. Identities: `KEEL_REVIEWER_BOX_USER_ID` and `KEEL_AUTHOR_BOX_USER_ID`; when unset in live mode, tasks are assigned by login.
