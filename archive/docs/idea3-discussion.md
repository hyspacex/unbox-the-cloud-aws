# Idea #3 discussion: AI-routed compliance checklists with a document timeline

Source: voice memo "NE 50th St.m4a", 10 min 06 s, recorded Oct 16 2026.
Transcribed with Amazon Transcribe (zh-CN + en-US multi-language, 3-speaker diarization).
Speaker identities were not stated on the recording. Labels below are by role in the conversation.

| Label | Role in the conversation | Talk time |
| --- | --- | --- |
| Speaker A (spk_0) | Proposer of Idea #3. Drives the pitch, resists scope growth. | ~55% |
| Speaker B (spk_1) | Skeptic and clarifier. Pushes for the self-evolving template, worries about overlap with Box's own demo and with Idea #2. | ~25% |
| Speaker C (spk_2) | Systems thinker. Reframes the idea as "route a file to the right fixed workflow". | ~20% |

Numbering used on the recording: **#1** = Epistemic Review (one-pager), **#2** = agreement drift / EpistemicBox, **#3** = this idea.

## The idea in one paragraph

A user uploads a document or a package of documents to Box. AI classifies what the package is (an onboarding packet, a design doc, a security review) and routes it to the matching checklist of fixed, admin-configured criteria. Each criterion is checked deterministically against extracted metadata, and the result is recorded in an audit trail. Because the criteria are fixed, the system can replay the file history as a timeline, "like a movie": drag through time to see when each criterion became satisfied and when a decision changed. An admin can configure which checklists exist and what they check. Pitch line from Speaker A: "you can configure anything, so we cover everything."

## Organized English summary

### 0:00 to 1:30. The pitch

- **A:** Start with the Box demo case: a user must upload a utility bill, a driver's license, and so on. The AI metadata is fixed, so the system can tell whether each required document is present. Upgrade that: a user uploads a package, the system recognizes "this looks like onboarding", goes into the onboarding flow, and checks whether all documents are there. Users can re-upload repeatedly and an audit shows whether criteria are met.
- **B:** How are the criteria determined in the first place?
- **A:** From an existing source, for example the user handbook says what is mandatory.
- **B:** Isn't this the same as the demo we saw, the one where someone uploads a driver's license?
- **A:** That is one case among many on our side.
- **C:** Does every document get checked against the handbook, or against other things too? Is the handbook check one workflow and other checks other workflows?
- **A:** Everything in the enterprise needs checking against something. Come back to the audit trail: because the things to check are fixed, you audit better and check history better. Example: create an Idea Template or Project Template. For a design doc, the design scope checks whether the architecture decision is right.
- **C:** So every project and every level has its own template.

### 2:00 to 3:15. Self-evolving template versus a timeline

- **B:** Let me restate. The first time, the template is generated from what already exists. Each time a human reviews, the template learns from that. The goal is that eventually no human is needed, because the template has purified itself, and anything uploaded to Box is checked automatically. Is that the idea?
- **A:** That is one idea. But cooler for the demo: throw the example in, show it auto-checks, then take a document with file history and turn it into a timeline, like a movie. Because the criteria are fixed, you can drag along the timeline and say "on this day, this changed, this decision changed."
- **B:** Doesn't that bring us back to Idea #2?
- **A:** It combines with it.

### 3:20 to 5:35. What is the relationship to #2 and the Idea Template?

- **B:** How does this relate to the Idea Template in #3? Everyone, can we use numbers?
- **C:** Which one is #2?
- **A:** #2 is the one we just discussed. #3 does relate, because you are taking your criteria and ...
- **B:** But the history in #3 is the template package itself?
- **A:** Right, it is the template. Making it self-evolving is too hard.
- **B:** Concrete example, and we are absolutely not inventing a #4. We have a design doc. On first upload the tool generates a checklist from past material: you must have X, Y, Z. The user opens it and sees "I believe there are 5 criteria for this kind of doc, 4 are met, the 5th is not." Then during review people notice another consideration is missing, ask why it was not considered, agree it should be, and at that moment the template adds it on its own.
- **A:** That is two directions. You cannot have one thing that only grows, because you add, delete, and change criteria. So compliance has to be fixed.
- **B:** Fine. Then some criteria are basic and mandatory for every doc, and the rest are optional or suggested. In a design doc I think this part is important.

### 6:00 to 7:40. Scope cut and the two-demo plan

- **A:** Do not add the self-evolving part, it is too hard. My plan: Demo 1, drop a package in, it is recognized as onboarding, a history trail shows when each photo was uploaded. Demo 2, drop our design document in, it has history, show when which designs were added and the moment everything became compliant.
- **C:** So we are just running a big pile of planned workflows?
- **A:** Some number of them, to satisfy the workflow idea.
- **B:** Then what is the point of the timeline? What is on it, different file versions?
- **A:** File versions or file history.
- **C:** So each time a user drags a photo in, that is a checkpoint, because the checkbox gets ticked.
- **A:** We should separate concerns. The hard part is how you merge the drill-down.
- **C:** So: we have 100 workflows, and the only decision is which 10 this file should run. Those 10 are fixed. If you have the onboarding checklist, or the idea checklist, the file gets matched to it.

