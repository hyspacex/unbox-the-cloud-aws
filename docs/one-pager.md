# One-Pager: Epistemic Review & Context Governance for Agent-Native Cloud Storage

**One-Sentence Problem:** As AI agents make generating 10-page documents effortless, enterprises are drowning in plausible-looking prose where reviewers waste hours hunting for the few unverified assumptions that actually break—while unexamined AI filler piles up in cloud storage and silently poisons every downstream agent that reads it.

# 1. Context & The Enterprise Paradox

Documents at work are now co-authored, read, and critiqued by humans and AI agents together, yet cloud storage (Box, OneDrive) still treats files as static text blobs behind a share link. While 80% of workers feel more productive with AI, only 37% of enterprises see EBIT impact (McKinsey). The bottleneck did not disappear; it moved from writing to reviewing. Today, 87% of knowledge workers lack capacity to coordinate and review work, creating a $161B/year fragmentation tax in the Fortune 500 (Atlassian). AI-assisted "workslop" shifts cognitive load from writer to reader, costing ~2 hours of rework per instance and forcing 77% of professionals to scrutinize AI-assisted drafts more carefully than human writing. With 90% of corporate data unstructured and Box projecting 100 agents per employee treating files as their native unit of work, only 21% of enterprises have mature agent governance (Deloitte).

# 2. Diagnosis: Why Human Review Cannot Be Automated Away

Five years ago, a 10-page system design or strategy doc was proof of work; today, 50 words of genuine human conviction can be inflated into 4,000 words of confident AI boilerplate in 30 seconds. Fluency is now decoupled from rigor. Reviewers cannot tell which paragraphs the author actually stress-tested and which are unexamined filler. Autonomous review bots cannot replace human reviewers for three reasons:

1. **The Private Context Gap:** Reviewers hold private 1:1 notes, unshared docs, and tacit constraints that neither the author nor a shared agent can see—and authors will never share their raw prompts or messy agent traces.
2. **The Seniority Gap Lives in the Questions:** A writer (and their agent) only answers questions they knew to ask. Senior reviewers don't read linearly; they interrogate documents using their own agents to research industry best practices and test "what-if" scenarios the writer missed.
3. **Judgment, Taste, and Repository Poisoning:** Models cannot own high-stakes trade-offs. Worse, when unreviewed AI filler sits in a Box folder, downstream agents reading that folder via MCP or RAG treat unverified boilerplate as ground truth, compounding errors across future documents.

# 3. Tenets & The Four-Role Governance Model

**Tenets:** (1) Zero author friction—never require prompt or trace sharing. (2) Amplify reviewer inquiry, don't force a rigid workflow. (3) Govern claims, not just file access.

| Role | Workflow Ownership | Governance Responsibility |
| --- | --- | --- |
| **Human Writer** | Owns core intent and explicit trade-offs. | Resolves challenged claims when flaws are exposed. |
| **Agent Writer** | Expands intent into structured prose. | Emits prose tagged by default as Unexamined surface area. |
| **Agent Reviewer** | Collapses boilerplate; runs external research and private-context checks for the reviewer. | Executes strictly under the Reviewer's permissions; strips private file sources before posting feedback. |
| **Human Reviewer** | Supplies the line of inquiry, senior judgment, and taste. | The sole actor authorized to upgrade a claim from Unexamined to Human-Verified (or Challenged). |

# 4. The Customer Experience (End-to-End in 3 Minutes)

- **Act 1 — Signal View (De-Slopping the Doc):** Opening a 12-page doc in Box and toggling *Signal View* dims 80% of connective boilerplate into thin accordions, leaving only the 5–7 **Load-Bearing Claims** at full brightness. Each claim displays a live Box Metadata badge: *Grounded in Folder*, *Unexamined Bet*, or *Private Context Conflict* (visible only to the reviewer when a claim contradicts their private Box notes).
- **Act 2 — The Inquiry Workbench (Orchestrating the Claude Code Loop):** Clicking an *Unexamined Bet* opens an inline workbench. The reviewer clicks a suggested blind-spot question or types their own probe (*"Compare this replication model against industry burst benchmarks and my private Q3 latency notes"*). Their Agent Reviewer fetches external evidence alongside their private note. The reviewer adds their judgment and clicks **Post Challenge**—automatically stripping private source citations while pinning a structured Challenge Card (*Question -> Evidence -> Verdict*).
- **Act 3 — Governed Folder Context (Stopping Slop Propagation):** When the author updates the doc and the reviewer approves, Box Metadata flips that claim from Challenged to Human-Verified. At the folder level, files display a *Verification Ratio* (e.g., 90% Verified vs. 85% Unexamined Prose), and a governed Box MCP endpoint serves Human-Verified claims as ground truth while quarantining Challenged claims from downstream agents.

# 5. Scope Boundaries (What We Explicitly Reject)

We do not build **vague readiness scores**, **approval/sign-off queues** (a process problem, not a context problem), **review-time precedent bots** (belongs at authoring time), **stakeholder-proxy bots** (reviewer context isn't public), **author decision ledgers** (authors won't share traces, and it misses unasked reviewer questions), or **"chat with your PDF" sidebars**.
