/**
 * Staleness keyed to the evidence binding, with the profile's materiality applied by tier
 * (spec 3 step 8; spec 4 "Verification holds"; gen.py Scenario.hold_status):
 *   Critical (acknowledge_on_evidencing_file_change): acknowledge when the evidencing file version
 *     changed, even if the quote is unchanged.
 *   High (acknowledge_on_evidencing_section_change): acknowledge when the evidencing section's text
 *     changed around an unchanged quote (SEC-ARCH-05: "are not used for operations" became
 *     "play no part in day-to-day operations").
 *   Medium (hold_if_quote_unchanged): holds when the quote is unchanged.
 */
import type { ChangeClassification, ControlTier, LedgerEventType, Materiality } from "../types";
import { norm } from "./normalize";

export interface BindingLike {
  fileId: string;
  fileName: string;
  versionId: string;
  versionLabel?: string;
  section?: string;
  quote: string;
}

export interface StalenessInput {
  /** Binding of the most recent prior human verification (historical record). */
  prior: BindingLike | null;
  /** The control's selected binding on the new snapshot. */
  binding: BindingLike | null;
  classification: ChangeClassification;
  tier: ControlTier;
  materiality: Materiality;
  /**
   * High tier only: did the normalized text of the evidencing section change between the prior
   * verification's version and the new version? Computed by the caller from pinned texts.
   */
  sectionTextChanged?: boolean | null;
}

export interface StalenessResult {
  /** null when there is no prior verification or no binding (nothing to hold). */
  holds: boolean | null;
  acknowledgment_required: boolean;
  reason?: "evidencing file changed" | "evidencing section changed";
  note?: string;
  materiality: Materiality;
}

const label = (b: BindingLike) => b.versionLabel ?? b.versionId;
const sectionNumber = (b: BindingLike) => (b.section ?? "").split(" ")[0] || "section";

export function verificationHolds(input: StalenessInput): StalenessResult {
  const { prior, binding, classification: cc, tier, materiality } = input;
  if (!prior || !binding) return { holds: null, acknowledgment_required: false, materiality };
  if (cc !== "unchanged" || binding.fileId !== prior.fileId) {
    return { holds: false, acknowledgment_required: false, note: `classification ${cc}`, materiality };
  }
  // The verification is bound to the verified quote itself, not to whatever the previous evaluation
  // bound: a quote that changed and was never re-verified can never hold (Codex finding 1).
  if (norm(binding.quote) !== norm(prior.quote)) {
    return { holds: false, acknowledgment_required: false, note: "classification moved: the bound quote differs from the verified quote", materiality };
  }
  if (binding.versionId === prior.versionId) {
    return { holds: true, acknowledgment_required: false, note: `evidencing file version unchanged; tier ${tier} holds without acknowledgment`, materiality };
  }
  const changed = `evidencing file version changed (${prior.fileName} ${label(prior)} to ${label(binding)})`;
  if (materiality === "acknowledge_on_evidencing_file_change") {
    return {
      holds: false,
      acknowledgment_required: true,
      reason: "evidencing file changed",
      note: `${changed}; tier ${tier} requires acknowledgment`,
      materiality,
    };
  }
  if (materiality === "acknowledge_on_evidencing_section_change") {
    if (input.sectionTextChanged) {
      return {
        holds: false,
        acknowledgment_required: true,
        reason: "evidencing section changed",
        note: `${changed}; cited quote unchanged; evidencing section ${sectionNumber(binding)} text changed; tier ${tier} requires acknowledgment`,
        materiality,
      };
    }
    return {
      holds: true,
      acknowledgment_required: false,
      note: `${changed}; cited quote unchanged; evidencing section ${sectionNumber(binding)} unchanged; tier ${tier} holds without acknowledgment`,
      materiality,
    };
  }
  return { holds: true, acknowledgment_required: false, note: `${changed}; cited quote unchanged; tier ${tier} holds without acknowledgment`, materiality };
}

/** Which staleness event the ledger records for a control (gen.py Scenario.staleness). */
export function stalenessEventType(result: StalenessResult, classification: ChangeClassification): LedgerEventType | null {
  if (result.holds === null) return null;
  if (result.holds) return "verification_holds";
  if (result.acknowledgment_required) return "verification_requires_acknowledgment";
  if (classification === "moved") return "binding_changed";
  return null;
}
