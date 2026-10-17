# Keel app

The Next.js app for Keel: the deterministic engine, ledger, store, Box adapter, Strands agent on Bedrock, API
routes and the Box-replica UI. The project overview is in the [root README](../README.md).

```bash
npm install
npm run dev          # http://localhost:3000, mock mode by default
npm test             # Vitest, including the spec's acceptance cases
npm run typecheck
npm run build && npm run start   # production mode, for the demo
```

- `src/lib/engine/` decides every status. The UI never hardcodes a label.
- `src/lib/service.ts` is the one service layer; the Box, Bedrock, Box AI and Decider adapters swap on `MOCK_MODE`.
- `src/components/box/`, `owl/`, `panel/` are the experience layer.

Shapes and routes: [`docs/CONTRACTS.md`](../docs/CONTRACTS.md). Going live: [`docs/INTEGRATION.md`](../docs/INTEGRATION.md).
Presenter runbook: [`docs/demo.md`](../docs/demo.md).
