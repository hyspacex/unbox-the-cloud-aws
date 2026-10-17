# Keel v1: local-first design

Status: built on the `feature/local-folder-checks-v1` branch. It runs locally, with stand-ins for Box and AWS. Box and AWS facts below were checked against their public documentation on 2026-10-17.

## 1. What we are building

Keel is CI for Box folders.

- **Rules.** A folder carries plain-language rules in `keel-rules.md`, and can also pin versioned rule packs.
- **Runs.** Every file added, changed, moved or deleted in the folder triggers a run.
- **Verdicts.** Each rule passes or fails, with a reason and verbatim citations. If Keel cannot evaluate a rule, it says **Couldn't evaluate** instead.
- **Notifications.** When a check stops passing, Keel creates a Box task for the person whose upload caused it.
- **Status.** The folder's overall status is written to Box metadata.

Decisions made with the team:

| Decision | Choice |
| --- | --- |
| Who decides pass or fail | The machine only. There is no human override in v1. |
| Kind of check | Agent runs that check the thinking is stated and consistent, not proof of what was built. |
| Trigger | Box webhook → Lambda Function URL, plus a manual **Run checks** button and scheduled reconciliation. |
| Where rules live | `keel-rules.md` inside the Box folder, like `.github/workflows`. |
| Notification | A Box task to the uploader of the version that broke a rule, plus folder metadata. |
| Interfaces | The Keel web app and Box. No desktop HUD in v1. |
| Rule packs | A minimal catalog, installed with `uses: <pack>@<version>`. |
| Pull-request-style extras (agent review comments, rule owners, publish gate) | Roadmap only. |
| First iteration | No external connectors. Local stand-ins behave like Box and AWS. |
| Judge | Behind an interface: an offline deterministic judge, or Bedrock via an environment variable. |
| Stack | Next.js (TypeScript) web app plus a Python runner, sharing local SQLite. |

Assumptions made without asking:

- **Name.** The product keeps the name **Keel**.
- **Stand-in placement.** Fake Box is served by the same Next.js app as Keel's UI. It has its own SQLite file (`fakebox.db`) and is reachable only through a Box-shaped HTTP API. Keel's runner talks to it exactly as it would talk to `api.box.com`.
- **Storage.** There are two SQLite files: `fakebox.db` is owned by Fake Box, and `keel.db` is owned by the runner. The web app only reads `keel.db`. This keeps the Box and AWS sides apart, as they will be in production.
- **Demo data.** The demo folder and identities are synthetic (Meridian Trust Bank, Project Lantern).
- **Task action.** Tasks use `action: complete`, because Keel asks the author to fix something, not to approve something.

## 2. Ports and adapters

| Port | Local adapter | Production adapter (planned) |
| --- | --- | --- |
| Box API (`BoxClient`) | HTTP client → Fake Box (`KEEL_BOX_API_BASE`) | Same client → `https://api.box.com/2.0`, `https://upload.box.com/api/2.0`, Client Credentials Grant token |
| Webhook ingress | `webhook.handler(event)` behind a local HTTP server | The same handler behind a Lambda Function URL (`AuthType NONE` with signature checking) |
| Queue | `FifoQueue` (SQLite) | SQS FIFO, `MessageGroupId = folder id`, `MessageDeduplicationId = webhook body id` |
| Run worker | Local thread → `runner.handler(SQS event)` | Lambda with an SQS event source and partial batch responses |
| Store | `Store` (SQLite single table, `pk`/`sk`) | DynamoDB single table with the same keys |
| Scheduler | Reconciler thread | EventBridge Scheduler → `SendMessage` |
| Judge | `OfflineJudge` | `BedrockJudge`: a Strands agent with structured output (built, not exercised) |
| Pack catalog | `packs/` on disk | S3 (immutable versioned objects), or an org-private Box folder |
| Identity | Cookie user switcher | Box OAuth for users; a CCG service account for the runner |

The run logic in `runner.py`, `rules.py`, `validate.py` and the judges does not change when the adapters do.

## 3. Constraints the stand-ins enforce

Each line below is enforced by the local stand-in. That keeps the user experience we refine possible on the real platform.

### Box

