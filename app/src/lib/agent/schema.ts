/**
 * The model's output contract (spec section 3 step 6). Zod-validated. There is no field for a
 * disposition, a history, or a status: the model proposes per-clause support with quotes and a
 * basis. Code derives the assessment, the classification, staleness and the displayed status.
 * Unknown control ids are rejected by the validator in the engine (it knows the profile).
 */
import { z } from "zod";

export const QuoteRef = z.object({
  fileName: z.string().min(1),
  versionId: z.string().min(1),
  section: z.string().min(1),
  paragraph: z.number().int().positive().optional(),
  page: z.number().int().positive().optional(),
  quote: z.string().min(8),
}).strict(); // nested keys are rejected too: a disposition cannot hide inside a quote
export type QuoteRef = z.infer<typeof QuoteRef>;

export const ClauseSupportOut = z.object({
  clause_id: z.string().min(1),
  support: z.enum(["supported", "unsupported"]),
  quote: QuoteRef.nullable(),
}).strict();

export const ControlFindingOut = z
  .object({
    control_id: z.string().min(1),
    clause_support: z.array(ClauseSupportOut).min(1),
    /** Bullets must describe operations the agent actually performed (recorded in the trace). */
    basis: z.array(z.string().min(1)).min(1).max(8),
    /** Optional: another validated quote in the snapshot that conflicts with the support. */
    conflicting_quote: QuoteRef.nullable().optional(),
    suggested_action: z.string().optional(),
  })
  .strict(); // a disposition, status or history key fails validation (acceptance case 10)

export const FindingSet = z
  .object({
    snapshot_id: z.string().min(1),
    findings: z.array(ControlFindingOut).min(1),
  })
  .strict();

export type ControlFindingOut = z.infer<typeof ControlFindingOut>;
export type FindingSet = z.infer<typeof FindingSet>;
