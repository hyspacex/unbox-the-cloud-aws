/**
 * The author-task draft (spec 3 step 11): Box AI text generation drafts it from the finding and the
 * reviewer's reason; this deterministic drafter is the mock Box AI and, labelled "template", the
 * fallback when text generation is unavailable. The reviewer sees the draft before it is sent.
 */

/** Structured brief the engine embeds in the Box AI text-generation prompt for the author task. */
export interface AuthorDraftBrief {
  reviewer: string;
  reviewer_role_short: string;
  reason: string;
  fileName: string;
  section_number: string;
  new_version_label: string;
  lost_quotes: string[];
  focus: string;
}

export function draftFromBrief(b: AuthorDraftBrief): string {
  const lost = b.lost_quotes.length
    ? ` Lost from ${b.fileName} ${b.section_number} in ${b.new_version_label}: ${b.lost_quotes.map((q) => `"${q}"`).join(" and ")}`
    : "";
  return `Returned by ${b.reviewer} (${b.reviewer_role_short}): "${b.reason}"${lost} Restore ${b.lost_quotes.length > 1 ? "them" : "it"} or cite where the ${b.focus} is now documented.`;
}
