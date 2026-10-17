# Keel UI v4.1: team review decisions (Oct 17 2026, afternoon)

Source: the team's tabletop discussion (Mandarin and English), transcribed locally. Base stays `feat/keel-app` (v4: Box replica,
owl, one panel). Visual ideas are adopted from Sean's `feature/keel-v2` (Box design language, overview counts, current-vs-proposed
comparison, history timeline, green/blue/amber meaning only). Spec v3.4 still governs the engine and the wording rules.

## Decisions

| # | Decision | What changes |
| --- | --- | --- |
| 1 | Build on this branch; adopt Sean's visual elements | No new app. Panel gains Sean's overview tiles, comparison layout and history timeline. |
| 2 | Highlight which compliance rule or template each check follows, and who set it up | Every row and card shows a rule-source chip: the standard clause (e.g. `IS-STD-014 §5.1`) and its origin: international standard, team standard, or learned from past reviews, with the owning team. |
| 3 | Needs your decision / Acknowledge rows carry too much text | Rows become one line: status dot, rule name, status word, source chip. The explanatory sentence moves to the card. |
| 4 | A small dashboard at the top of the panel (two or three widgets) | Level 1 opens with three tiles: Hold, Need you, Recorded, with the snapshot and changed file beneath. |
| 5 | Most important: show the current agreement, where the new document changed it, and a link that highlights the line in the document | Level 2 leads with AGREED (the verified commitment, who, when, standard), then CHANGED IN (the new sentence, file, version, section) with "Open in document", which opens the Box file preview with that sentence highlighted. |
| 6 | A timeline-style visual history: when, because of which file, the status changed | A horizontal history strip on the card (per control) and on level 1 (per package): one point per snapshot, the file that changed, the status after. |
| 7 | Web first; desktop later | No desktop work in this round. |

Wording rule kept: the machine never says compliant, satisfied, passed or regressed. The dashboard counts displayed outcomes
("Hold", "Need you", "Recorded"), never compliance.

## Level 1

```
┌─ 🦉 Keel ──────────────────────────── ⋯  ✕ ┐
│ ┌──────────┐ ┌──────────┐ ┌──────────┐      │
│ │    5     │ │    3     │ │    0     │      │   tiles from the API (PackageView.dashboard)
│ │  Hold    │ │ Need you │ │ Recorded │      │   teal · amber · blue; grey when 0
│ └──────────┘ └──────────┘ └──────────┘      │
│ S4 · architecture.md v3 by svc-confluence   │   PackageView.changed_line
│                                             │
│ S1 ──── S2 ──── S3 ──── S4                  │   PackageView.timeline: one point per snapshot,
│ seed    8 verified  runbook v2  architecture │   label under each, current point filled
│                     holds      v3 · 3 need you│
│                                             │
│ NEED YOU                                    │
│ ● Encryption at rest and key management  ›  │   one line per row (ControlRow.rule_name ≤ 5 words
│   Needs review · IS-STD-014 §5.1 · Bank std │   or the title), status word, source chip
│ ● Recovery targets and rollback          ›  │
│   Needs review · IS-STD-021 §3 · Bank std   │
│ ○ Least privilege and break-glass        ›  │
│   Acknowledge · IS-STD-009 §2 · Bank std    │
│                                             │
│ 5 hold                                   ▾  │
└─────────────────────────────────────────────┘
```

Budget: level 1 ≤ 45 words excluding tile numbers and ids.

## Level 2 (hero)

```
┌─ ‹ Encryption at rest and key management ─ ✕ ┐
│ IS-STD-014 Cryptography §5.1 · Bank standard  │   rule-source chip row; hover: set up by
│ set up by Security Architecture (ARB) · maps  │   "Security Architecture (ARB)", profile 2026.3,
│ to NIST CSF PR.DS-1                            │   framework map (illustrative)
│                                                │
│ S2 ──●── S3 ──●── S4 ──◉                       │   FindingCard.timeline for this control
│ verified   holds    architecture v3            │
│ by Priya            needs review               │
│                                                │
│ AGREED                                         │
│ │ …AWS KMS customer-managed keys, rotated      │   the verified commitment (prior quote)
│ │ annually; key custodians are the Card        │
│ │ Servicing Platform leads.                    │
│ Verified by Priya Natarajan · v2 §4.3 · Oct 8  │
│                                                │
│ CHANGED IN architecture.md v3 §4.3             │
│ │ All customer data is protected with          │   new sentence, diff words underlined
│ │ industry-standard encryption…                │
│ Open in document ↗                             │   → Box preview, sentence highlighted
│                                                │
│ 4 of 5 clauses unsupported in every file of    │   verdict_line (engine)
│ this snapshot. Box AI found 0 citations…       │
│                                                │
│ [ Return to author ]        [ Verify ]         │
│ Clauses ▾  Versions ▾  Show the record ▾       │
└────────────────────────────────────────────────┘
```

For a moved binding the second block reads "NOW IN runbook.md v2 §3"; for an acknowledge row it reads "SECTION CHANGED
AROUND IT · v3 §4.2" with the unchanged sentence; for a hold it is omitted.

## Box file preview (new replica surface)

`/files/[fileId]?v=<versionId>&q=<sentence>`: Box's file preview chrome (file name, version menu, Share, ⋯, details rail
closed), the markdown rendered as a document, the sentence scrolled into view and highlighted in Keel amber with a small
"Keel: this sentence changed the status of SEC-ARCH-07" pill in the margin. The version menu switches v2/v3 so the presenter
can show the sentence that was there before. The panel stays open on the right.

## API additions (lane E, additive)

- `ControlRow.rule_source: { standard: string; clause?: string; origin: "international_standard" | "team_standard" | "learned_from_reviews"; set_by: string; framework_map?: string[] }`
  from the control profile (new profile fields `source.origin`, `source.set_by`; fixture gets them: Bank standard set up by
  Security Architecture (ARB); SEC-ARCH-01 approved services learned from past ARB reviews; SEC-ARCH-17 SIEM maps to an
  international standard).
- `ControlRow.rule_name?: string` (≤ 5 words, from the profile; falls back to title).
- `PackageView.dashboard: { tiles: { key: "hold" | "need_you" | "recorded"; label: string; value: number; tone: "teal" | "amber" | "blue" | "grey" }[] }`.
- `PackageView.timeline: { snapshot_id; at; label; detail; tone; changed_files: string[]; current: boolean }[]`.
- `FindingCard.timeline: same shape, per control (events: verified, holds, needs review, returned, acknowledged).`
- `FindingCard.agreed: { quote; file; version_label; section; verified_by; verified_at }` and
  `FindingCard.changed: { kind: "replaced" | "moved" | "section_changed" | "none"; heading: string; quote?: string; file; version_label; version_id; section; } | null`
  (headings computed by the engine: "Changed in architecture.md v3 §4.3", "Now in runbook.md v2 §3", "Section changed around it · v3 §4.2").
- `FindingCard.open_in_document?: { file_id; version_id; sentence }` for the preview link.
- `GET /api/file-text?file_id&version_id` returns the pinned text of a snapshot version for the preview (mock and live, read-only).

## Lanes

- E: fields above, fixture profile sources, tests.
- A: Box file preview route and highlight; "Open in document" target; version menu.
- B: tiles, timeline strips, one-line rows with source chips, AGREED / CHANGED card layout, Open in document link.
- Docs: runbook and README after the lanes land.
