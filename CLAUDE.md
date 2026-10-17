# Keel (Box + AWS Agentic Enterprise AI Hackathon, Oct 16-17 2026)

**Know what changed, and who reviewed that exact evidence.** Files have versions. Compliance evidence should too.

Keel adds version-bound control-evidence history and re-review rules to a Box review workflow. An agent on
Bedrock re-assesses each control against a pinned snapshot of a Box folder, code validates every quote and
records every evaluation in an append-only ledger, and a named reviewer records the disposition through a Box
task. The machine never says "satisfied" and never turns anything green.

Read, in order: `docs/research/30-design-v3.md` (spec v3.4, the source of truth), `docs/CONTRACTS.md`
(frozen shapes, routes, module layout), `demo-data/lantern/README.md` (the fixture).

## Stack
- Next.js 16 (App Router, TypeScript, Tailwind v4) in `app/`. `cd app && npm run dev`.
- `@strands-agents/sdk` with `BedrockModel`, default `us.anthropic.claude-sonnet-4-6`. Zod-validated output.
- `box-typescript-sdk-gen` for files, versions, folder metadata, tasks, Box AI ask and text generation.
- `motion` for UI animation. `vitest` for the engine's acceptance cases.
- State: `app/data/store.json` (gitignored). No database.

## UI
- The UI is a Box folder replica plus the owl plus one side panel (`docs/research/50-ui-v4-box-owl.md`). The old
  `/ledger`, `/rules`, `/architecture` routes stay as deep links; the panel's ⋯ menu opens the same screens inline.
- Copy budget: owl bubble at most 12 words, panel level 1 at most 60 words visible, level 2 first screen at most 120.
  The UI never composes machine text. It renders `bubble`, `short`, `verdict_line`, `receipt` and `decision_summary`
  from the API.

## Mock mode is the default
`MOCK_MODE=true` (default) needs zero credentials and serves `demo-data/lantern/`. Only the integration laptop
sets `MOCK_MODE=false`. Never commit `.env.local`. The mock path runs the same deterministic engine as the live
path; only the Box, Bedrock, Box AI and Decider adapters are swapped. Keep it that way.

## Rules
- The sixteen display rules, staleness and materiality, assessment precedence and the disposition checks live in
  `app/src/lib/engine/` and are the only place status is decided. The UI never hardcodes a label.
- Machine text never contains "satisfied", "compliant", "passed" or "regressed". Green is only for a human
  Verified on the current snapshot.
- Every quote shown is validated against pinned version text. Counts are computed, never typed.
- Synthetic data only. No real customer, employer or personal content in this repo.
- `cd app && npm run typecheck && npm test` before pushing. Commit small with a lane prefix (`engine:`, `ui:`,
  `agent:`, `box:`, `content:`, `docs:`), and push with every commit.
