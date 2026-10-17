/** Content from spec v3.4 sections 7 to 11 (docs/research/30-design-v3.md). Positioning says "we did not find"; no competitor is named as unable. */

const COLUMNS: { title: string; color: string; items: string[] }[] = [
  {
    title: "What Box does",
    color: "var(--src-box)",
    items: [
      "Holds the package files and every version; Keel downloads by version id.",
      "Carries one folder-level metadata instance: snapshot id and one status field per control.",
      "Hosts the reviewer's task per finding and, after a return, the author's task, and returns the responding identity.",
      "Box AI ask, multi-file with citations, is the agent's cross-file search over the snapshot.",
      "Box AI text generation drafts the author task message; the reviewer sees it before it is sent.",
    ],
  },
  {
    title: "What AWS does",
    color: "var(--src-agent)",
    items: [
      "Claude Sonnet 4.6 on Bedrock is the single judge: one Strands agent, one call per snapshot, schema-validated per-clause output.",
      "The Strands agent loop and tools; read tools are constrained to the snapshot. No tool or output field writes a disposition.",
      "Strands Decider 2B runs locally as the input gate: a bounded decision with probabilities, never a status.",
      "Proposed production hosting: AgentCore Runtime, Identity and Observability.",
      "Proposed production ledger: DynamoDB with Streams to S3 Object Lock.",
    ],
  },
  {
    title: "What code does",
    color: "var(--src-app)",
    items: [
      "Snapshot manifest: file id, version id and SHA-256 for every file, plus the profile version.",
      "Prior-quote diff, and validation of every quote and Box AI citation against the pinned text.",
      "Staleness and per-tier materiality; the sixteen display rules.",
      "Append-only JSON ledger with a hash chain, local in this build.",
      "The disposition handler, with re-apply or explained rejection for stale actions.",
    ],
  },
  {
    title: "What a person does",
    color: "var(--src-human)",
    items: [
      "Records the disposition; only the human response handler can write it.",
      "Verifies only when every clause is supported on the current binding.",
      "Returns to the author with a reason and a due date.",
      "Acknowledges a changed evidence binding, severity Low.",
      "Is never the configured author of the evidencing file.",
    ],
  },
];

const BUILT: { name: string; note: string; color: string }[] = [
  { name: "Box content and versions", note: "five files, download by version id", color: "var(--src-box)" },
  { name: "Box folder metadata", note: "snapshot id plus one field per control", color: "var(--src-box)" },
  { name: "Box tasks", note: "reviewer and author, identity as returned by Box", color: "var(--src-box)" },
  { name: "Box AI ask and text generation", note: "search_snapshot with citations; author draft", color: "var(--src-boxai)" },
  { name: "Strands agent on Bedrock", note: "us.anthropic.claude-sonnet-4-6", color: "var(--src-agent)" },
  { name: "Strands Decider 2B", note: "local input gate", color: "var(--src-decider)" },
  { name: "Deterministic engine and local ledger", note: "append-only, hash chained", color: "var(--src-app)" },
  { name: "Next.js app", note: "package view, card, ledger, trace", color: "var(--src-app)" },
];

const PROPOSED = [
  "Box webhook to a Lambda URL",
  "EventBridge",
  "SQS FIFO per folder",
  "AgentCore Runtime and Observability",
  "AgentCore Identity",
  "DynamoDB ledger, Streams to S3 Object Lock",
  "ServiceNow IRM",
  "Jira",
  "Box Automate trigger",
  "Batch shadow evaluation",
];

const READINESS: { title: string; items: string[] }[] = [
  {
    title: "Built",
    items: [
      "Snapshot-bound evaluation",
      "Evidence-binding staleness with per-tier materiality",
      "Machine and human fields separate, with published display rules",
      "Per-clause support",
      "Quote validation with disclosed normalization",
      "Every evaluation recorded",
      "Model id, MRM model id and prompt version on every event",
      "Folder projection with snapshot id",
      "Reviewer identity from Box's task response",
      "Stale-action re-apply or explained rejection",
      "Configured reviewer and author for the synthetic folder",
    ],
  },
  {
    title: "Product work, proposed, in order",
    items: [
      "Author routing to Jira",
      "Not applicable with second-reviewer approval",
      "Compensating control",
      "Exception record and IRM mirror",
      "Batch mode for shadow evaluation",
      "Completeness reconciliation against Box's version list",
      "Production ledger and integrity controls",
      "Webhook trigger and AgentCore hosting",
      "Diagram and image reading",
    ],
  },
  {
    title: "Bank-owned gates, in order",
    items: [
      "Data-classification decision for sending Confidential documents to Bedrock",
      "Model risk intake and MRM model id",
      "ARB role validity and project membership from the directory",
      "Source-permission enforcement on quotes shown",
      "TPRM review of the vendor",
      "Metadata template governance on the Box tenant",
    ],
  },
];

