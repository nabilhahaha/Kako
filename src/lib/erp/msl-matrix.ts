/** ── Retail Execution — Dynamic MSL Matrix Engine (pure, no I/O) ───────────
 *
 *  Resolves the effective Must-Stock List for an outlet from COMPANY-DEFINED
 *  policies. NOTHING here is hardcoded — dimensions (channel / sub-channel /
 *  customer-class / brand / future), their values, MSL levels and rules are all
 *  data (`erp_customer_lookups`, `erp_msl_*`). Adding/renaming/reorganizing any of
 *  them needs zero code change, so the engine serves FMCG, Pharma, Beverage,
 *  Dairy, Bakery and future industry packs identically.
 *
 *  Targeting: a policy lists allowed dimension VALUES (lookup ids). The engine
 *  groups them by the lookup's KIND (the dimension) and matches an outlet with
 *  AND across kinds, OR within a kind. A policy with no conditions is company-wide.
 *  On a SKU appearing in multiple applicable policies, the higher-`priority` policy
 *  wins its weight/level.
 *
 *  Pattern adapted from Pepperi/Repsly/StayinFront/BeatRoute/Salesforce CG Cloud
 *  dynamic assortment matrices. Pure + fully testable.
 */

export interface Lookup { id: string; kind: string }
export interface MslLevel { id: string; weight: number }

export interface MslPolicyItem { productId: string; levelId?: string | null; weight?: number | null; isActive?: boolean }

export interface MslPolicy {
  id: string;
  isActive?: boolean;
  priority?: number;
  effectiveFrom?: string | null; // ISO date (YYYY-MM-DD)
  effectiveTo?: string | null;
  /** Allowed dimension VALUES (lookup ids), any kinds. Empty = company-wide. */
  conditionLookupIds: string[];
  items: MslPolicyItem[];
}

export interface Outlet {
  customerId: string;
  /** The outlet's attribute values (lookup ids) across all dimensions. */
  lookupIds: string[];
}

/** Is a policy active on a date? (enabled + within its effective window). */
export function policyActiveAt(policy: MslPolicy, asOfIso: string): boolean {
  if (policy.isActive === false) return false;
  const day = asOfIso.slice(0, 10);
  if (policy.effectiveFrom && day < policy.effectiveFrom.slice(0, 10)) return false;
  if (policy.effectiveTo && day > policy.effectiveTo.slice(0, 10)) return false;
  return true;
}

/**
 * Does a policy target this outlet? Group the policy's condition lookups by their
 * kind; the outlet must match at least one allowed value in EVERY constrained kind
 * (AND across kinds, OR within a kind). No conditions → matches everyone.
 */
export function policyMatchesOutlet(
  policy: MslPolicy,
  outletLookupIds: ReadonlySet<string>,
  kindOf: ReadonlyMap<string, string>,
): boolean {
  if (policy.conditionLookupIds.length === 0) return true;
  // kind → set of allowed lookup ids
  const byKind = new Map<string, Set<string>>();
  for (const id of policy.conditionLookupIds) {
    const kind = kindOf.get(id) ?? '__unknown__';
    (byKind.get(kind) ?? byKind.set(kind, new Set()).get(kind)!).add(id);
  }
  for (const allowed of byKind.values()) {
    let hit = false;
    for (const id of allowed) if (outletLookupIds.has(id)) { hit = true; break; }
    if (!hit) return false; // a constrained dimension with no matching outlet value
  }
  return true;
}

export interface ResolvedMslItem { productId: string; weight: number; levelId: string | null; policyId: string; priority: number }

/**
 * Resolve the effective MSL (product → weight/level) for one outlet across all
 * policies. Union of items from every active + matching policy; weight =
 * item override → level weight → 1. On a duplicate SKU, the higher-priority policy
 * wins (ties: first encountered).
 */
export function resolveMslForOutlet(
  policies: readonly MslPolicy[],
  outlet: Outlet,
  lookups: readonly Lookup[],
  levels: readonly MslLevel[],
  asOfIso: string = new Date().toISOString(),
): Map<string, ResolvedMslItem> {
  const kindOf = new Map(lookups.map((l) => [l.id, l.kind]));
  const levelWeight = new Map(levels.map((l) => [l.id, l.weight]));
  const outletSet = new Set(outlet.lookupIds);

  const applicable = policies
    .filter((p) => policyActiveAt(p, asOfIso) && policyMatchesOutlet(p, outletSet, kindOf))
    .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));

  const out = new Map<string, ResolvedMslItem>();
  for (const p of applicable) {
    const priority = p.priority ?? 0;
    for (const it of p.items) {
      if (it.isActive === false) continue;
      const existing = out.get(it.productId);
      if (existing && existing.priority >= priority) continue; // higher/equal priority already won
      const weight = it.weight != null ? it.weight
        : (it.levelId != null && levelWeight.has(it.levelId) ? levelWeight.get(it.levelId)! : 1);
      out.set(it.productId, { productId: it.productId, weight, levelId: it.levelId ?? null, policyId: p.id, priority });
    }
  }
  return out;
}

/** Convenience: just the required product ids for an outlet. */
export function requiredProductIds(resolved: ReadonlyMap<string, ResolvedMslItem>): Set<string> {
  return new Set(resolved.keys());
}
