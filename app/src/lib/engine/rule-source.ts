/**
 * UI v4.1: the rule-source chip and short rule name of a control, from the control profile.
 * No state import, so buildRows can attach them to every row.
 */
import type { Control, ControlProfile, PackageStandards, RuleOrigin, RuleSource } from "../types";
import { capWords } from "./display";

// ------------------------------------------------------------------------------------------------
// Rule source
// ------------------------------------------------------------------------------------------------

export const ORIGIN_LABEL: Record<RuleOrigin, string> = {
  team_standard: "Bank standard",
  international_standard: "International standard",
  learned_from_reviews: "Learned from reviews",
};

/** Display order is the welcome screen's: international frameworks first, then US banking. */
const FRAMEWORK_LABEL: Record<string, string> = {
  iso_27001_2022_annex_a: "ISO 27001:2022",
  nist_csf_2_0: "NIST CSF 2.0",
  pci_dss_4_0_1: "PCI DSS 4.0.1",
  ffiec_is_booklet: "FFIEC IS",
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

/** The frameworks the profile's controls map to, with control and clause counts, and the bank standards they cite. */
export function packageStandards(profile: ControlProfile): PackageStandards {
  const maps = profile.controls.map((c) => (c.framework_map ?? {}) as Record<string, unknown>);
  const keys = [...Object.keys(FRAMEWORK_LABEL), ...new Set(maps.flatMap((m) => Object.keys(m)).filter((k) => k !== "status" && !(k in FRAMEWORK_LABEL)))];
  const frameworks = keys
    .map((key) => {
      const lists = maps.map((m) => (Array.isArray(m[key]) ? (m[key] as string[]) : []));
      return { key, label: FRAMEWORK_LABEL[key] ?? key, controls: lists.filter((l) => l.length).length, clauses: new Set(lists.flat()).size };
    })
    .filter((f) => f.controls > 0);
  const status = maps.map((m) => m.status).find((s): s is string => typeof s === "string");
  const bank = [...new Set(profile.controls.map((c) => parseStandard(c.standard).id))].sort();
  return {
    frameworks,
    ...(status ? { mapping_note: `Mapping ${status}` } : {}),
    profile_line: `${profile.name} · profile ${profile.profile_version}`,
    bank_standards: bank,
    bank_line: `${bank.length} bank ${bank.length === 1 ? "standard" : "standards"}`,
  };
}

export const RULE_NAME_MAX_WORDS = 5;
export function ruleName(control: Control): string {
  return capWords(control.rule_name ?? control.title, RULE_NAME_MAX_WORDS);
}

