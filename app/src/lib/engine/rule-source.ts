/**
 * UI v4.1: the rule-source chip and short rule name of a control, from the control profile.
 * No state import, so buildRows can attach them to every row.
 */
import type { Control, RuleOrigin, RuleSource } from "../types";
import { capWords } from "./display";

// ------------------------------------------------------------------------------------------------
// Rule source
// ------------------------------------------------------------------------------------------------

export const ORIGIN_LABEL: Record<RuleOrigin, string> = {
  team_standard: "Bank standard",
  international_standard: "International standard",
  learned_from_reviews: "Learned from reviews",
};

const FRAMEWORK_LABEL: Record<string, string> = {
  pci_dss_4_0_1: "PCI DSS 4.0.1",
  nist_csf_2_0: "NIST CSF 2.0",
  ffiec_is_booklet: "FFIEC IS",
  iso_27001_2022_annex_a: "ISO 27001:2022",
  glba_occ: "GLBA/OCC",
};

/** "IS-STD-014 Cryptography v4.2 §5.1" -> { standard: "IS-STD-014 Cryptography v4.2", clause: "§5.1", id: "IS-STD-014" }. */
export function parseStandard(s: string): { standard: string; clause?: string; id: string } {
  const m = /^(.*?)\s+(§\s*\S+)\s*$/.exec(s.trim());
  const standard = (m ? m[1] : s).trim();
  return { standard, ...(m ? { clause: m[2].replace(/\s+/g, "") } : {}), id: standard.split(/\s+/)[0] };
}

/** The rule-source chip for a control, from the profile (origin defaults to the bank standard of the reviewer role). */
export function ruleSource(control: Control, profileVersion: string): RuleSource {
  const p = parseStandard(control.standard);
  const src = control.source ?? { origin: "team_standard" as const, set_by: control.reviewer_role };
  const fm = (control.framework_map ?? {}) as Record<string, unknown>;
  const map = Object.entries(fm).flatMap(([k, v]) => (k === "status" || !Array.isArray(v) ? [] : (v as string[]).map((x) => `${FRAMEWORK_LABEL[k] ?? k} ${x}`)));
  return {
    standard: p.standard,
    ...(p.clause ? { clause: p.clause } : {}),
    chip: p.clause ? `${p.id} ${p.clause}` : p.id,
    origin: src.origin,
    origin_label: ORIGIN_LABEL[src.origin] ?? src.origin,
    set_by: src.set_by,
    ...(src.reference ? { reference: src.reference } : {}),
    ...(src.note ? { note: src.note } : {}),
    profile_version: profileVersion,
    ...(map.length ? { framework_map: map } : {}),
    ...(typeof fm.status === "string" ? { framework_map_status: fm.status } : {}),
  };
}

export const RULE_NAME_MAX_WORDS = 5;
export function ruleName(control: Control): string {
  return capWords(control.rule_name ?? control.title, RULE_NAME_MAX_WORDS);
}