### 7:45 to 8:50. Representation and the "isn't this #2?" moment

- **A:** I do not know if Box has a URI for this. Maybe you paste a URL and the project history appears below it. Maybe it does not need a Box representation at all.
- **C:** So we have 10 fixed workflows, every uploaded file runs them, and they are nailed down.
- **A:** Yes, compliance has to be nailed down. Then we say it is configurable: an admin configures what each workflow checks, the system checks the document history for when each was satisfied, and a button shows where in the document it was satisfied.
- **B:** Isn't that exactly what is on page 2 (Idea #2)?
- **C:** Yes, it is that one.

### 8:50 to 10:06. Verdict on the three ideas and close

- **B:** My worry with #1 is still that it is too vague. #2 sounds easier but a bit too simple.
- **A:** For #3, once a package is in, we can show its history, and it automatically recognizes which approval flow it belongs to.
- **C:** If I upload onboarding, it knows it is onboarding and applies those 5 checks.
- **B:** It matches to the template with the 5 items.
- **C:** If it is a design doc, it says do not run those 5, run these 10.
- **A:** Security review also has a checklist you must satisfy. Have AI generate something simple, we demo it, and the message is "you can configure anything." That way we cover everything. OK.

## Decisions and open points on the recording

Agreed:
- AI classifies an upload and routes it to a fixed, admin-configurable checklist.
- Checks are deterministic. Results go into an audit trail.
- Show a timeline over file history of when criteria became satisfied.
- Three example checklists: onboarding packet, design doc, security review.
- No #4.

Not agreed:
- Self-evolving template (B wants it, A says too hard and that criteria must stay fixed for compliance).
- What the timeline actually represents and why it matters (B asked twice, A answered "file versions or history").
- Whether #3 is distinct from #2 (B and C both said it collapses into #2's Project Template).
- Whether this is distinct from Box's own driver's-license extraction demo (B raised it, A said it is one case of many).

## Raw transcript (Mandarin with English terms, machine output, lightly merged)

Timestamps are mm:ss from the start of the recording.

[00:00] spk_0: 啊我上传呃，叫什么BILL我必须上传这几个，然后它的AI metadata是fix的，它它只能说这个Document的上传了这个才能呃我我我的都check了没有，然后在这个可以升华一下，我们可以有更的说我们这个Pro用户上传一个package，他就自己能的说，噢，这看起来像一个onboarding。我就去onboarding flow里头去找它所有的document的够不够，然后它可以一遍一遍地上传，然后我们有audit可以去它这个呃满足不满足这，那

[00:43] spk_1: 你这个最早是怎么确定的呢？

[00:45] spk_0: 就最早就是说我们去，比如说user handbook里头说我们必须要。这这样就是说白了就是他的想法就是说这个是呃

[01:03] spk_1: 这不跟他那个demo是一样的吗？那个人上传驾照上传那个对

[01:08] spk_0: 啊，他那个是其中一个我们这边，

[01:11] spk_2: 但是那是不是所有的doc都是要check with handbook，还有什么要check with other things

[01:17] spk_0: 我觉得everything in enterprise everything都需要check with，

[01:22] spk_2: 然后那check with handbook是不是一个workflow，那其他的我们还得

[01:26] spk_0: 回到这个audit的trail上，就是说你。因为你有fix的things need to check你就更好audit你就更好去check history，你比如说我们可以建一个Idea template project template，然后你的Design，我们的design scope里就要check说你的architecture decision对不对？你的呃架构对不对？什么的。

[01:52] spk_2: 每个project每个level都有他的自己的

[01:55] spk_0: 对，这样这样你的的时候，你就有一个

[02:01] spk_1: 的，所以你是一个的一个，对，然后它是第一次的时候是根据你已有的这个去自己，然后你每一次，要有人工，是这个意思吗？然后人工之后，这些也会自我根据这些自我感应。然后你希望达成的一个目标就是到后来的话，你不需要人工了，因为这个已经足够完善。然后你不管你从往box里面上传或者什么样也好，他会自己用这个非常已经自我净化的这样一个去check。

[02:39] spk_0: 这也是一个想法，但我觉得可能更酷的是，就比如说先demo的时候，就是先把他的那个example扔进去，然后他说可以自动check，然后我们再弄一个documents，用那个比如说file history，然后啪扔进去，直接把这个变成一个timeline，像电影一样。你可以选什么时候decision变了什么时候你要check的，因为我们是fixed criteria去check然后我们就可以drag这个说在这一天这个时间这个时间什么什么change idea change

[03:16] spk_1: 这个不又回到我们第2个那个对，我

[03:18] spk_0: 就说就是结合到我们就这个更

[03:23] spk_1: 那这个和我们第3个那个idea template有没有什么关系，

[03:28] spk_2: 我能不能用数字，第2个是哪个，

[03:31] spk_0: 第2个就是我们刚才讨论的那个嘛，

[03:38] spk_0: 觉得第3个有啊，就是因为，因为你就其实就是把你的能

