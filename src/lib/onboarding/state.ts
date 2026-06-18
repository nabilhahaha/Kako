/**
 * Onboarding wizard state — pure types + helpers (no I/O), so progress/resume
 * logic is unit-tested independently of the DB. The server layer (state-server.ts)
 * persists this in `erp_onboarding_state`. Reuse-first: completion flips the
 * existing `erp_companies.setup_done`.
 */

export type OnboardingStepStatus = 'todo' | 'in_progress' | 'done' | 'skipped';

/** Canonical wizard steps (Core + Advanced) from the approved UX package. Steps
 *  flagged `advanced` are optional/skippable; `required` ones gate Go-Live. */
export interface OnboardingStepDef {
  key: string;
  required: boolean;   // must be done (not just skipped) before Go-Live
  advanced: boolean;   // grouped under "Advanced Setup"
}

export const ONBOARDING_STEPS: OnboardingStepDef[] = [
  { key: 'basics',       required: true,  advanced: false },
  { key: 'industry',     required: true,  advanced: false },
  { key: 'modules',      required: true,  advanced: false },
  { key: 'organization', required: true,  advanced: false },
  { key: 'reporting',    required: true,  advanced: false },
  { key: 'roles',        required: true,  advanced: false },
  { key: 'approvals',    required: false, advanced: true  },
  { key: 'products',     required: true,  advanced: false },
  { key: 'uom',          required: true,  advanced: false },
  { key: 'import',       required: false, advanced: false },
  { key: 'territory',    required: false, advanced: false },
  { key: 'finance',      required: false, advanced: true  },
  { key: 'numbering',    required: false, advanced: true  },
  { key: 'integrations', required: false, advanced: true  },
  { key: 'users',        required: true,  advanced: false },
  { key: 'dashboards',   required: true,  advanced: false },
];

export type StepStatusMap = Record<string, OnboardingStepStatus>;

/** Immutably set one step's status. */
export function setStepStatus(map: StepStatusMap, key: string, status: OnboardingStepStatus): StepStatusMap {
  return { ...map, [key]: status };
}

/** Merge a draft patch for a step (shallow per-step). */
export function mergeDraft(
  draft: Record<string, unknown>,
  key: string,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const prev = (draft[key] as Record<string, unknown> | undefined) ?? {};
  return { ...draft, [key]: { ...prev, ...patch } };
}

export interface OnboardingProgress {
  total: number;
  done: number;
  pct: number;            // 0–100 over ALL steps
  nextStep: string | null; // first step not done/skipped (resume target)
}

/** Progress over the given step set (defaults to the canonical steps). */
export function computeProgress(map: StepStatusMap, steps: OnboardingStepDef[] = ONBOARDING_STEPS): OnboardingProgress {
  const total = steps.length;
  const done = steps.filter((s) => map[s.key] === 'done').length;
  const next = steps.find((s) => map[s.key] !== 'done' && map[s.key] !== 'skipped')?.key ?? null;
  return { total, done, pct: total === 0 ? 0 : Math.round((done / total) * 100), nextStep: next };
}

/** Go-Live gate: every REQUIRED step must be 'done' (skipped is not enough). */
export function canGoLive(map: StepStatusMap, steps: OnboardingStepDef[] = ONBOARDING_STEPS): boolean {
  return steps.filter((s) => s.required).every((s) => map[s.key] === 'done');
}

/** Required steps still blocking Go-Live (for a friendly checklist). */
export function blockingSteps(map: StepStatusMap, steps: OnboardingStepDef[] = ONBOARDING_STEPS): string[] {
  return steps.filter((s) => s.required && map[s.key] !== 'done').map((s) => s.key);
}
