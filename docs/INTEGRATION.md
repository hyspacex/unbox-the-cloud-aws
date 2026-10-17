# Integration runbook: mock to live in five minutes

Mock mode (`MOCK_MODE=true`) needs nothing below. This page is for the integration laptop only.
Never commit `app/.env.local`.

For the merged desktop and authenticated upload path, start with
[DEMO-RELEASE.md](DEMO-RELEASE.md). The application now requires sign-in at
`/connect` before reading the project or invoking its API.

### User sign-in and server evaluation are separate

- `BOX_OAUTH_CLIENT_ID` and `BOX_OAUTH_CLIENT_SECRET`: an OAuth Box app for
  individual users. Register `KEEL_BASE_URL/api/auth/box/callback`.
- `KEEL_BASE_URL`: exact HTTPS origin in live mode; loopback HTTP is for local
  mock use only. `KEEL_PROJECT_ID` defaults to `lantern`.
- Keep `BOX_DEVELOPER_TOKEN` or CCG credentials on the server for background
  snapshot, AI and task operations. An OAuth user token uploads with that
  user's folder access; it is never sent to the widget.
- OAuth and CCG can be different Box apps. A client ID is not an access token.
- User sessions are memory-only for this single-server demo. Restart or sign-out
  revokes the associated desktop grant; reconnect with a new one-time link.

## 1. Env vars (`app/.env.local`, copy from `app/.env.example`)

| Var | Needed for | Notes |
| --- | --- | --- |
| `MOCK_MODE=false` | everything live | The app swaps in `RealBoxAdapter`, `BedrockEvaluator`, `DeciderGate` |
| `BOX_DEVELOPER_TOKEN` | Box, quick path | Developer Console, app, Configuration, Generate Developer Token. Lasts **60 minutes** |
| `BOX_CLIENT_ID`, `BOX_CLIENT_SECRET`, `BOX_ENTERPRISE_ID` | Box, demo path | Client credentials grant as the app's service account. Used when no developer token is set |
| `BOX_SUBJECT_USER_ID` | optional | Adds the `As-User` header. Needs the "Make API calls using the as-user header" scope |
| `BOX_FOLDER_ID` | Box | Package folder id, the number in `app.box.com/folder/<id>` |
| `BOX_METADATA_TEMPLATE_KEY=keelReview`, `BOX_METADATA_SCOPE=enterprise` | metadata | Template is created by the gate with `--write` |
| `KEEL_REVIEWER_LOGIN`, `KEEL_AUTHOR_LOGIN` | tasks | Must be real Box users in the enterprise. The reviewer is a different person from the service account |
| `AWS_PROFILE` or `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_SESSION_TOKEN` | Bedrock | Default AWS chain. `AWS_REGION=us-east-1` |
| `KEEL_INFERENCE_PROFILE=us.anthropic.claude-sonnet-4-6` | Bedrock | Sent as `modelId`. `KEEL_MODEL_ID` and `KEEL_MRM_MODEL_ID` are only recorded |
| `KEEL_EVAL_TIMEOUT_MS=180000`, `KEEL_MAX_TOKENS=16000`, `KEEL_MAX_TURNS=24` | optional | Evaluator bounds |
| `BOX_REQUEST_TIMEOUT_MS=20000` | Box | Deadline for every Box request, including downloads and Box AI. Expiry is `BOX_TIMEOUT`. Box AI then falls back to string search |
| `BOX_VERSION_HISTORY` | optional | Unset: a version-history failure is an error. `current-only` accepts a single current version, labelled `current`, on free plans |
| `DECIDER_URL=http://127.0.0.1:8099` | Decider | Empty means the gate step is omitted from the trace |
| `DECIDER_INJECTION_THRESHOLD=0.5` | Decider | A P(injection) at or above this quarantines the file. The engine reads the same variable |
| `DECIDER_QUESTION_RESERVE_TOKENS=700` | optional | Tokens of the Decider window kept for the questions when sizing chunks |

## 2. Box app setup (Developer Console and Admin Console)

1. Create a Custom App with Server Authentication (Client Credentials Grant).
2. Set App Access Level to App + Enterprise Access.
3. Enable these Application Scopes:
   - Read all files and folders.
   - Write all files and folders (uploads, tasks, comments, folder metadata).
   - Manage enterprise properties (creates the metadata template).
   - Manage AI (Box AI ask and text generation).
4. An enterprise admin authorizes the app. Go to Admin Console, Integrations, Platform Apps Manager, and add the Client ID. Re-authorize after any scope change.
5. Box AI must be enabled for platform apps in Admin Console, Box AI settings, and the enterprise needs AI units.
6. **Folder access.** The service account only sees folders it owns or collaborates on. Invite the service account's login, shown by the gate's "Box current user" row, as Editor on `BOX_FOLDER_ID`. Alternatively, let `seed-box-folder.ts` upload into a folder the service account owns.
7. Invite the reviewer and the author to the folder, so they can open the files their tasks are on.
8. Version history needs a paid Box plan. On a free account the gate prints FAIL on "prior versions retained". In that case, capture the local baseline. This is spec section 13, row 1.

