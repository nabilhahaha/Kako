/**
 * Plans & Modules administration — pure logic (no I/O), unit-tested.
 *
 * Backs the platform "Plans & Modules" editor: plan validation, module
 * dependency advice, archive guards, rank normalization, and — most importantly —
 * the **impact preview** that tells the operator exactly which tenant companies
 * gain or lose which modules BEFORE a plan's entitlements are saved.
 *
 * Effective-module rule (mirrors `auth-context.ts`): a company's effective
 * modules = its enabled company modules, minus any *plan-gateable* module
 * (`ALL_MODULES`) the plan does not grant. Modules outside `ALL_MODULES`
 * (sales_orders / returns / warehousing) are never plan-gated and pass through.
 */
import { ALL_MODULES, type Module } from './navigation';
import { MODULE_DEPENDENCIES } from './licensing-catalog';

const PLAN_KEY_RE = /^[a-z][a-z0-9_]{1,31}$/;

export interface PlanInput {
  key: string;
  nameEn: string;
  nameAr: string;
  rank: number;
  maxUsers: number | null;
  maxBranches: number | null;
  maxProducts: number | null;
  storageLimitMb: number | null;
  trialDays: number;
  isActive: boolean;
}

export interface ValidationResult {
  ok: boolean;
  /** Stable error codes (i18n'd at the UI layer). */
  errors: string[];
}

/** A plan key is a stable slug: lowercase, starts with a letter, 2–32 chars. */
export function validatePlanKey(key: string, existingKeys: readonly string[] = []): ValidationResult {
  const errors: string[] = [];
  if (!PLAN_KEY_RE.test(key)) errors.push('key_format');
  if (existingKeys.includes(key)) errors.push('key_taken');
  return { ok: errors.length === 0, errors };
}

/** Full create/edit validation. `existingKeys` must EXCLUDE the plan being edited. */
export function validatePlan(input: PlanInput, existingKeys: readonly string[] = []): ValidationResult {
  const errors: string[] = [];
  errors.push(...validatePlanKey(input.key, existingKeys).errors);
  if (!input.nameEn.trim() || !input.nameAr.trim()) errors.push('name_required');
  for (const [field, v] of [
    ['max_users', input.maxUsers], ['max_branches', input.maxBranches],
    ['max_products', input.maxProducts], ['storage', input.storageLimitMb],
  ] as const) {
    if (v !== null && (!Number.isInteger(v) || v < 0)) errors.push(`${field}_invalid`);
  }
  if (!Number.isInteger(input.trialDays) || input.trialDays < 0) errors.push('trial_invalid');
  if (!Number.isInteger(input.rank) || input.rank < 0) errors.push('rank_invalid');
  return { ok: errors.length === 0, errors };
}

/** Only plan-gateable modules belong in a plan's entitlement set. */
export function isPlanGateable(m: string): m is Module {
  return (ALL_MODULES as string[]).includes(m);
}

/** Expand a selection to include advisory dependencies (e.g. pos ⇒ sales+inventory). */
export function withDependencies(modules: readonly Module[]): Module[] {
  const set = new Set<Module>(modules);
  for (const m of modules) {
    for (const dep of MODULE_DEPENDENCIES[m] ?? []) {
      if (isPlanGateable(dep)) set.add(dep);
    }
  }
  return [...set];
}

/** Modules in `next` whose advisory dependencies are NOT all present (orphans). */
export function orphanedDependencies(next: readonly Module[]): { module: Module; missing: Module[] }[] {
  const present = new Set(next);
  const out: { module: Module; missing: Module[] }[] = [];
  for (const m of next) {
    const missing = (MODULE_DEPENDENCIES[m] ?? []).filter((d) => isPlanGateable(d) && !present.has(d)) as Module[];
    if (missing.length) out.push({ module: m, missing });
  }
  return out;
}

export interface CompanyModuleState {
  id: string;
  name: string;
  /** The company's ENABLED company-modules (erp_company_modules where enabled). */
  enabledModules: Module[];
}

export interface CompanyImpact {
  id: string;
  name: string;
  /** Effective modules this company GAINS (it has them enabled; plan now grants them). */
  gained: Module[];
  /** Effective modules this company LOSES (it relied on them; plan no longer grants). */
  lost: Module[];
}

export interface PlanModuleImpact {
  added: Module[];
  removed: Module[];
  affected: CompanyImpact[];
  totalOnPlan: number;
  affectedCount: number;
}

/**
 * Compute the impact of changing a plan's module entitlements from `current` to
 * `next`, over the companies currently on that plan. A company is "affected"
 * only if it actually has one of the changed modules enabled (so flipping a
 * module no company uses is a no-op, surfaced as `affectedCount = 0`).
 */
export function planModuleImpact(
  current: readonly Module[],
  next: readonly Module[],
  companies: readonly CompanyModuleState[],
): PlanModuleImpact {
  const cur = new Set(current);
  const nxt = new Set(next);
  const added = [...nxt].filter((m) => !cur.has(m));
  const removed = [...cur].filter((m) => !nxt.has(m));
  const addedSet = new Set(added);
  const removedSet = new Set(removed);

  const affected: CompanyImpact[] = [];
  for (const c of companies) {
    const em = new Set(c.enabledModules);
    const gained = [...addedSet].filter((m) => em.has(m));
    const lost = [...removedSet].filter((m) => em.has(m));
    if (gained.length || lost.length) affected.push({ id: c.id, name: c.name, gained, lost });
  }
  return { added, removed, affected, totalOnPlan: companies.length, affectedCount: affected.length };
}

/** Archiving a plan that still has companies assigned needs a migration first. */
export function archiveWarning(companyCount: number): 'companies_still_assigned' | null {
  return companyCount > 0 ? 'companies_still_assigned' : null;
}

/** Normalize a desired ordering into contiguous ranks (0,1,2,…) by key. */
export function normalizeRanks(orderedKeys: readonly string[]): Record<string, number> {
  const out: Record<string, number> = {};
  orderedKeys.forEach((k, i) => { out[k] = i; });
  return out;
}