**Webhooks** ([v2 guide](https://developer.box.com/guides/webhooks/v2/), [triggers](https://developer.box.com/guides/webhooks/triggers/), [signatures](https://developer.box.com/guides/webhooks/v2/signatures-v2/), [limitations](https://developer.box.com/guides/webhooks/v2/limitations-v2/))

- **Targets.** A webhook targets a file or a folder, never the root folder (`0`). Folder webhooks cascade to sub-folders.
- **Triggers.** `FILE.UPLOADED` is valid on folders only.
- **Payload.** It contains metadata only, never file content. The receiver must call back to Box to read the file.
- **Signatures.** HMAC-SHA256 with the key over the body bytes, then the timestamp bytes, base64-encoded.
  - Primary and secondary keys; accept a match with either.
  - Reject timestamps older than 10 minutes.
- **Delivery.**
  - The endpoint must respond within 30 seconds.
  - Box retries up to 5 times.
  - `BOX-DELIVERY-ID` changes on every retry, so we deduplicate on the body `id`.
  - Ordering is undocumented, so we treat delivery as unordered.
- **Limits.** One webhook per item, per app, per user.
- **New versions.** Whether a new version fires `FILE.UPLOADED` is **not documented**.
  - Fake Box fires it, and this can be switched off with `FAKEBOX_FIRE_ON_NEW_VERSION=false`.
  - Keel never depends on it: every run compares `file_version.id` values, and the reconciler catches anything missed.

**Files and versions** ([versions](https://developer.box.com/reference/get-files-id-versions/), [download](https://developer.box.com/reference/get-files-id-content.md))

- IDs are strings that look numeric.
- `GET /files/{id}/versions` lists only *past* versions. The current version comes from `GET /files/{id}`.
- A download returns `302` to a short-lived URL, or `202` with `Retry-After` while the file is not ready. The client handles both.
- A duplicate name on upload returns `409 item_name_in_use`. The Fake Box UI then uploads a new version, as Box's web app does.
- Version history depends on the Box plan, so Keel records its own snapshot (version ID and SHA-1) for every run.

**Metadata** ([templates](https://developer.box.com/guides/metadata/templates/index.md), [update](https://developer.box.com/guides/metadata/instances/update.md))

- Apps create `enterprise` templates only, and need admin rights to do so.
- `templateKey` must match `^[a-zA-Z_][-a-zA-Z0-9_]*$` and be at most 64 characters.
- Field types are `string`, `float`, `date`, `enum`, `multiSelect` and `taxonomy`.
- Folders are supported. Each item can carry at most 100 metadata instances.
- Updates are JSON Patch with `content-type: application/json-patch+json`, and they are atomic: a failing `test` rejects the whole patch.
- Keel's template is `keelChecks`, with these fields:
  - `status`: one of passing, failing, running or error.
  - `passing`, `failing`, `unknown` and `runNumber`: numbers.
  - `runUrl`: a link to the run in Keel.
  - `checkedAt`: a date.

**Tasks** ([tasks](https://developer.box.com/guides/tasks/index.md), [assignments](https://developer.box.com/reference/post-task-assignments.md))

- Tasks attach to **files only**, which is why Keel attaches each task to the file that broke the rule.
- `action` is `review` or `complete`. Resolution states depend on the action:
  - `review`: `incomplete`, `approved` or `rejected`.
  - `complete`: `incomplete` or `completed`. A completed `complete` task cannot change.
- The assignee must be a collaborator on the file. Box answers 500 otherwise, and Fake Box mirrors that.
- Assignments are created separately from the task, one per user.

**Service accounts and authentication** ([CCG](https://developer.box.com/guides/authentication/client-credentials/index.md))

- The service account sees nothing until someone collaborates it onto a folder. Fake Box returns 404 in that case, and Keel's **Connect** screen lists only folders shared with Keel.
- CCG tokens last 60 minutes and there is no refresh token.

**Rate limits** ([rate limits](https://developer.box.com/guides/api-calls/permissions-and-errors/rate-limits.md))

- About 1000 requests per minute per user, and 240 uploads per minute.
- The client retries on `429` using `retry-after`. Fake Box does not throttle yet.

**Text extraction** ([text representation](https://developer.box.com/guides/representations/text.md))

- The `extracted_text` representation covers `.pdf`, `.docx` and others. It is asynchronous (`pending` → `success`).
- v1 reads `.md` and `.txt` directly. PDF and DOCX through representations are the next adapter step.

### AWS

**Lambda** ([quotas](https://docs.aws.amazon.com/lambda/latest/dg/gettingstarted-limits.html))

- A function can run for at most 900 seconds.
- Payload limits are 6 MB for synchronous calls and 1 MB for asynchronous ones. Queue messages carry only IDs, never documents.

**SQS FIFO** ([quotas](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/quotas-messages.html), [Lambda event source](https://docs.aws.amazon.com/lambda/latest/dg/services-sqs-scaling.html))

- Messages are at most 1 MiB, and the deduplication window is 5 minutes.
- `MessageGroupId` is required. While a message from a group is being processed, no other message from that group is delivered. Grouping by folder therefore gives one run at a time per folder.
- Lambda batches hold up to 10 messages and may mix groups, so the handler returns `batchItemFailures`.

**DynamoDB** ([constraints](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Constraints.html))

- Items are at most 400 KB, so results hold citations but never document text.
- Transactions hold at most 100 unique items. Run numbers are allocated with conditional writes.

**Bedrock and Strands** ([Sonnet 4.6 model card](https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-anthropic-claude-sonnet-4-6.html), [structured output](https://docs.aws.amazon.com/bedrock/latest/userguide/structured-output.html), [Strands structured output](https://strandsagents.com/docs/user-guide/sdk/agents/structured-output/index.md))

- Model: `us.anthropic.claude-sonnet-4-6`, which has a 1M-token context and 64K output tokens.
- Structured output works through `agent(prompt, structured_output_model=Model)`. The schema must set `additionalProperties: false`.
- Citations cannot be combined with structured output, so Keel asks the model for quotes in its schema and validates them itself.

## 4. Data model (single table)

| pk | sk | Item |
| --- | --- | --- |
| `FOLDERS` | `FOLDER#<id>` | Index of connected folders |
| `FOLDER#<id>` | `META` | Name, owner, webhook ID, run counter, latest run summary, last snapshot hash |
| `FOLDER#<id>` | `RUN#000004` | Trigger, snapshot (files, versions, uploaders, changed flags), rules hash and packs, coverage, counts, changes, tasks, projection result |
| `FOLDER#<id>` | `TASK#<task id>` | Rules still open on a Box task, so Keel can annotate the task when they pass again |
| `RUN#<folder>-<n>` | `RESULT#<rule id>` | Status, reason, validated citations (file, version, section, line, quote), missing items, previous status, change, blame or fixed-by, task ID |
| `WEBHOOK#<id>` | `META` | Maps a webhook ID to its folder |

## 5. Trust boundaries

- **Documents are untrusted data.**
  - The Bedrock prompt wraps them in `<document>` blocks and tells the model to ignore instructions inside them.
  - The agent has no tools.
  - Every quote is validated against the pinned file version.
- **Fail closed.** A verdict with an invalid or missing citation becomes **Couldn't evaluate**, never a pass.
- **Judges cannot write.** The judge never writes to Box. Only the runner does, and only to create tasks and metadata.
- **Changes are attributed to people.** Pack installs are written to `keel-rules.md` as the requesting user (`As-User`), so Box version history shows who changed the rules.

## 6. Swap plan (after the user experience settles)

1. **Box.**
   - Create a Box app with a CCG service account and collaborate it onto a test folder.
   - Point `KEEL_BOX_API_BASE`, `KEEL_BOX_UPLOAD_BASE` and the token at Box.
   - Create the `keelChecks` template.
   - Expose `webhook.handler` through a tunnel or Function URL.
2. **Text.** Add `extracted_text` representation reads for PDF and DOCX.
3. **AWS.** Use a SAM or CDK stack:
   - a Function URL for the webhook,
   - an SQS FIFO queue plus a dead-letter queue,
   - a runner Lambda,
   - a DynamoDB table,
   - an S3 pack catalog,
   - an EventBridge Scheduler rule,
   - Secrets Manager for the Box client secret and webhook keys.
4. **Judge.** Set `KEEL_JUDGE=bedrock`, then build a small evaluation set from the Lantern variants to check verdict stability.
5. **Identity.** Replace the user switcher with Box OAuth.

## 7. Roadmap (not in v1)

- Agent review comments: a summary of what changed plus non-blocking notes, posted as a Box comment.
- A "what changed" view.
- Box comments shown in the run timeline.
- Rule and pack owners (like CODEOWNERS).
- A publish gate (like branch protection).
- Suggested fixes.
- A public pack catalog, an org-private library in a shared Box folder, verified publishers, and pack review before enabling.
- A small decision model to skip reruns for rules an upload cannot affect.
