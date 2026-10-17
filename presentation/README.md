# Keel presentation · draft 02

Target: 2 minutes including the demo. English script, Chinese rehearsal notes.
Revised after team feedback: fixed compliance checklist and current package status lead the story.
Working script for feedback, not a completed slide deck.

## Message

Keel keeps a project's document-based compliance review up to date against a fixed checklist. Users see the current status, the evidence behind each item, and how that status changed over time.

## Judging alignment

Source: [working context brief](../docs/research/00-brief.md). These weights are recorded in the team's brief, not independently verified event rules.

| Criterion | Weight in brief | What the demo shows |
| --- | --- | --- |
| Technical execution: tools, working demo, scalable design | 50% | Upload triggers a real engine run, visible steps explain Bedrock assessment and Box AI cross-file search, code validates quotes against pinned versions, human action produces a task and receipt. |
| Business value: solves a problem, enterprise readiness | 30% | A reviewer sees the current checklist status without manually rereading the document package. Reasons, version history and named verification make the review traceable. |
| Presentation | 20% | One project, one update, one finding, one response. Two minutes with a clear opening and close. |

The brief says “3 minutes flat.” Harry requested a 2-minute core. Keep the extra minute as contingency or the optional extension below until the actual event duration is confirmed.

## Two-minute flow

| Time | Say / purpose | Show |
| --- | --- | --- |
| 0:00–0:15 | Fixed checklist, changing documents, current compliance review status | Open on the package checklist and overview. No separate problem slide needed. |
| 0:15–0:30 | Establish the reviewed baseline | Existing verified items and compact package timeline. Point to who verified one item. |
| 0:30–0:55 | Upload triggers reassessment | Upload architecture v3. While the owl works, explain the Box/AWS division in one short passage. |
| 0:55–1:15 | Overall status updates, one item explained | Show updated counts, then open encryption. Show rule source, missing evidence and exact quotes. |
| 1:15–1:30 | Why the status changed and who previously verified it | One control timeline: reviewed baseline, continued support, v3 needs review. |
| 1:30–1:50 | Reviewer decides what happens next | Return to author, reason, review draft, approve sending, receipt. |
| 1:50–2:00 | Close on current status and the business value | Return to overview. Show recorded response while the evidence gap remains open. |

## English script

### A · Current status · 0:00–0:15

“Your project has a compliance checklist. Its documents keep changing. How do you know where the review stands today?

Keel shows the current status of each checklist item, with the evidence behind it.”

### B · Baseline · 0:15–0:30

“Here is our example package. Eight previous verifications hold. Open an item to see its rule, supporting text, and who verified it.”

### C · Recheck and implementation · 0:30–0:55

“Now we upload a new version.

Bedrock reassesses the controls and uses Box AI to search for evidence across the package. Code checks the quotes against exact document versions. Box stores the documents and review tasks.”

### D · Explain the result · 0:55–1:15

“The overview updates: five verifications hold, three items need a person.

For encryption, the new document no longer supports the required key-management details. Here is the previous commitment, and here is the replacement.”

### E · Timeline · 1:15–1:30

“The timeline shows the earlier verification, when it continued to hold, and the file version that triggered this review.”

### F · Response · 1:30–1:50

“The reviewer returns this item to the author, checks the drafted task, and approves sending. Keel records the response against this version. The evidence gap remains open.”

### G · Close · 1:50–2:00

“Keel gives teams a current view of their compliance review, with evidence explaining every status.”

## 演示重点

- 主角是固定 checklist 和整体状态。原文对比解释其中一项为什么变化。
- 首页显示实际 API 标签 Hold / Need you / Recorded，不称合规通过率。数字必须来自运行结果。稿中的 8、5、3 是当前标准 fixture 流程的预期值，实际不同就照实际说。
- timeline 进入主流程，但只用 15 秒。指向以前谁验证、哪次文件更新触发复核即可。
- 每个 timeline 点对应文档包快照。同一快照内的人工作业会更新节点状态，完整操作在 audit record。不要描述为每次操作一个节点。
- 返回作者后，只减少已处理的 reviewer 待办。不要说问题已修复、全部合规或全部通过。
- 原因优先解释“当前文档证据不足”。缺少文字证据本身不能证明实际系统违反要求。
- 人工动作保留必要步骤，不称“一键完成”。只在 receipt 确认任务创建后说已发送。
- 不展开 checklist 的所有规则、完整 ledger、攻击防护或证据搬家案例。
- 主流程使用当前网页。底层验证逻辑和文档版本约束，在运行等待时用短句解释，避免另外讲一页架构。

## Readiness and rehearsal

This file plans the experience. It does not certify that every feature or live integration is ready.

- As of `3a0b91d` (merged to `main` Oct 17), the panel tiles, package and control timelines, rule-source chips and AGREED/CHANGED blocks are wired. The folder page opens on the project welcome screen: the frameworks checked against, a timeline scrubber that shows the status on any past date, and a Need you / Recorded / Hold board.
- The Box-style file preview, version menu and **Open in document ↗** highlight are wired from the panel. Highlight preview remains optional in the two-minute core.
- Confirm the mode before presenting. With mock adapters, say “This demo uses simulated integrations with the same review engine.” In section C, introduce the integration description with “In the live design”. Do not present simulated calls as live Box or Bedrock execution.
- The Box page is a replica. In mock mode describe it as “our Box replica”, not an installed native Box extension.
- Synthetic fixture and illustrative standard mappings only. Do not claim certification or production readiness.
- Before the demo, reset to the reviewed architecture v2 baseline. Rehearse the full upload and task path once, including wait time.
- If live timing is unreliable, use a verified recording and identify it as a recording.
- If a UI feature is unfinished, show a clearly labelled design still. Do not substitute a mockup for evidence of technical execution.

## Optional third minute

Only if the event actually gives three minutes:

1. Open the recovery item to show that evidence can move to another document and still support the checklist.
2. Show the actual cross-file citation and a named reviewer verifying the new binding.
3. Finish on the updated overview.

Keep this out of the two-minute core. If the event instead requires an architecture explanation, use the extra time for the actual run trace and clearly separate built components from proposed deployment.

## Team feedback

| Part | Feedback | Next revision |
| --- | --- | --- |
| Does the opening make compliance status the main value? | | |
| Does the run show enough technical execution? | | |
| Can a new viewer explain one status and its evidence? | | |
| Does the timeline add clarity within 15 seconds? | | |
| Can the full path finish in two minutes? | | |

## Sources

- [Hackathon context and judging weights](../docs/research/00-brief.md)
- [v4.1 team review decisions](../docs/research/51-ui-v4-1-team-review.md)
- [API contracts](../docs/CONTRACTS.md)
- [Timeline implementation](../app/src/lib/engine/history.ts)
- [Governing specification v3.4](../docs/research/30-design-v3.md)
