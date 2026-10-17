/**
 * UI v4: the owl's speech bubble for a trace step (design doc 50, section 2.3). Pure: computed from
 * the step's kind and its recorded detail, label, args and result, never typed per run. At most
 * twelve words. Applied at emit time and again when stored runs are read, so old runs replay with bubbles.
 */
import type { TraceStep } from "../types";
import { capWords } from "./display";
import { bannedWords } from "./wording";

export const BUBBLE_MAX_WORDS = 12;

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const num = (re: RegExp, s: string | undefined): number | undefined => {
  const m = s ? re.exec(s) : null;
  return m ? Number(m[1]) : undefined;
};

/** Box AI (or its string-search fallback) tool substep of the agent's search_snapshot tool. */
export function isSearchStep(step: Pick<TraceStep, "kind" | "tool" | "args">): boolean {
  const a = obj(step.args);
  return step.kind === "tool_call" && (step.tool === "box_ai_ask" || step.tool === "string_search" || step.tool === "search_snapshot" || a.agent_tool === "search_snapshot");
}

function bubbleText(step: TraceStep): string {
  const d = obj(step.detail);
  const label = step.label ?? "";
  switch (step.kind) {
    case "file_version_observed": {
      const ch = (d.changed as { fileName?: string; label?: string }[] | undefined) ?? [];
      if (ch.length === 1) return `New version seen: ${ch[0].fileName}${ch[0].label ? ` ${ch[0].label}` : ""}.`;
      return ch.length ? `${plural(ch.length, "new version")} seen in the folder.` : "Checking the folder for new versions…";
    }
    case "snapshot_captured": {
      const n = (d.files as unknown[] | undefined)?.length ?? num(/(\d+) files?/, label);
      return n !== undefined ? `Pinning ${plural(n, "file")} at their current versions…` : "Pinning the files at their current versions…";
    }
    case "texts_fetched": {
      const cov = typeof d.coverage === "string" ? /(\d+) of (\d+)/.exec(d.coverage) : null;
      const total = cov ? Number(cov[2]) : ((d.files as unknown[] | undefined)?.length ?? num(/of (\d+)/, label));
      const readable = cov ? Number(cov[1]) : total;
      if (total === undefined) return "Reading the files by version…";
      if (readable !== undefined && readable < total) return `Read ${readable} of ${total} files. ${plural(total - readable, "file")} unreadable.`;
      return `Reading ${plural(total, "file")} by version…`;
    }
    case "input_gate": {
      const r = obj(step.result);
      const text = typeof step.detail === "string" ? step.detail : "";
      if (r.quarantined === true || /quarantined/.test(label) || /quarantined/.test(text)) {
        const f = (r.fileName as string | undefined) ?? /: (\S+) quarantined/.exec(label)?.[1];
        return f ? `Decider quarantined ${f}. It carried instructions.` : "Decider quarantined a file. It carried instructions.";
      }
      return "Decider checked the text. Clean.";
    }
    case "input_gate_carried":
      return "A quarantined file stays withheld from the agent.";
    case "prior_quotes_diffed":
      return "Comparing with what was verified…";
    case "agent_evaluation": {
      const n = num(/(\d+) controls?/, label) ?? (Array.isArray(d.controls) ? d.controls.length : undefined);
      return n !== undefined ? `Re-checking ${plural(n, "control")} on Bedrock…` : "Re-checking the controls on Bedrock…";
    }
    case "model_turn":
      return /^writing/i.test(label) ? "Writing findings with per-clause support…" : "Reading requirements and evidence…";
    case "tool_call": {
      const a = obj(step.args);
      if (isSearchStep(step)) {
        const files = Array.isArray(a.file_ids) ? a.file_ids.length : num(/over (\d+) files?/, label);
        if (step.tool === "string_search" || a.mode === "string_search" || obj(step.result).fallback === "string_search") {
          return files !== undefined ? `Box AI unavailable. Searching ${plural(files, "file")} as text…` : "Box AI unavailable. Searching the text directly…";
        }
        return files !== undefined ? `Asking Box AI across ${plural(files, "file")}…` : "Asking Box AI across the other files…";
      }
      if (step.tool === "get_prior_evidence") return typeof a.control_id === "string" ? `Fetching what was verified for ${a.control_id}…` : "Fetching what was verified…";
      return step.tool ? `Running ${step.tool}…` : "Running a tool…";
    }
    case "quotes_validated": {
      const m = /(\d+) of (\d+) quotes? matched/.exec(label);
      if (m) return `${m[1]} of ${m[2]} quotes matched.`;
      const down = (d.downgraded as unknown[] | undefined)?.length;
      return down ? `${plural(down, "quote")} not found in the pinned text.` : "Checking every quote against the pinned text…";
    }
    case "findings_applied":
      return "Applying the status rules…";
    case "ledger_events_written":
      return "Writing the record…";
    case "box_folder_metadata_written":
      return "Writing Box metadata…";
    case "box_task_created": {
      const n = (d.tasks as unknown[] | undefined)?.length;
      return n !== undefined ? `Creating ${plural(n, "Box task")}…` : "Creating Box tasks…";
    }
    case "no_change":
      return "Nothing changed in the folder since the last check.";
    case "intake_failed":
      return "I could not read the folder. Nothing was evaluated.";
    case "evaluation_retry":
      return "Same versions as before. Re-running the unfinished check…";
    case "publication_retry":
      return "Resuming the Box metadata and tasks…";
    case "late_result_recorded":
      return "A newer snapshot exists. This result is kept as history.";
    default:
      return "Working…";
  }
}

/** The bubble for one step: at most twelve words, wording-filtered (falls back to "Working…"). */
export function bubbleFor(step: TraceStep): string {
  const t = capWords(bubbleText(step), BUBBLE_MAX_WORDS);
  return bannedWords(t).length ? "Working…" : t;
}

/** A copy of the step with its bubble (and its nested substeps' bubbles) set. */
export function withBubble(step: TraceStep): TraceStep {
  return { ...step, bubble: bubbleFor(step), ...(step.substeps ? { substeps: step.substeps.map(withBubble) } : {}) };
}