## 3. Order of operations (from `app/`)

```
npx tsx scripts/integration-gate.ts            # read-only; every row PASS/FAIL/SKIP with the reason
npx tsx scripts/seed-box-folder.ts --write     # five files, architecture.md and runbook.md with v1 and v2; writes data/box-map.json
npx tsx scripts/integration-gate.ts --write    # creates the keelReview template, metadata write/read-back, task round trip
npx tsx scripts/decider-smoke.ts               # with DECIDER_URL set; clean v3 vs injected copy
npm run dev                                    # MOCK_MODE=false
npx tsx scripts/upload-v3.ts --write           # the 0:40 beat: architecture.md v3, note "Section 4 rewrite for clarity"
```

Decider 2B runs locally on Apple silicon:

```
pip install strands-decider
strands-decider serve StrandsAgents/strands-decider-2B-qwen3.5-v1-2610 --device mlx --port 8099
```

The first request at a new input length compiles shapes. Run `decider-smoke.ts` once before the demo to warm it. The smoke test exits 1 unless the clean v3 is accepted and the injected copy is quarantined.

**Metadata probe.** The gate's `--write` metadata probe restores the folder's exact prior state:
- If it created the instance, it deletes it.
- If `keel_snapshot_id` was absent, it removes the field again.
- If the field had a value, it rewrites that value.

It reads the result back and prints FAIL if the restore did not take. The template check validates field types and all twelve enum codes. With `--write`, it adds missing codes with `addEnumOption`.

**Task identity check (spec 3 step 11).** Run the gate with `--write`. It creates a probe task, assigns it to `KEEL_REVIEWER_LOGIN`, and checks two things before deleting it:
- Box resolves the assignee to that login, compared case-insensitively. Live authorization compares logins the same way, unless `KEEL_REVIEWER_BOX_USER_ID` is set.
- `findTaskByMessage` finds the same task. The engine uses that lookup to reconcile an ambiguous task creation instead of creating a duplicate.

Either mismatch is a FAIL. Then have the reviewer approve one real task in Box while logged in as themselves. Confirm the assignment's `assigned_to` is the reviewer, not the service account. If it is not, label the human step simulated.

## 4. Fixture ids to Box ids: `app/data/box-map.json`

`seed-box-folder.ts` writes it, and `upload-v3.ts` adds the v3 entry.

**Seeding is resumable and verified.**
- Every Box version is downloaded and hashed. A version gets a fixture version id only when its SHA-256 equals the fixture file's. Nothing is mapped by position.
- If a file's current version is fixture version k, the seed uploads the remaining versions after k. A rerun after an interruption picks up where it stopped.
- If the current version matches no fixture version, nothing is uploaded over it. The problem is printed and the script exits 1.
- Box versions with no fixture match are listed under `unmatched`.
- The map is checkpointed after every verified upload, and only for the current `BOX_FOLDER_ID`. A map for another folder is ignored.

**The v3 upload is folder-checked.** `upload-v3.ts` ignores a map written for another folder. It uses a mapped file id only after Box confirms the file's parent is `BOX_FOLDER_ID`; otherwise it looks the file up by name in that folder. It refuses to upload if the current version already equals v3.

Shape (type `BoxMap` in `app/src/lib/box/real.ts`):

```json
{ "folderId": "…", "created_at": "…",
  "files": { "architecture.md": { "fixtureFileId": "1650233401", "fileId": "<box>",
             "versions": { "1801102231": "<box v1>", "1801102232": "<box v2>", "1801102233": "<box v3>" },
             "labels":   { "v1": "<box v1>", "v2": "<box v2>", "v3": "<box v3>" } } } }
```

The engine uses it to map the fixture's seed ledger, snapshots S1 to S3 and prior verifications onto tenant ids. Versions are mapped by upload order, oldest first. Box has no version comment field. The scripts post a file comment `Version note: <text>` right after a version upload. `RealBoxAdapter.listFileVersions` reads that comment back as the version's `comment`.

## 5. What the trace says under each fallback

