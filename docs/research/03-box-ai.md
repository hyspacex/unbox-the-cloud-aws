# 03 - Box AI, Automate, Metadata, and platform: what is real in Oct 2026

Research date: 2026-10-16. Sources are developer.box.com (raw `.md` pages via the
`llms.txt` index), docs.box.com, support.box.com public articles, the official
`box/box-openapi` spec, and the `box/box-typescript-sdk-gen` repo docs. Every claim
below links to a source in the Sources section. Items marked **UNVERIFIED** need a
5-minute test against the real tenant before we depend on them.

---

## TL;DR for the team

- **Use:** `POST /ai/extract_structured` (per-file, per-control evidence with
  `include_reference` quotes and confidence), `POST /ai/ask` `multiple_item_qa`
  (up to 25 files, `include_citations`) for cross-file reasoning, Metadata templates on
  **folders and files**, `POST /metadata_queries/execute_read` for folder rollups,
  file versions + `GET /files/:id/content?version=` for the diff, comments and tasks for
  the human verify step, V2 webhook `FILE.UPLOADED` on the folder (or polling) as trigger.
- **Automate already does:** event triggers (upload, metadata applied, manual, HTTPS),
  AI summarize / extract-to-metadata / Q&A steps, branching on AI output, for-each over
  all files in a folder, approval tasks, notifications, per-run tracking history.
