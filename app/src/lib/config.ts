/**
 * Typed environment access (docs/CONTRACTS.md, lib/config.ts). MOCK_MODE defaults to true so the
 * app runs with zero credentials. Identity defaults match the Lantern fixture (demo-data/lantern),
 * whose ids come from ledger.json: Dana Okafor 30118804, Priya Natarajan 30118802, Marcus Hale 30118803,
 * R. Alvarez 30118801, J. Park (Eng) 30118811.
 */
import fs from "node:fs";
import path from "node:path";
import type { AppConfig, RunMode } from "./types";

export interface Identity {
  name: string;
  role: string;
  box_user_id: string;
  login: string;
  /** False when box_user_id is the fixture default rather than a tenant id: assign by login (Codex finding 9). */
  id_explicit?: boolean;
}

/** How to address an identity in Box: by tenant id when known, else by login. Mock always uses ids. */
export function boxAssignee(i: Identity, mockMode: boolean): { id: string } | { login: string } {
  return mockMode || i.id_explicit ? { id: i.box_user_id } : { login: i.login };
}

export interface KeelConfig {
  mockMode: boolean;
  mode: RunMode;
  modelId: string;
  inferenceProfile: string;
  mrmModelId: string;
  promptVersion: string;
  /** Prompt hash used by the mock evaluator; the real evaluator reports its own (lib/agent/prompt.ts). */
  mockPromptHash: string;
  reviewer: Identity;
  author: Identity;
  /** Configured reviewer list for the demo (spec 4, rules enforced by code). */
  reviewers: Identity[];
  deciderUrl: string | null;
  /** Injection probability at or above which the input gate quarantines a file (spec 3 step 5). */
  gateInjectionThreshold: number;
  /** Mock only: "mock" uses the fixture-faithful Decider stand-in, "absent" omits the gate. */
  mockGate: "mock" | "absent";
  /** Mock only: 1 = compressed real wall clock (about 8 s per run), 0 = no artificial delay (tests). */
  mockTimeScale: number;
  /** Live only: background poll of Box task assignments, started lazily (0 disables). */
  pollIntervalMs: number;
  box: {
    folderId: string;
    templateKey: string;
    scope: string;
    developerToken: string | null;
    clientId: string | null;
    clientSecret: string | null;
    enterpriseId: string | null;
    subjectUserId: string | null;
  };
  boxAiEnabled: boolean;
  /** Keel record URL base; the fixture uses this placeholder. */
  recordUrlBase: string;
  storePath: string;
}

const env = (k: string): string | undefined => {
  const v = process.env[k];
  return v === undefined || v === "" ? undefined : v;
};
const bool = (k: string, d: boolean) => {
  const v = env(k);
  if (v === undefined) return d;
  return !["false", "0", "no", "off"].includes(v.toLowerCase());
};

export const FIXTURE_IDENTITIES = {
  dana: { name: "Dana Okafor", role: "ARB reviewer, Technology Resilience", box_user_id: "30118804", login: "dana.okafor@meridiantrust.example" },
  priya: { name: "Priya Natarajan", role: "Principal Security Architect, ARB reviewer", box_user_id: "30118802", login: "priya.natarajan@meridiantrust.example" },
  marcus: { name: "Marcus Hale", role: "Data Governance and Third-Party Risk Lead, ARB reviewer", box_user_id: "30118803", login: "marcus.hale@meridiantrust.example" },
  alvarez: { name: "R. Alvarez", role: "ARB chair", box_user_id: "30118801", login: "r.alvarez@meridiantrust.example" },
  jpark: { name: "J. Park (Eng)", role: "Project author, Card Servicing Platform engineering", box_user_id: "30118811", login: "j.park@meridiantrust.example" },
} satisfies Record<string, Identity>;

