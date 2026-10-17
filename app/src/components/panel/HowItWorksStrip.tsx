"use client";

import { C } from "./parts";

/**
 * Six stacked boxes, one line each, cut from the architecture page (spec v3.4 section 8). A drawn wall stands
 * before Person: the machine cannot write past it. Built and proposed are small tags.
 */
type Box = { title: string; line: string; color: string; proposed?: string; side?: { title: string; line: string } };

const BOXES: Box[] = [
  { title: "Box files and versions", line: "Five files, pinned by version id and SHA-256.", color: "#0D7A8A", proposed: "Box Automate trigger" },
  { title: "Decider, local gate", line: "Strands Decider 2B checks injection and materiality, never status.", color: "#5F6B7A" },
  {
    title: "Strands agent on Bedrock",
    line: "Claude Sonnet 4.6, one call per snapshot, no write tools.",
    color: "#7A6F8E",
    proposed: "AgentCore Runtime",
    side: { title: "Box AI ask", line: "Multi-file search with citations." },
  },
  { title: "Code: validation, rules, ledger", line: "Quotes checked against pinned text; sixteen rules; hash chain.", color: "#9A9EA5", proposed: "DynamoDB ledger" },
  { title: "Box metadata and tasks", line: "Folder status fields, review tasks and author tasks.", color: "#0D7A8A", proposed: "Jira, ServiceNow IRM" },
];

function Tag({ kind }: { kind: "built" | "proposed" }) {
  return (
    <span
      className="inline-flex h-[18px] items-center rounded-[3px] px-1.5 text-[10px] font-bold uppercase tracking-[0.06em]"
      style={kind === "built" ? { background: C.greyBg, color: C.text } : { border: "1px dashed #B8B8B8", color: C.secondary }}
    >
      {kind}
    </span>
  );
}

function Arrow() {
  return (
    <div className="flex justify-center py-1" aria-hidden>
      <svg width="12" height="16" viewBox="0 0 12 16">
        <path d="M6 1v13M2 10l4 4 4-4" fill="none" stroke="#B8B8B8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

export function HowItWorksStrip() {
  return (
    <div className="px-5 pt-3 pb-6">
      <p className="mb-3 text-[13px] leading-[1.45]" style={{ color: C.text }}>
        Box holds the files. Bedrock judges, code keeps the record, and a person decides.
      </p>
      <ol aria-label="How Keel works">
        {BOXES.map((b, i) => (
          <li key={b.title}>
            {i > 0 ? <Arrow /> : null}
            <div className="flex gap-2">
              <div className="min-w-0 flex-1 rounded-[4px] border bg-white px-3 py-2" style={{ borderColor: C.border, boxShadow: `inset 3px 0 0 ${b.color}` }}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[13px] font-bold" style={{ color: C.text }}>
                    {b.title}
                  </span>
                  <Tag kind="built" />
                </div>
                <div className="mt-0.5 text-[12px] leading-[1.4]" style={{ color: C.secondary }}>
                  {b.line}
                </div>
                {b.proposed ? (
                  <div className="mt-1 flex items-center gap-1.5 text-[11.5px]" style={{ color: C.secondary }}>
                    <Tag kind="proposed" /> {b.proposed}
                  </div>
                ) : null}
              </div>
              {b.side ? (
                <div className="w-[118px] flex-none self-center rounded-[4px] border px-2 py-1.5" style={{ borderColor: "#6F4BC0" }}>
                  <div className="text-[12px] font-bold" style={{ color: "#6F4BC0" }}>
                    {b.side.title}
                  </div>
                  <div className="text-[11px] leading-[1.35]" style={{ color: C.secondary }}>
                    {b.side.line}
                  </div>
                </div>
              ) : null}
            </div>
          </li>
        ))}
        <li>
          <Arrow />
          <div className="relative py-1" aria-label="Wall: the machine cannot write past this line">
            <div className="h-[10px] rounded-[2px]" style={{ background: "repeating-linear-gradient(135deg, #3A3E44 0 4px, transparent 4px 8px)" }} aria-hidden />
            <p className="mt-1 text-[12px] font-bold" style={{ color: C.text }}>
              The machine cannot write past this line.
            </p>
          </div>
          <div className="mt-1 rounded-[4px] border px-3 py-2" style={{ borderColor: "#B9C6EC", background: C.blueBg, boxShadow: `inset 3px 0 0 ${C.blue}` }}>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[13px] font-bold" style={{ color: C.blue }}>
                Person
              </span>
              <Tag kind="built" />
            </div>
            <div className="mt-0.5 text-[12px] leading-[1.4]" style={{ color: C.text }}>
              The reviewer records the disposition through the Box task.
            </div>
          </div>
        </li>
      </ol>
      <p className="mt-4 text-[11.5px]" style={{ color: C.secondary }}>
        Built: in this build. Proposed: not built. The ledger is local in this build.
      </p>
    </div>
  );
}