- **Automate does NOT do (our lane):** it has no notion of a control or a control
  library, no version-to-version comparison, no "a statement disappeared" detection, no
  per-control status history or evidence ledger. It also does not write task decisions
  back to metadata (Box's own tutorial uses a webhook for that).
- **Biggest setup risk:** the **Free Developer Plan keeps only 1 file version** and
  excludes Automate, AI Studio, and Doc Gen. Our hero moment (regression on a new
  version) needs version history. We need a hackathon-provided Enterprise / Enterprise
  Advanced sandbox, or we must snapshot text ourselves on every upload (see section 6).

---

## 1. Box AI API surface

### Endpoints

| Endpoint | What it does | Items | Notes |
| - | - | - | - |
| `POST /2.0/ai/ask` | Q&A over content | `single_item_qa`: exactly 1 file. `multiple_item_qa`: **up to 25 files**. Or 1 hub (`type: hubs`, must be the only item) | `include_citations: true` returns `citations[]` with `type`, `id`, `name`, `content` excerpt. `dialogue_history` supported. Prompt max **10,000 chars**. Optional `items[].content` overrides file text. |
| `POST /2.0/ai/text_gen` | Generate text grounded in a file | Exactly 1 file | Has `dialogue_history`. |
| `POST /2.0/ai/extract` | Freeform extraction from natural-language prompt | Exactly 1 file | |
| `POST /2.0/ai/extract_structured` | Key/value extraction | Exactly 1 file | Either `metadata_template` (`scope`, `template_key`) **or** inline `fields[]`, never both. |
| `GET /2.0/ai_agent_default?mode=ask\|text_gen\|extract\|extract_structured` | Returns the default agent config | | Use it to see default model and prompt. |

`extract_structured` details that matter to us:
- Field types: `string`, `float`, `date`, `enum`, `multiSelect`, plus complex `struct` and
  `table` (with nested sub-fields; Enhanced Extract Agent recommended for those).
- `include_confidence_score: true` gives a numeric score and Low/Medium/High per field
  (High >= 0.90, Medium 0.70-0.89, Low < 0.70), computed by consistency across request
  variations.
- `include_reference: true` gives `references` with `item_id`, zero-indexed `page`,
  `text`, optional `bounding_box`. **This is our "exact quote" for the evidence event.**
- Enhanced Extract Agent: `ai_agent: {type: "ai_agent_id", id: "enhanced_extract_agent"}`.
- Template-based results come back in template format; inline `float` fields come back numeric.

### Limits (from the Box AI guide "input limits")

| Limit | Value |
| - | - |
| Prompt | 10,000 characters |
| Single-file text | 2 MB of text, rest truncated |
| Multi-file ask | up to 25 files |
| text_gen / extract / extract_structured | exactly 1 file |
| Images/pages per request | 5 (first 5 processed) |
| Image resolution | 1024 x 1024 |
| Tokens | No fixed number published. Box does token windowing; `num_tokens_for_completion` is overridable. |
| Behavior over limit | Truncates silently, does not error. Image+text mixed: only text processed. |

Box MCP's `ai_qa_single_file` says it reads the "first 1 MB of text", so MCP is tighter than the raw API.

### Models and model choice

- Box AI runs on OpenAI, Google, Anthropic (hosted on AWS), Meta, and Mistral (via IBM)
  models. API names use two underscores, e.g. `openai__gpt_5_mini`, `aws__claude_sonnet_5_5`.
- Core Anthropic models listed include `aws__claude_haiku_5_5`, `aws__claude_sonnet_5_5`,
  `aws__claude_opus_5_5`, `aws__claude_opus_5`, `aws__claude_sonnet_5`, `aws__claude_4_6_sonnet`,
  `aws__claude_4_5_haiku` and others. `aws__claude_fable_5_1` is **customer-enabled** (admin must turn it on).
- Tiers: Standard, Premium, Ultra. Premium consumes AI Units faster.
- **Yes, a developer can pick the model per request** via the `ai_agent` override on
  ask / text_gen / extract / extract_structured (`model`, `prompt_template`,
  `system_message`, `llm_endpoint_params`, `num_tokens_for_completion`). Box guarantees
  each agent config snapshot for 12 months plus a 6-month transition.
- Default-config samples still show `openai__gpt_5_mini` as a default for several modes.
  Do not assume Box AI defaults to Claude. Pin the model explicitly if we want the
  "Claude on AWS inside Box" story.

### AI agents (Box AI Studio)

- `POST/GET/PUT/DELETE /2.0/ai_agents` creates persistent custom agents with
  instructions, model, and access control. Modes: `ask`, `text_gen`, `extract`.
- **AI Studio is Enterprise Advanced only.** Box AI API itself is "Business plans and above",
  and also available on the free developer plan.

### Box AI for Hubs

- Pass a hub as the single item to `/ai/ask`. Hub must have AI enabled. Answers respect
  the asking user's permissions. Hubs API requires header `box-version: 2025.0`.

### AI Units

- Q&A API, Text Gen API, Extract (standard and enhanced), API calls to agents, Automate
  agent steps, and MCP extraction are **chargeable** in AI Units.
- Included per month: Free developer plan 1,000; Enterprise 1,000; Enterprise Plus 2,000;
  Enterprise Advanced 20,000. No rollover. When exhausted, API calls are blocked with
  "AI unit entitlement has been reached." Per-action unit rates live in a Box-hosted
  consumption table not reproduced in the public docs.
- Implication: rehearsing the demo 50 times with `extract_structured` on 6 files x 8
  controls could burn units. Cache results in mock mode.

---

## 2. Box Automate (GA April 2026, successor to Relay)

### What it is

A visual drag-and-drop workflow builder native to Box that "routes work across AI agents,
humans, and processes." Available on Business plans and above, but **the full agentic
set (AI agents, Box Extract, Forms, Doc Gen, Apps, Hubs) is Enterprise Advanced only**.
Any agent run in Automate consumes AI Units. Relay workflows can be migrated (Aug 2026).

### Triggers

- File events: Uploaded, Moved, Copied, Downloaded, Deleted, Preview, Lock, Unlock,
  Watermarked, Add Collaborator, Classification Applied, "file-with-metadata scenarios".
- Folder events: Created, Moved, Copied, Downloaded, Deleted, Add Collaborator.
- Task completed (general, or approval accepted/rejected).
- File Request submitted. Box Sign completed/declined/expired/cancelled.
- Metadata: "when a specific metadata template is applied to a specific file or folder."
- Manual Start (from the web app, or via API).
- Form submissions (Enterprise Advanced Plus).
- HTTPS request: a unique URL per workflow that an external system can call.
- Triggers can be scoped to folders or metadata conditions. An Aug 2026 update expanded
  metadata, file, and folder event triggers (article body not publicly readable).
- **No "new file version uploaded" trigger is listed** in either the support guide or
  the developer guide. **UNVERIFIED** whether "Uploaded" fires for a new version.

### Outcomes and AI steps

- File/folder ops, collaborations, approval and general tasks, email notifications,
  Doc Gen, Box Sign, integrations and custom connectors, HTTPS request outcomes
  (subject to admin allow-lists).
- AI: Box AI document summarization (pick an agent plus optional instructions), Add
  Metadata via agent (AI extraction into a template), Q&A, custom AI Studio agents with
  knowledge sources, citations, and reasoning traces where enabled.
- Logic: branching on conditions including structured AI output, JSONPath, variables,
  parallel branches with merge, **For Each over "all files in a folder"**, loop-back with max count.
- Box's own guidance: "Agent outputs may be unpredictable", add a human approval step after AI.

### Run history

- The Tracking page shows a per-execution, step-by-step history with timestamps,
  variable values at each step, and status of active tasks. This is a **workflow run
  log**, not a domain ledger.

### API

- Beta Automate Workflows API, header `box-version: 2026.0`:
  - `GET /2.0/automate_workflows?folder_id=...` lists callable Manual Start workflows.
  - `POST /2.0/automate_workflows/:id/start` starts one, **max 20 files per request**.
- Beta, and **not on the Free Developer Plan**. Start does not accept runtime fields
  during beta, so Box's tutorial writes context to metadata first.
- Gotcha from Box's tutorial: a service-account (CCG enterprise) token returns an empty
  list and `400 Action not found`. Authenticate as a managed user who can run Automate.
- Automate does not write task decisions back to metadata. Box's tutorial closes the
  loop with a V2 webhook on `TASK_ASSIGNMENT.UPDATED`.
- Legacy Relay API: `GET /workflows`, `POST /workflows/:id/start`, scope `manage_triggers`.

### Precise answers to the four boundary questions

| Question | Answer | Basis |
| - | - | - |
| Can Automate evaluate a document against a multi-item control checklist and record per-control status? | **Partially.** An "Add Metadata" AI step can extract into a template whose fields are controls (e.g. one enum per control), so it can write a per-control value onto one file. It has no control library, no evidence object (quote, version, confidence per control), and no notion that a control is satisfied by evidence across several files. | Automate outcomes list; extract_structured field types |
| Can it reason across multiple files in a folder? | **Loop, yes. Joint reasoning, not natively.** For Each iterates "all files in a folder" running per-file steps. A custom agent with knowledge sources could answer across content. There is no documented step that takes the folder as one evidence set and decides a control from evidence split across files. | Triggers and logic guide |
| Can it detect that a new version removed a statement that previously satisfied a check? | **No.** No version-upload trigger is listed, no version comparison step, no access to prior version content. AI steps operate on the current file. | Trigger and outcome lists |
| Can it show per-control history over time? | **No.** Tracking shows per-run step history. Metadata holds only current value. Nothing renders control status over time. | Tracking description; metadata section below |

Positioning consequence: do not claim "we trigger on upload", "we run AI on documents",
"we route to an approver", or "we write metadata" as novel. Automate does all four.
Claim: control-level reasoning across files and across versions, with an evidence ledger.

---

## 3. Box Metadata

- **Templates:** enterprise-scoped, created via `POST /metadata_templates/schema` (scope
  `manage_enterprise_properties` needed, admin token on CCG). Field types: `string`,
  `float`, `date`, `enum`, `multiSelect`, `taxonomy` (single and multi), Box item fields.
- **Folders: yes.** Instances apply to files and folders.
  `POST /files/:id/metadata/:scope/:templateKey` and
  `POST /folders/:id/metadata/:scope/:templateKey`. Update with JSON-Patch `PUT`.
  Up to 100 templates per item.
- **Plan gate:** custom metadata templates are listed as "Business Plus and above". The
  free developer plan page says Metadata "read, write, and extend" is included.
  **UNVERIFIED** whether a free developer account can create enterprise templates. Test first.
- **Query:** `POST /2.0/metadata_queries/execute_read` with `from`
  (`enterprise_<id>.<templateKey>`), `query` with bound `query_params`, `ancestor_folder_id`,
  `fields`, `order_by`, `limit` (default 20, marker pagination). Returns files and folders.
  Only works on the enterprise's own templates, not `global.properties`, not classification.
  This is the folder rollup: "all files under project folder where control4Status = 'Open'".
- **Cascade policies:** apply a folder's instance to all children. Admin must enable
  "Cascading Folder Level Metadata". Asynchronous, no completion signal. Not useful for
  per-file status. Avoid for the demo.
- **Web UI:** metadata instances appear in the item's sidebar metadata panel for files
  and folders, and Box Apps views can chart and filter them (Apps views support
  multi-select charts, inline edit, CSV export as of 2026). Good for "Box itself shows it".
- **History: Box does not keep metadata value history on the item.** The instance has a
  `$version` counter but only current values. History exists only as enterprise events
  `METADATA_INSTANCE_CREATE/UPDATE/DELETE` via `GET /events?stream_type=admin_logs`
  (admin or co-admin only, 1 year via API, 2 weeks on `admin_logs_streaming`). So our
  ledger must live in our own store. This is a real gap we fill.
- **File versions:** `GET /files/:id/versions` lists previous versions (current version is
  on the file object as `file_version`). Download a specific one with
  `GET /files/:id/content?version=<file_version_id>`. Upload a new version with
  `POST https://upload.box.com/api/2.0/files/:id/content`. Also restore, promote, delete.
  Enterprise event `FILE_VERSION_RESTORE` exists. **Free developer plan: 1 file version.**

---

## 4. Adjacent Box products: does each help us?

| Product | What it is | Helps our idea? |
| - | - | - |
| **Box MCP server** | Box-hosted remote MCP at `https://mcp.box.com` (name `box-remote-mcp`), OAuth via admin-created Integration Credentials, admin must enable MCP. Self-hosted server is deprecated. Tools include `get_file_content`, `get_file_details`, `list_folder_content_by_folder_id`, `search_files_metadata`, `set_file_metadata`/`set_folder_metadata` (admin-off by default), `upload_file_version` (off), `create_file_comment`, `list_tasks`, `ai_qa_multi_file`, `ai_qa_single_file`, `ai_qa_hub`, `ai_extract_structured_from_metadata_template`, hubs and doc gen tools. | **Maybe, as a story beat.** Letting our Strands agent call Box through MCP is a strong "agentic" signal to judges, but adds OAuth setup risk and admin toggles. Use direct SDK calls for the critical path; MCP is optional garnish. |
| **Box Hubs** | Curated content portal with AI Q&A scoped to the hub. | **Low.** Could publish "verified evidence" to a hub for auditors. Not needed in 3 minutes. |
| **Box AI Studio agents** | Persistent custom agents (Enterprise Advanced). | **Low/medium.** We could register a "Control Reviewer" agent so Automate can call it, which is the cleanest friend-of-Automate story. Requires Enterprise Advanced. |
| **Box Sign** | E-signature. | **Low.** An auditor sign-off on a control attestation is plausible, but out of scope. |
| **Box Doc Gen** | Template-driven docx/pdf generation (Enterprise Advanced, `box-version: 2025.0`). | **Medium, stretch.** Generate the "Evidence Pack" PDF for the review board. Not on free plan. |
| **Box Shield classification** | Security classification labels (add-on). Classification templates cannot be used in metadata queries. | **Low.** Could gate "Confidential" docs, but not core. |
| **Box Apps views** | No-code views over metadata with charts, inline edit, CSV export. | **Medium.** A Box-native dashboard of per-file control status costs us zero code if the tenant has it. |

---

## 5. Webhooks and eventing

- **V2 triggers relevant to us** (exact names from the OpenAPI enum):
  `FILE.UPLOADED` (**folder only**, fires when a file is uploaded **or moved** into the
  folder), `FILE.PREVIEWED` (file or folder), `FILE.RESTORED`,
  `METADATA_INSTANCE.CREATED` / `.UPDATED` / `.DELETED` (file or folder),
  `COMMENT.CREATED`, `TASK_ASSIGNMENT.CREATED` / `.UPDATED`.
- **There is no `FILE.VERSION_UPLOADED` trigger.** The full `FILE.*` enum is COPIED,
  DELETED, DOWNLOADED, LOCKED, MOVED, PREVIEWED, RENAMED, RESTORED, TRASHED, UNLOCKED,
  UPLOADED. **UNVERIFIED** whether uploading a new version fires `FILE.UPLOADED` on the
  parent folder. Test once; if not, detect versions by polling.
- **Signature validation:** generate primary and secondary keys in Developer Console >
  Webhooks > Manage signature keys. Headers `BOX-SIGNATURE-PRIMARY`,
  `BOX-SIGNATURE-SECONDARY`, `BOX-DELIVERY-TIMESTAMP`. HMAC-SHA256 over body bytes then
  timestamp bytes, base64; reject if timestamp older than 10 minutes. SDK:
  `WebhooksManager.validateMessage(body, headers, primaryKey, {secondaryKey})`.
- **Limits:** one webhook per item per app per user; 1000 per app per user; HTTPS on
  port 443 with a CA-signed cert (ngrok works); not on root folder; Box retries up to 5
  times; respond 2xx within 30 s. **If created with a developer token, the webhook
  degrades to `NO_ACTIVE_SESSION` after 1 hour and is deleted when the token is revoked.**
  Create webhooks with the CCG app token.
- **Laptop demo recommendation: poll, do not depend on webhooks.** Every 3 to 5 s call
  `GET /folders/:id/items?fields=id,name,file_version,sha1,modified_at` and diff
  `file_version.id` against our store. This catches new files and new versions with zero
  inbound networking, works on any Wi-Fi, and survives ngrok drops. Keep a webhook
  receiver behind ngrok as a "real-time" upgrade if time allows. The user event stream
  (`GET /events?stream_type=changes`, long-poll supported) is a second option.

---

## 6. Developer setup realities

### Plans

| Capability | Free Developer Plan | Notes |
| - | - | - |
| Box AI API (ask, extract, text_gen) | **Yes**, 1,000 AI units/month | Admin must enable Box AI; sandbox accounts may need the Box AI access form |
| Metadata API | Yes ("read, write, and extend") | Custom templates listed as Business Plus+; **test template creation** |
| Webhooks, search, users, hubs API | Yes | |
| File versions | **1 version only** | Breaks native version history |
| Storage / upload | 10 GB / 250 MB per file | Fine |
| Box Sign | 5 docs/month | |
| Box Automate + Automate API | **No** | Enterprise Advanced for agent steps |
| AI Studio | **No** | Enterprise Advanced only |
| Doc Gen | **No** | Enterprise Advanced only |

**Mitigation for the 1-version limit:** on every detected upload, our backend downloads
the file text and stores a snapshot (hash, version id, text) in `store.json` or S3. The
regression diff then compares our snapshots, not Box version history. This works on any
plan and is also more auditable (we hold the exact bytes we judged). If the hackathon
gives an Enterprise sandbox, also show `GET /files/:id/versions` for authenticity.

### App setup

- Platform App, **Server Authentication with Client Credentials Grant** (preselected for
  new server apps; the free account auto-creates and auto-authorizes a CCG app).
- Token: `POST /oauth2/token` with `grant_type=client_credentials`,
  `box_subject_type=enterprise|user`, `box_subject_id`. Valid **60 minutes**, no refresh
  token; SDK `BoxCcgAuth` re-fetches automatically.
- Developer token: 60 minutes, not refreshable, tied to the console user. Fine for curl, bad for webhooks.
- Scopes we need:

| Console label | OAuth scope | Why |
| - | - | - |
| Read and write all files and folders | `root_readwrite` | read docs, upload versions, metadata instances, comments, tasks |
| Manage AI | `ai.readwrite` | `/ai/*` endpoints (admin must grant Box AI first) |
| Manage webhooks | `manage_webhook` | create V2 webhooks |
| Manage enterprise properties | `manage_enterprise_properties` | create metadata templates, read enterprise events |
| Manage Box Relay | `manage_triggers` | only if we start Relay/Automate manual workflows |

- There is no separate "write comments" scope; comments and tasks ride on
  `root_readwrite`. Changing scopes requires re-authorizing the app in the Admin Console.
- For Automate API calls, use App + Enterprise Access with "Generate user access tokens"
  and authenticate as a managed user, not the service account.
- CCG service account is its own user. **Share the demo folder with the service account
  (or authenticate as the managed user) or every call returns 404.**

### box-typescript-sdk-gen method names (repo already pins `^1.19.1`)

```ts
// auth
new BoxCcgAuth({ config: new CcgConfig({ clientId, clientSecret, enterpriseId }) });
new BoxDeveloperTokenAuth({ token });

// upload new version
await client.uploads.uploadFileVersion(fileId, { attributes: { name }, file: stream });
// list versions, download a specific version
await client.fileVersions.getFileVersions(fileId);
await client.downloads.downloadFile(fileId, { queryParams: { version: fileVersionId } });

// metadata template + instances
await client.metadataTemplates.createMetadataTemplate({ scope: 'enterprise', templateKey, displayName, fields });
await client.fileMetadata.createFileMetadataById(fileId, 'enterprise', templateKey, values);
await client.fileMetadata.updateFileMetadataById(fileId, 'enterprise', templateKey, jsonPatchOps);
await client.folderMetadata.createFolderMetadataById(folderId, 'enterprise', templateKey, values);
await client.folderMetadata.updateFolderMetadataById(folderId, 'enterprise', templateKey, jsonPatchOps);
await client.search.searchByMetadataQuery({ from, query, queryParams, ancestorFolderId, fields });

// Box AI
await client.ai.createAiExtractStructured({ items: [{ id, type: 'file' }], fields, includeConfidenceScore: true, includeReference: true });
await client.ai.createAiAsk({ mode: 'multiple_item_qa', prompt, items, includeCitations: true });
await client.ai.getAiAgentDefaultConfig({ mode: 'extract_structured' });

// human-in-the-loop
await client.comments.createComment({ message, item: { id: fileId, type: 'file' } });
await client.tasks.createTask({ item: { id: fileId, type: 'file' }, action: 'review', message, dueAt });
await client.taskAssignments.createTaskAssignment({ task: { id: taskId, type: 'task' }, assignTo: { id: userId } });

// webhooks
await client.webhooks.createWebhook({ target: { id: folderId, type: 'folder' }, address, triggers: ['FILE.UPLOADED'] });
await WebhooksManager.validateMessage(body, headers, primaryKey, { secondaryKey });
```

Field names are camelCase in the TS SDK (`includeConfidenceScore`, `includeReference`,
`includeCitations`, `ancestorFolderId`). Automate beta endpoints have no SDK manager yet;
call them with `client.makeRequest` and header `box-version: 2026.0`.

---

## 7. Positioning paragraph for a Box judge

> Box Automate is the right engine for moving a document through a process: it fires on
> upload, runs a Box AI step, and routes an approval, and we don't rebuild any of that.
> What Automate can't answer is the auditor's question: is control 4 still satisfied
> across this whole project folder, which version of which file proves it, and when did
> that stop being true? We answer it with five Box APIs. **Box AI `extract_structured`**
> evaluates each file against the control list and returns a per-control verdict with
> `include_reference` quotes and confidence scores, so every finding cites the page and
> text it relied on. **Box AI `ask` in `multiple_item_qa` mode with citations** decides
> controls whose evidence is split across up to 25 documents. **File versions** let us
> pull the previous version's content and prove a statement was removed. **Metadata
> templates on the folder and on each file**, queried with **`metadata_queries/execute_read`**,
> put live control status where Box users and downstream agents already look. **Tasks
> and comments** capture the human reviewer's confirm or override, because AI never marks
> a control Verified. Box keeps only current metadata values, so we keep the
> evidence ledger alongside it. In production our reviewer agent registers as an
> AI Studio agent that an Automate workflow calls on every upload, so Automate is the
> trigger and router and we are the judgment step inside it.

---

## Open items to verify on the real tenant (5 minutes each)

1. Does uploading a new version fire `FILE.UPLOADED` on the parent folder webhook?
2. Can our account create an enterprise metadata template (free plan vs Business Plus gate)?
3. Does our account keep more than one file version?
4. Is Box AI enabled for the account, and does `aws__claude_sonnet_5_5` work as an `ai_agent` override?
5. How many AI Units does one `extract_structured` call with references and confidence cost? Read the admin AI Insights card after one call.

---

## Sources

- Box AI overview and input limits: https://developer.box.com/guides/box-ai
- Ask questions (single/multi-file, hubs, citations): https://developer.box.com/guides/box-ai/ai-tutorials/ask-questions
- Extract structured: https://developer.box.com/guides/box-ai/ai-tutorials/extract-metadata-structured
- Box AI prerequisites, `ai.readwrite` scope, developer token: https://developer.box.com/guides/box-ai/ai-tutorials/prerequisites
- Supported AI models: https://developer.box.com/guides/box-ai/ai-models/index
- Default agent config: https://developer.box.com/guides/box-ai/ai-agents/get-agent-default-config
- Box AI Studio: https://developer.box.com/guides/ai-studio/index
- AI Units: https://docs.box.com/en/box-ai/understanding-ai-units-in-box and https://support.box.com/hc/en-us/articles/51958279200147-Understanding-AI-Units-In-Box
- Introducing Box Automate (Apr 2026): https://support.box.com/hc/en-us/articles/51216981327123-Introducing-Box-Automate-Apr-2026
- Creating workflows in Box Automate: https://support.box.com/hc/en-us/articles/50925837290131-Creating-workflows-in-Box-Automate
- Box Automate developer overview: https://developer.box.com/guides/box-automate
- Automate triggers, outcomes, and logic: https://developer.box.com/guides/box-automate/triggers-and-logic
- Intelligent workflow (Automate API beta, free plan exclusions): https://developer.box.com/guides/intelligent-workflow
- Route claims evidence with Box Automate (API usage, gotchas): https://developer.box.com/tutorials/claims-evidence-review
- Box Automate GA press release: https://www.businesswire.com/news/home/20260428144665/en/Box-Launches-Box-Automate-to-Orchestrate-Agentic-Workflows
- Relay start workflow API: https://developer.box.com/reference/resources/workflows/
- Metadata overview: https://developer.box.com/guides/metadata/
- Metadata fields: https://developer.box.com/guides/metadata/fields/index
- Metadata instances (file and folder): https://developer.box.com/guides/metadata/instances/create
- Metadata queries: https://developer.box.com/guides/metadata/queries/create and https://developer.box.com/guides/metadata/queries/limitations
- Metadata cascade policies: https://developer.box.com/guides/metadata/cascades/index
- Upload file version: https://developer.box.com/guides/uploads/direct/file-version
- Enterprise events: https://developer.box.com/guides/events/enterprise-events/for-enterprise
- Events overview: https://developer.box.com/guides/events/index
- Webhooks overview: https://developer.box.com/guides/webhooks
- Webhook triggers: https://developer.box.com/guides/webhooks/triggers
- Webhook signatures: https://developer.box.com/guides/webhooks/v2/signatures-v2
- Webhook limitations: https://developer.box.com/guides/webhooks/v2/limitations-v2
- FILE.UPLOADED fires on move too: https://community.box.com/support-forum-47/webhook-confusion-file-uploaded-vs-file-moved-23439
- Box OpenAPI spec (trigger enum check): https://github.com/box/box-openapi
- Box MCP server: https://developer.box.com/guides/box-mcp
- Box MCP tools: https://developer.box.com/guides/box-mcp/tools
- Box Hubs API: https://developer.box.com/guides/hubs-api
- Free developer plan: https://developer.box.com/guides/getting-started/free-developer-plan
- Client Credentials Grant: https://developer.box.com/guides/authentication/client-credentials/index
- Developer tokens: https://developer.box.com/guides/authentication/tokens/developer-tokens
- Scopes: https://developer.box.com/guides/api-calls/permissions-and-errors/scopes
- Box Apps 2026 releases: https://support.box.com/hc/en-us/articles/54126320650899-July-2026-Recent-Apps-Releases
- TypeScript SDK docs: https://github.com/box/box-typescript-sdk-gen/tree/main/docs
