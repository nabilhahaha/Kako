/** ── Customer Onboarding — entity import sequencing (pure, no I/O) ──────────
 *
 *  Turns the importable entity registry into a guided, phased onboarding plan so
 *  a new FMCG customer migrates in the right order (foundation → master data →
 *  transactions) and can go live in hours, not weeks. Status is derived from the
 *  existing `erp_import_jobs` audit (the page supplies RLS-scoped rows).
 *
 *  Sequencing follows `dependsOn` (FK graph) via `orderEntitiesByDependency`, so
 *  parents (e.g. branches, products) import before children (warehouses, invoice
 *  lines). Pattern adapted from ERPNext doctype-ordered imports, Odoo masters-
 *  before-documents migration, SAP Business One staged loads, and Dynamics 365
 *  data-import sequencing.
 */

import { listImportableEntities, orderEntitiesByDependency, getEntity } from './entities';

export type OnboardingPhase = 'foundation' | 'master' | 'transactions';
export type OnboardingStatus = 'notStarted' | 'inProgress' | 'completed' | 'failed';

export const ONBOARDING_PHASES: OnboardingPhase[] = ['foundation', 'master', 'transactions'];

/** Which onboarding phase each importable entity belongs to. */
const PHASE_OF: Record<string, OnboardingPhase> = {
  // Foundation — structure first (org + locations + people).
  branch: 'foundation', region: 'foundation', area: 'foundation',
  warehouse: 'foundation', user: 'foundation',
  // Master data — the catalog the business runs on.
  customer: 'master', supplier: 'master', product: 'master',
  route: 'master', journey_plan: 'master',
  // Transactions — opening balances + historical documents.
  stock: 'transactions', invoice_line: 'transactions',
  collection: 'transactions', sales_return: 'transactions',
};

export interface OnboardingJobLike {
  target_entity: string | null;
  status: string | null;
  success_rows: number | null;
  created_at: string | null;
}

export interface OnboardingEntityStep {
  key: string;
  phase: OnboardingPhase;
  status: OnboardingStatus;
  /** Number of import jobs run for this entity. */
  jobs: number;
  /** Total rows successfully imported across all jobs. */
  successRows: number;
  /** Most recent job timestamp (ISO) or null. */
  lastAt: string | null;
  /** Dependency entity keys (for "import X first" hints). */
  dependsOn: string[];
}

export interface OnboardingPhaseGroup {
  phase: OnboardingPhase;
  steps: OnboardingEntityStep[];
}

export interface OnboardingPlan {
  groups: OnboardingPhaseGroup[];
  steps: OnboardingEntityStep[];
  totalCount: number;
  completedCount: number;
  /** 0..100 — share of entities with at least one completed import. */
  progress: number;
}

function jobBucket(status: string | null): 'completed' | 'failed' | 'running' {
  const s = (status ?? '').toLowerCase();
  if (s === 'completed' || s === 'success' || s === 'done') return 'completed';
  if (s === 'failed' || s === 'error') return 'failed';
  return 'running';
}

/** Derive an entity's onboarding status from its import jobs (pure). */
export function deriveEntityStatus(jobs: readonly OnboardingJobLike[]): OnboardingStatus {
  if (jobs.length === 0) return 'notStarted';
  let hasCompleted = false, hasRunning = false;
  for (const j of jobs) {
    const b = jobBucket(j.status);
    if (b === 'completed') hasCompleted = true;
    else if (b === 'running') hasRunning = true;
  }
  if (hasCompleted) return 'completed';
  if (hasRunning) return 'inProgress';
  return 'failed';
}

/** The importable entity keys that participate in onboarding, dependency-ordered. */
export function onboardingEntityKeys(): string[] {
  const keys = listImportableEntities()
    .map((e) => e.key)
    .filter((k) => k in PHASE_OF);
  return orderEntitiesByDependency(keys);
}

/** Build the full onboarding plan (phased + ordered) with status from jobs. */
export function buildOnboardingPlan(jobs: readonly OnboardingJobLike[]): OnboardingPlan {
  const byEntity = new Map<string, OnboardingJobLike[]>();
  for (const j of jobs) {
    const k = j.target_entity ?? '';
    if (!k) continue;
    (byEntity.get(k) ?? byEntity.set(k, []).get(k)!).push(j);
  }

  const steps: OnboardingEntityStep[] = onboardingEntityKeys().map((key) => {
    const ej = byEntity.get(key) ?? [];
    const successRows = ej.reduce((s, j) => s + Math.max(0, j.success_rows ?? 0), 0);
    const lastAt = ej.reduce<string | null>((acc, j) => {
      if (!j.created_at) return acc;
      return !acc || j.created_at > acc ? j.created_at : acc;
    }, null);
    return {
      key,
      phase: PHASE_OF[key],
      status: deriveEntityStatus(ej),
      jobs: ej.length,
      successRows,
      lastAt,
      dependsOn: getEntity(key)?.dependsOn ?? [],
    };
  });

  const groups: OnboardingPhaseGroup[] = ONBOARDING_PHASES.map((phase) => ({
    phase,
    steps: steps.filter((s) => s.phase === phase),
  }));

  const totalCount = steps.length;
  const completedCount = steps.filter((s) => s.status === 'completed').length;
  const progress = totalCount === 0 ? 0 : Math.round((completedCount / totalCount) * 100);

  return { groups, steps, totalCount, completedCount, progress };
}