| Situation | Trace label | Code |
| --- | --- | --- |
| Box AI ask works | `Box AI ask over 4 files, 1 cited statement in runbook.md` | `search-tool.ts` |
| Citation not in the pinned text | `… 0 cited statements`. The passage is listed under `result.unvalidated` | acceptance 20 |
| Current Box version differs from the snapshot | `… (current version ≠ snapshot; result not relied on for <file>)` | `search-tool.ts` |
| Box AI unavailable (no AI units, 403/404/429) | `string search over 4 files (Box AI unavailable), M statements`, `fallback: true` | `search-tool.ts` |
| Decider not configured or not answering `/health` in 1 s | Step omitted. `DeciderGate.lastOmissionReason` gives the reason for "omitted: …" | `decider.ts` |
| Decider coverage incomplete and no injection seen | Step omitted: `omitted: incomplete coverage (k of n chunks checked): <reason>`. Causes: no `max_length`, no `usage`, or a failed request | `decider.ts` |
| Decider sees P(injection) at or above the threshold | Quarantined at once. A later failure cannot undo it. The result carries `coverage` | `decider.ts` |
| Box AI answered but a file's current version could not be confirmed | `string search over N files (Box AI result not used: current version unconfirmed), M statements` | `search-tool.ts` |
| A citation's version is not the pinned version | Rejected: `cited version X is not the pinned version Y` | `search-tool.ts` and engine |
| A Box request exceeds `BOX_REQUEST_TIMEOUT_MS` or the agent cancels | `BOX_TIMEOUT`. Box AI search falls back to string search | `real.ts` |
| PDF or Office file whose pinned version is not current | `TEXT_REPRESENTATION_CURRENT_ONLY`. Box extracts text only for the current version | `real.ts` |
| A new version lands while text is being extracted | `VERSION_CHANGED_DURING_EXTRACTION` | `real.ts` |
| Existing template has a wrong field type | Gate prints FAIL with `TEMPLATE_INCOMPATIBLE`. Delete the template or set `BOX_METADATA_TEMPLATE_KEY` | `real.ts` |
| Decider answers | `injection: no (0.03) · material change: evaluate now (0.91) · 118 ms, local` | `gateLabel()` |
| Bedrock credentials, access or model id wrong | `evaluation_error` with code `BEDROCK_CREDENTIALS`, `BEDROCK_ACCESS_DENIED`, `BEDROCK_MODEL_NOT_FOUND`, `BEDROCK_THROTTLED`, `STRUCTURED_OUTPUT_INVALID` or `EVALUATION_TIMEOUT` | `evaluator.ts` |
| Box text representation still processing (binary files) | `TEXT_REPRESENTATION_NOT_READY` | `real.ts` |
| Box AI text gen unavailable | The author message falls back to the template, `drafted_by: "template"` | engine |

## 6. Assumed or verified external contracts

- **Strands Decider 2B.** Verified against the public source of strands-labs/strands-decider. The schema is in `src/strands_decider/schema.py` and the routes are in `server.py`.
  - `GET /health` returns `{status, model, checkpoint, base_model, max_length, device, …}`.
  - `POST /v1/systemone` takes `{state, model, questions: {name: {type: "noul"|"choice", instructions, criteria}}}`.
  - A noul answer is `{type:"noul", noul: P(true)}`. A choice answer is `{type:"choice", choice, probabilities, confidence}`. The response also carries `latency_ms`.
  - The server silently truncates a state longer than its window (`max_length` from `/health`, 4,096 tokens for the published checkpoints).
  - The gate sizes chunks from the reported window and checks each response's `usage.input_tokens`. A chunk that filled the window is split and asked again.
  - Without `max_length` or `usage`, coverage cannot be shown. The gate then quarantines if it found an injection, and otherwise omits the step. It never reports a partial pass.
  - `@strands-agents/sdk` 1.21 has a `DecisionModel` base class, in `dist/src/decisions/decision-model.d.ts:12`. It has no Decider transport, and its result has no per-option probabilities, so the gate calls HTTP directly.
- **Strands structured output with tools.** One run handles both. `agent.invoke(prompt, { structuredOutputSchema })` registers `strands_structured_output` next to the read tools; see `dist/src/agent/agent.js:1050`. If the model replies in plain text, the next cycle is forced onto that tool; see `agent.js:1162`. This is verified offline in `app/test/integration-shape.test.ts` with a scripted Strands `Model`.
- **ESM.** `@strands-agents/sdk` is ESM-only, and `@modelcontextprotocol/ext-tasks` exports under `import` only. `evaluator.ts` therefore loads Strands with `import()`, so `tsx` scripts work. In Next.js, list `box-typescript-sdk-gen` and `@strands-agents/sdk` in `serverExternalPackages` if bundling complains.

## 7. Five-minute checklist before the 2pm presentation

1. Box auth must not run on a developer token, which expires 60 minutes after it is generated. Use the client credentials grant.
2. Run `integration-gate.ts` and read every FAIL. If Box AI fails, the string-search label is the plan. If Decider fails, show the gate on the proposed slide.
3. Check the folder state with `integration-gate.ts`. It must be the S3 baseline: architecture.md v2 is current and v3 is not uploaded yet. Upload v3 only on stage, with `upload-v3.ts --write`.
4. Warm Decider and Bedrock once with `decider-smoke.ts` and `integration-gate.ts`. Note the measured latencies for the "measured" slide.
5. Have the safety net ready. If anything misbehaves 30 minutes before the demo, set `MOCK_MODE=true` and restart `npm run dev`. The mock path runs the same engine.
6. Store path migration: live mode now defaults to `app/data/runs/store-live.json`, and mock keeps `app/data/store.json`. A live ledger written under the former `app/data/store.json` is not migrated. Move it with `mv app/data/store.json app/data/runs/store-live.json`, or set `KEEL_STORE_PATH`; a store whose mode does not match fails closed with `STORE_UNREADABLE`.