const POSITIONING = [
  "Box Automate fires on upload, runs AI steps, routes approvals, iterates over files, and keeps run history. Keel does not rebuild it. We did not find a documented native version-bound control-evidence ledger with re-review rules; Keel adds that to a Box workflow. The proposed production trigger is Automate calling Keel.",
  "Continuous-compliance platforms test infrastructure through APIs and review uploaded documents as evidence, some with AI checks of adequacy. We did not find one that tracks a control's supporting clauses inside design documents across versions and binds the reviewer's response to those versions. That selected transaction is what Keel does.",
  "Approval and \"changed since approval\" tools record who approved which version and that a page changed. Keel adds which control lost which clause, whether support survives elsewhere in the package, which verifications still hold, and binds the reviewer's response to that exact evidence.",
  "For AWS judges: the model never owns state. Sonnet 4.6 proposes a per-clause assessment with quotes against a pinned snapshot; Strands Decider 2B gates untrusted input locally with a bounded decision, not generated text; code validates, records, applies staleness and materiality, and enforces that only a person records a disposition.",
  "For Box judges: Box AI is how the agent reads the rest of the package. Every cross-file search is a Box AI ask with citations, validated against pinned versions, and the author's task is drafted by Box AI. Automate is the proposed trigger; Box AI is in the loop; Box Metadata and Tasks are where the result lands.",
];

const SCRIPT: [string, string, string][] = [
  ["0:00", "Approved design evidence can change. Keel shows which control needs another look, and who reviewed which version. This is a synthetic bank example.", "Title, tagline, mode label"],
  ["0:15", "Lantern's package passed the review board on October 7. Eight controls across five documents, each verified by a named reviewer against these exact file versions.", "Package view, eight rows Verified, snapshot S2"],
  ["0:40", "The project submits a rewritten architecture document. Keel pins all five files, Decider clears the text as safe and material, and the agent re-checks all eight controls, asking Box AI whether the other four files say anything about customer-managed keys.", "Real upload; trace with application, Decider, Box AI, and agent events, coverage, elapsed time"],
  ["1:05", "Five verifications hold: the evidence is unchanged, so nobody clicks anything. One needs a glance: the sentence is still there, but the section around it was rewritten, and that control is High tier. Two need a look.", "Package view on S4: five Verified holds, one Acknowledge, one Low, one Critical"],
  ["1:15", "The reviewed text named customer-managed keys. The rewrite only says all data is encrypted. Encryption is still stated; the key-management commitment is gone. Box AI searched the other four files with citations: nothing.", "Finding card, two quotes, word diff, clause marks, \"Needs review: key-management evidence missing\""],
  ["1:35", "Recovery targets left this document too, but they are here in the runbook. That is a changed evidence binding, not lost support. A thirty-second acknowledgment, severity Low, not an investigation.", "SEC-ARCH-22 row, runbook quote and version"],
  ["1:45", "Reviewer, first person: \"The machine told me where to look. It did not tell me what to decide. I am returning this to the author with the sentence that disappeared, the requirement it has to meet, and a due date of October 23. That is recorded against these exact file versions, under my name and role. Verify is disabled for me too, because no document in this package supports the key model. When v4 lands, Keel re-checks, and I review one paragraph. What you see on this card is what the ledger says I saw when I decided.\"", "Box task completed in a pre-opened tab; Keel shows responding identity, reason, author task id, binding check, ledger event; row reads \"Returned to author, open\"; the author's task appears as the first block in the card's thread"],
  ["2:15", "Every evaluation is recorded, including the five where nothing changed. The export covers what Keel observed. Complete audit coverage needs reconciliation, which is pilot work.", "Ledger, export with counts from the run and the limitation line"],
  ["2:30", "Box holds the files, the metadata, and the tasks, and Box AI is how the agent reads the package. Bedrock judges. Decider gates the input locally. Code validates quotes and records history, locally in this build. The machine has its field, the reviewer has hers, and the machine cannot write to hers.", "Three-box strip with Box AI and Decider placed, built versus proposed separated, local ledger named"],
  ["2:45", "Next: a shadow evaluation over fifty historical packages, measuring misses, false alerts, and review time.", "One line"],
  ["2:50", "Know what changed, and who reviewed that exact evidence.", "Title, tagline, final evidence pair"],
];

