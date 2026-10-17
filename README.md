# Keel: checks for Box folders

**Every upload, checked.** Keel is CI for documents. A Box project folder carries plain-language rules in `keel-rules.md`. Every upload to the folder reruns those rules. Each rule passes or fails with quoted evidence. When a change breaks a check, the person whose upload caused it gets a Box task.

- **Rules live in the folder.** `keel-rules.md` works like a CI workflow file, and versioned **rule packs** (GDPR, NIST CSF, OWASP ASVS, an org-internal checklist) install with one `uses:` line.
- **Every change reruns the checks.** A Box webhook feeds a queue and a runner. Each run snapshots the folder's file versions first.
- **Every verdict is cited.** Quotes are validated against the exact file version. A check that can't be backed up shows "couldn't evaluate", never a pass.
- **The person who broke it hears first.** Regressions are traced to the uploader of the changed file, and Box tasks and folder metadata carry the result back into Box.

Checks confirm that the thinking is stated and consistent across the documents. They do not prove what was built, and a passing pack is not a certification.

**Status:** the local v1 is built and runs on one machine. Box is replaced by *Fake Box*, a Box-shaped API and UI. AWS (Lambda, SQS FIFO, DynamoDB, EventBridge) is replaced by SQLite-backed stand-ins that keep the same limits. The judge is a deterministic offline stand-in, and a Bedrock judge is wired in but not yet exercised.

**Start here:**
- [`keel/README.md`](keel/README.md): how to run it, the user flow, and the architecture
- [`keel/demo/videos/`](keel/demo/videos): recorded walkthroughs, with [`keel-walkthrough.mp4`](keel/demo/videos/keel-walkthrough.mp4) as the full demo
- [`docs/v1-local-design.md`](docs/v1-local-design.md): design decisions, Box and AWS constraints with sources, and the swap plan

```bash
cd keel && ./dev.sh --seed     # Keel on http://localhost:3000, Fake Box on http://localhost:3000/box
```

![Keel checks view](keel/demo/screenshots/checks-regression.png)

## Earlier explorations

The repository also keeps the research and earlier designs that led here. They describe earlier ideas, not the current build.

- [`docs/idea-selection.md`](docs/idea-selection.md) and [`docs/idea3-discussion.md`](docs/idea3-discussion.md): comparison of the three hackathon ideas
- [`docs/one-pager.md`](docs/one-pager.md): idea #1, epistemic review
- [`docs/architecture.md`](docs/architecture.md), [`docs/demo.md`](docs/demo.md), [`docs/idea-evolution.md`](docs/idea-evolution.md), [`demo/index.html`](demo/index.html): idea #2, EpistemicBox / agreement drift
- [`docs/research/30-design-v3.md`](docs/research/30-design-v3.md), [`demo-data/lantern/`](demo-data/lantern), [`demo/keel.html`](demo/keel.html): Keel v3.4, version-bound human verification of control evidence. The current build reuses its name and synthetic bank scenario.
- [`desktop-client/`](desktop-client/README.md): desktop HUD prototype (mocked; not part of v1)
