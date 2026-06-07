// ============================================================================
// Pure condition evaluator for the workflow runtime's `condition` step + trigger
// gates (Constitution Art. 10). Evaluates a small, safe expression DSL over the
// run context — no eval(), no side effects, fully unit-tested. (The engine's SQL
// erp_workflow_condition_met remains for legacy approval-step routing; the
// generalized runtime uses this one — convergence tracked in the runtime ADR.)
//
// DSL (JSON):
//   leaf:    { field: 'amount', op: 'gt', value: 1000 }
//   combine: { all: [c, c] } | { any: [c, c] } | { not: c }
// ops: eq ne gt gte lt lte in nin exists truthy
// ============================================================================

type Vars = Record<string, unknown>;

export function evalCondition(cond: Record<string, unknown> | null | undefined, vars: Vars): boolean {
  if (!cond || Object.keys(cond).length === 0) return true;   // empty → always true
  if (Array.isArray(cond.all)) return (cond.all as Record<string, unknown>[]).every((c) => evalCondition(c, vars));
  if (Array.isArray(cond.any)) return (cond.any as Record<string, unknown>[]).some((c) => evalCondition(c, vars));
  if (cond.not) return !evalCondition(cond.not as Record<string, unknown>, vars);
  return evalLeaf(cond, vars);
}

function evalLeaf(cond: Record<string, unknown>, vars: Vars): boolean {
  const field = typeof cond.field === 'string' ? cond.field : undefined;
  if (!field) return false;
  const actual = resolvePath(vars, field);
  const op = String(cond.op ?? 'truthy');
  const value = cond.value;
  switch (op) {
    case 'eq': return looseEq(actual, value);
    case 'ne': return !looseEq(actual, value);
    case 'gt': return num(actual) > num(value);
    case 'gte': return num(actual) >= num(value);
    case 'lt': return num(actual) < num(value);
    case 'lte': return num(actual) <= num(value);
    case 'in': return Array.isArray(value) && value.some((v) => looseEq(actual, v));
    case 'nin': return Array.isArray(value) && !value.some((v) => looseEq(actual, v));
    case 'exists': return actual !== undefined && actual !== null;
    case 'truthy': return !!actual;
    default: return false;
  }
}

/** Dot-path lookup (e.g. 'customer.credit_limit'). */
function resolvePath(obj: Vars, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, k) => (acc != null && typeof acc === 'object' ? (acc as Vars)[k] : undefined), obj);
}

function num(v: unknown): number { return typeof v === 'number' ? v : Number(v); }
function looseEq(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (typeof b === 'number' || typeof a === 'number') return num(a) === num(b);
  if (typeof b === 'boolean' || typeof a === 'boolean') return Boolean(a) === Boolean(b);
  return String(a) === String(b);
}