/** Walk up from cwd to the directory that contains demo-data/lantern (repo root). */
export function repoRoot(): string {
  const override = env("KEEL_REPO_ROOT");
  if (override) return override;
  let dir = process.cwd();
  for (let i = 0; i < 8; i++) {
    if (fs.existsSync(path.join(dir, "demo-data", "lantern", "ledger.json"))) return dir;
    const up = path.dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  throw new Error(`Keel: cannot find demo-data/lantern above ${process.cwd()}; set KEEL_REPO_ROOT`);
}

export function fixtureDir(): string {
  return env("KEEL_FIXTURE_DIR") ?? path.join(repoRoot(), "demo-data", "lantern");
}

export function loadConfig(): KeelConfig {
  const mockMode = bool("MOCK_MODE", true);
  const reviewer: Identity = {
    name: env("KEEL_REVIEWER_NAME") ?? FIXTURE_IDENTITIES.dana.name,
    role: env("KEEL_REVIEWER_ROLE") ?? FIXTURE_IDENTITIES.dana.role,
    box_user_id: env("KEEL_REVIEWER_BOX_USER_ID") ?? FIXTURE_IDENTITIES.dana.box_user_id,
    login: env("KEEL_REVIEWER_LOGIN") ?? FIXTURE_IDENTITIES.dana.login,
    id_explicit: !!env("KEEL_REVIEWER_BOX_USER_ID"),
  };
  const author: Identity = {
    name: env("KEEL_AUTHOR_NAME") ?? FIXTURE_IDENTITIES.jpark.name,
    role: env("KEEL_AUTHOR_ROLE") ?? FIXTURE_IDENTITIES.jpark.role,
    box_user_id: env("KEEL_AUTHOR_BOX_USER_ID") ?? FIXTURE_IDENTITIES.jpark.box_user_id,
    login: env("KEEL_AUTHOR_LOGIN") ?? FIXTURE_IDENTITIES.jpark.login,
    id_explicit: !!env("KEEL_AUTHOR_BOX_USER_ID"),
  };
  const others = [FIXTURE_IDENTITIES.marcus, FIXTURE_IDENTITIES.dana, FIXTURE_IDENTITIES.priya].filter(
    (r) => r.box_user_id !== reviewer.box_user_id,
  );
  return {
    mockMode,
    mode: mockMode ? "mock" : "live",
    modelId: env("KEEL_MODEL_ID") ?? "anthropic.claude-sonnet-4-6",
    inferenceProfile: env("KEEL_INFERENCE_PROFILE") ?? "us.anthropic.claude-sonnet-4-6",
    mrmModelId: env("KEEL_MRM_MODEL_ID") ?? "MRM-AI-0271",
    promptVersion: env("KEEL_PROMPT_VERSION") ?? "v3",
    mockPromptHash: "sha256:46fbc0f743a8a3ae", // gen.py: sha256("keel/evaluate-snapshot/prompt/v3")[:16]
    reviewer,
    author,
    reviewers: [reviewer, ...others],
    deciderUrl: env("DECIDER_URL") ?? null,
    // Single source for the gate threshold; DECIDER_INJECTION_THRESHOLD (decider.ts's name) wins.
    gateInjectionThreshold: Number(env("DECIDER_INJECTION_THRESHOLD") ?? env("KEEL_GATE_INJECTION_THRESHOLD") ?? 0.5),
    mockGate: env("KEEL_MOCK_GATE") === "absent" ? "absent" : "mock",
    mockTimeScale: Number(env("KEEL_MOCK_TIME_SCALE") ?? 1),
    pollIntervalMs: Number(env("KEEL_POLL_INTERVAL_MS") ?? 5000),
    box: {
      folderId: env("BOX_FOLDER_ID") ?? "318840021",
      templateKey: env("BOX_METADATA_TEMPLATE_KEY") ?? "keelReview",
      scope: env("BOX_METADATA_SCOPE") ?? "enterprise",
      developerToken: env("BOX_DEVELOPER_TOKEN") ?? null,
      clientId: env("BOX_CLIENT_ID") ?? null,
      clientSecret: env("BOX_CLIENT_SECRET") ?? null,
      enterpriseId: env("BOX_ENTERPRISE_ID") ?? null,
      subjectUserId: env("BOX_SUBJECT_USER_ID") ?? null,
    },
    boxAiEnabled: bool("KEEL_BOX_AI_ENABLED", true),
    recordUrlBase: env("KEEL_RECORD_URL_BASE") ?? "https://keel.local/record/",
    // Mock and live keep separate stores so flipping MOCK_MODE never overwrites the other ledger.
    // app/data/runs/ is gitignored.
    storePath: env("KEEL_STORE_PATH") ?? (mockMode ? path.join(repoRoot(), "app", "data", "store.json") : path.join(repoRoot(), "app", "data", "runs", "store-live.json")),
  };
}

let cached: KeelConfig | null = null;
export function getConfig(): KeelConfig {
  if (!cached) cached = loadConfig();
  return cached;
}
/** Tests only: drop the cached config after changing process.env. */
export function resetConfigCache(): void {
  cached = null;
}

export function toAppConfig(c: KeelConfig): AppConfig {
  return {
    mode: c.mode,
    model_id: c.modelId,
    inference_profile: c.inferenceProfile,
    mrm_model_id: c.mrmModelId,
    prompt_version: c.promptVersion,
    reviewer: c.reviewer,
    author: c.author,
    reviewers: c.reviewers,
    decider: {
      enabled: c.mockMode ? c.mockGate === "mock" : !!c.deciderUrl,
      endpoint: c.deciderUrl ?? undefined,
      kind: c.mockMode ? (c.mockGate === "mock" ? "mock" : "absent") : c.deciderUrl ? "decider" : "absent",
    },
    box_ai: { enabled: c.boxAiEnabled },
  };
}