export function ArchitecturePage() {
  return (
    <div className="mx-auto max-w-[1360px] px-6 lg:px-10 pt-8 pb-16">
      <div className="eyebrow mb-2">Architecture</div>
      <h1 className="text-[28px] font-semibold tracking-[-0.025em] text-ink">Box answers, Bedrock judges, Decider gates, code owns state, a person decides</h1>

      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {COLUMNS.map((c) => (
          <section key={c.title} className="panel p-4">
            <h2 className="flex items-center gap-2 text-[15px] font-semibold text-ink">
              <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: c.color }} aria-hidden />
              {c.title}
            </h2>
            <ul className="mt-3 space-y-2 text-[13.5px] leading-[1.5] text-ink-2">
              {c.items.map((i) => (
                <li key={i} className="flex gap-2.5">
                  <span className="mt-[8px] h-1 w-1 flex-none rounded-full bg-[var(--faint)]" />
                  {i}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <section className="mt-10">
        <div className="flex items-baseline justify-between">
          <h2 className="text-[17px] font-semibold text-ink">Built and proposed</h2>
          <span className="text-[12.5px] text-muted">solid: built in this build · dashed: proposed, not built</span>
        </div>
        <div className="mt-3 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
          {BUILT.map((b) => (
            <div key={b.name} className="rounded-[10px] border border-line-strong bg-panel px-3.5 py-3" style={{ boxShadow: `inset 3px 0 0 ${b.color}` }}>
              <div className="text-[13.5px] font-medium text-ink">{b.name}</div>
              <div className="mt-0.5 text-[12px] text-muted">{b.note}</div>
            </div>
          ))}
        </div>
        <div className="mt-2.5 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-5">
          {PROPOSED.map((p) => (
            <div key={p} className="rounded-[10px] border border-dashed border-line-strong px-3.5 py-2.5">
              <div className="text-[13px] text-ink-2">{p}</div>
              <div className="mt-0.5 text-[11px] font-medium uppercase tracking-[0.06em] text-faint">proposed</div>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-[17px] font-semibold text-ink">Readiness</h2>
        <div className="mt-3 grid gap-4 md:grid-cols-3">
          {READINESS.map((r, idx) => (
            <div key={r.title} className={`rounded-[10px] p-4 ${idx === 0 ? "panel" : "border border-dashed border-line-strong"}`}>
              <h3 className="text-[14px] font-semibold text-ink">{r.title}</h3>
              <ol className="mt-2 space-y-1 text-[13px] text-ink-2">
                {r.items.map((i, k) => (
                  <li key={i} className="flex gap-2">
                    <span className="mono text-[11.5px] text-faint w-5 flex-none pt-px tabular-nums">{idx === 0 ? "·" : k + 1}</span>
                    {i}
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <div>
          <h2 className="text-[17px] font-semibold text-ink">Measured and claimed</h2>
          <p className="mt-2 text-[14px] leading-[1.6] text-ink-2">
            One synthetic probe during research caught a planted removal on a 7-page document with 12 controls in 10 to 17 seconds of
            model time, under a different inference profile and region. It is quoted as that and nothing more. The full
            upload-to-display path is measured during rehearsal, and the number shown on screen is the number from the run.
          </p>
        </div>
        <div>
          <h2 className="text-[17px] font-semibold text-ink">Positioning</h2>
          <div className="mt-2 space-y-2.5 text-[14px] leading-[1.6] text-ink-2">
            {POSITIONING.map((p) => (
              <p key={p}>{p}</p>
            ))}
          </div>
        </div>
      </section>

      <section className="mt-12">
        <div className="flex items-baseline justify-between">
          <h2 className="text-[17px] font-semibold text-ink">The three-minute script</h2>
          <span className="text-[12.5px] text-muted">synthetic data throughout, stated at the start</span>
        </div>
        <div className="mt-3 panel overflow-hidden">
          <table className="w-full text-[13.5px]">
            <thead className="bg-panel-cool">
              <tr className="text-left">
                <th className="eyebrow px-4 py-2.5 w-16">Time</th>
                <th className="eyebrow px-4 py-2.5">Narration</th>
                <th className="eyebrow px-4 py-2.5 w-[34%]">On screen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--line)]">
              {SCRIPT.map(([t, n, s]) => (
                <tr key={t} className="align-top">
                  <td className="px-4 py-3 mono text-ink">{t}</td>
                  <td className="px-4 py-3 text-ink-2 leading-[1.55]">{n}</td>
                  <td className="px-4 py-3 text-muted leading-[1.5]">{s}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[12.5px] text-muted max-w-[90ch]">
          Fallback at 1:45 if author task creation is unavailable: the reviewer confirms the key-management gap in Box with her reason; it
          is recorded against these versions; the gap stays open; routing to the author is proposed. Fallback for the live run exceeding
          its rehearsed window: labelled replay of the real run with its run id.
        </p>
      </section>
    </div>
  );
}
