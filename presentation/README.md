# Keel presentation · draft 01

Working draft for team feedback. Target: 2 minutes, including the demo.
Audience assumption: Box + AWS hackathon judges. English delivery, Chinese rehearsal notes.
Demo target: v4.1 on `feat/keel-app`. UI work is still in progress.

## One message

Keel finds when a document update removes evidence behind a previous review, and brings the exact change to the reviewer inside the Box workflow.

## Running order

| Time | Purpose | Screen / action |
| --- | --- | --- |
| 0:00–0:20 | Make the problem concrete | Opening slide: Keel. Subtitle: “Files have versions. Review evidence should too.” |
| 0:20–0:35 | Establish the earlier review | Box folder replica. Show architecture.md v2 and the existing review. |
| 0:35–0:55 | Trigger the change | Upload architecture.md v3. Let the owl show progress, then open the panel. |
| 0:55–1:20 | Show the missing commitment | Open Encryption and key management. Prior verified quote above the new sentence. |
| 1:20–1:45 | Show the human response | Return to author. Enter a reason, review the generated task, approve sending, show the receipt. |
| 1:45–2:00 | Explain the build and close | Closing slide with a short build explanation and the value statement. |

## Spoken script

### A · Problem · 0:00–0:20

“A security reviewer approves a design. The next day, someone rewrites it. The document still says ‘encrypted,’ but the details the reviewer approved are gone. Who notices?

Keel tracks the evidence behind that review as documents change.”

### B · Existing review · 0:20–0:35

“Here is our example project in Box. Priya reviewed version two. It specifies customer-managed keys, annual rotation, and named key custodians.”

### C · Update · 0:35–0:55

“Now we upload version three. Keel checks the updated package against the earlier review and flags the controls that need a person.”

### D · Evidence · 0:55–1:20

“Open this finding. Here is the commitment Priya verified. Here is the replacement: ‘industry-standard encryption.’

The key-management details disappeared. Keel checks the other files too, because evidence could have moved. In this example, it finds no supporting citations elsewhere.”

### E · Human response · 1:20–1:45

“The reviewer returns it to the author. Keel drafts a task explaining what needs evidence. The reviewer checks it and approves sending.

The record shows who acted, on which document version. The missing evidence still needs the author’s response.”

### F · Build and close · 1:45–2:00

“Bedrock assesses the evidence. Code validates the quotes against exact file versions. Box holds the review tasks.

Keel helps reviewers catch what a rewrite leaves behind.”

## 演示备注

- 约 240 个英文单词。先排练一次，给上传、打开卡片和任务操作留出停顿。
- 开场只用一张简洁标题页，随后直接进入产品。收尾可用一张静态页。先讨论脚本，再制作 slide 文件。
- 重点停在原文对比。读出 customer-managed keys 和 industry-standard encryption 的差别即可，不逐条解释 control。
- 规则出处只显示为小标签。数字卡片帮助定位待办，不逐个解释计数。
- 主流程只处理 encryption 一项。其他 finding、证据搬家、时间线、完整 ledger 留在问答。
- Return to author 需要填写理由、检查草稿、批准发送。演示保留这些步骤，不称“一键完成”。
- 看到任务创建成功的 receipt 后，才说任务已经发送。退回作者表示已记录处理决定，不表示缺口已修复。
- 新的 AGREED / CHANGED 布局若未准备好，可使用现有 WAS / NOW 原文对比完成同一故事。
- 原文高亮预览是可选加分项，不放进两分钟的必经路径。
- 若运行等待过长，切换到事先录制并核对过的同一流程，明确告诉观众在播放录屏。

## 演示前核对

- 明确所用模式。若使用模拟适配器，口头说明：“This demo uses simulated integrations with the same review engine.” 不把 replica 描述成原生 Box 插件。
- mock 模式下，B 段首句改为：“Here is our example project in our Box replica.” F 段讲设计分工，并说明当前演示使用模拟集成。
- live 模式下，先确认真实 Box 上传、Bedrock 调用和任务创建，再使用主讲稿中的现在时描述。
- 演示数据是 synthetic。规则来源及框架映射是示例，不能称已获官方认证。
- 上传前重置到 architecture v2 的既有审核状态。
- 确认生成任务的目标作者和 receipt 与实际结果一致。
- 标题、结束页和录屏还未制作。本文件是供反馈的第一版讲述与操作设计。

## 第一轮反馈位置

| Segment | Team feedback | Next revision |
| --- | --- | --- |
| A · Problem | | |
| B–C · Setup and upload | | |
| D · Quote comparison | | |
| E · Return and receipt | | |
| F · Build and close | | |

## Source references

- [v4 interaction design](../docs/research/50-ui-v4-box-owl.md)
- [v4.1 team review decisions](../docs/research/51-ui-v4-1-team-review.md)
- [Engine and adapter contracts](../docs/CONTRACTS.md)
- [Governing specification v3.4](../docs/research/30-design-v3.md)