[03:46] spk_1: 出来。但是你的第3个里面的history是这个template包，

[03:52] spk_0: 对，没错，是template。因为因为你要做一个太难了。我我认为就是你可以的这个idea，你可以说我们有一个可以去，这个是一个。

[04:11] spk_1: 所以我举个具体的例子，我们现在说第3个，我们坚决不要再搞出第4个，啊，比如说我们现在有一个design doc。我们第一次上传之后，这个工具根据我们以往的这个什么东西也好，自己生成了一套这个，比如说你必须要有，你必须要有，你必须要有是吧？好，然后完之后。这个user打开这个的时候，上面写啊，这是我认为根据我们的这个的只有5个，然后这其中满足了4条第5项不满足，然后大家照样review，因为完之后，大家发现，哎，除了这个，除了我们还要考虑，然后我们说你为什么没有考虑什么东西，然后最后完之后，大家同意应该被考虑。然后这个时候template开始自己，就把加进去。

[05:21] spk_0: 是两个方向，你没法一个东西，它一直，因为有可能你会删东西，你会加东西，你会改东西。所以compliance就是说我们要一个fixed，这是两个方向，

[05:35] spk_1: 可以，对啊，就是，就像我刚刚说的这些东西，这可能是basic，就是每一个都要有。是吧？或者说你拿到给说，他就需要这些东西，所以这些变成了mandatory的一个部分，就是他一定要有。那还有剩下的可能是optional的部分。是吧？就比如说我觉得在我们这个design doc里面，我觉得这一点很重要，那我

[06:01] spk_0: 这个这不应该加到这个，因为这个太难了。嗯。我的想法就是说，哎，这个有一个有一个的地方，你把这个扔进去，他就认定为哦这个可能是onboarding，然后有一个history of trail，什么时候upload的照片，什么时候upload的，然后所有。OK，这是一个demo，然后第二个demo把我们design document扔进去，然后design document里头有history，然后什么时候增加了哪些design，然后到了哪一刻所有东西都comply了，

[06:37] spk_2: 那我们是不是就是在run一大堆的planned workflow

[06:43] spk_0: x number就是为了我们去满足他workflow的这个想法，对吧？

[06:48] spk_1: 那这个timeline的意义在哪里？就是就是

[06:51] spk_0: visual。然后告诉你有一个，

[06:55] spk_1: 那是什么呢？是不同的file version，

[06:58] spk_0: 我想就是可能是file version或者是file history啊，

[07:02] spk_2: 这是不是就是比如说用户一个照片拖进去，那第一个照片拖进去的时候就是一个checkpoint，因为第一个那个checkbox弄好了，然后他再拖下去，还有那个或者，

[07:15] spk_0: 我觉得我们应该分开，就是说。在drill down the specific，你怎么去merge这个，

[07:24] spk_2: 所以是不是我们有比如说100个workflow，然后我们现在只是说这个文件应该选其中哪10个去run，然后那10个workflow都是fixed。就是你有onboarding的那些checklist，如果你有idea的checklist就是你在checklist他的队伍里面，

[07:44] spk_0: 我想说就是我不知道box有没有那种的URI，可能是这个URL一paste进去，然后下面就可以，可能甚至都不需要有box representation，就是反正就是你打开这个project，下面就直接这个project的history，

[08:04] spk_2: 那我们现在比如说就是有10个fixed的workflow，每一个上传的文件都跑这10个workflow，这10个workflow都是钉死的

[08:12] spk_0: 对啊，那compliance不就得钉死吗，然后我们就说这个是configurable，然后还有个admin，你可以configure这个workflow是什么样，你要check哪些，然后他就根据你的document history去check有没有那些在什么时候满足的，然后你可能再弄点什么按钮一点这个说这个document是在这个地方满足的，

[08:35] spk_1: 那不就是P2上的那个，

[08:37] spk_2: 对对，就是那个，而且他这个从presentation的角度对，

[08:51] spk_1: 第一个我担心的又回到第1个，我担心的就是这个太vague是吧。第2个虽然比较好做，但是听上去有点太简单了。

[09:06] spk_0: 这个就有一个就是把这个package丢进去之后。我们就可以弄些上传这个history是这样的，然后它自动的，比如说，自动认定是这是哪个流程的审批，OK

[09:28] spk_2: 就是比如说如果我上传一个onboarding的话，它会认为这是onboarding，所以他要的5条，

[09:36] spk_1: 它会match到那个template，然后那个里面有5个，

[09:42] spk_2: 然后如果是design的话就说，哎，你不应该跑这5条，你应该跑那10个。

[09:46] spk_0: 因为security review其实也是有checklist，你必须得满足

[09:51] spk_2: 这些，看着的security。

[09:55] spk_0: 你就让AI生成一点简单的，我们就demo一下，大概意思就是你可以configure任何，这样我们直接通吃了。OK。

Notes on the raw text: a few words were corrected where the English term was obvious from context (workflow, handbook, template, metadata, demo). At 08:51 the engine heard "好笑" (funny); from context the speaker most likely said "好做" (easy to build). Speaker B's "P2" at 08:35 refers to Idea #2.
