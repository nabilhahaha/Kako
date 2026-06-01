/** ── Form Rules Engine (B3) ────────────────────────────────────────────────
 *  Shared client + server evaluation of form field rules, mirroring the workflow
 *  condition language (erp_workflow_condition_met): a condition is
 *  `{ when, op, value }`. Drives conditional visibility, conditional-required,
 *  validation, and section-level conditions. Pure functions — the same code runs
 *  in the designer preview (client) and the submit action (server, B5). */

export type ConditionOp = 'eq' | 'neq' | 'gt' | 'lt' | 'gte' | 'lte' | 'in' | 'exists';
export interface Condition { when: string; op?: ConditionOp; value?: unknown }

export interface Validation {
  minLen?: number; maxLen?: number; min?: number; max?: number; regex?: string;
  allowed?: string[];
  requiredWhen?: Condition;   // conditional-required (B3 #3)
}

/** Minimal field shape the engine needs (a subset of erp_form_fields). */
export interface RuleField {
  key: string;
  type: string;
  required: boolean;
  options?: { value: string; label: string }[] | null;
  visibility?: Condition | null;   // SHOW condition (B3 #2 / #5)
  validation?: Validation | null;  // validation + requiredWhen
}

/** Evaluate a single condition against current values. Mirrors the workflow
 *  SQL evaluator (eq/neq/gt/lt/in) and adds gte/lte/exists for field rules. */
export function evalCondition(cond: Condition | null | undefined, values: Record<string, unknown>): boolean {
  if (!cond || !cond.when) return true;
  const op = cond.op ?? 'eq';
  const actual = values[cond.when];
  const a = actual == null ? '' : String(actual);
  const v = cond.value == null ? '' : String(cond.value);
  switch (op) {
    case 'eq': return a === v;
    case 'neq': return a !== v;
    case 'gt': return actual != null && cond.value != null && Number(actual) > Number(cond.value);
    case 'lt': return actual != null && cond.value != null && Number(actual) < Number(cond.value);
    case 'gte': return actual != null && cond.value != null && Number(actual) >= Number(cond.value);
    case 'lte': return actual != null && cond.value != null && Number(actual) <= Number(cond.value);
    case 'in': return Array.isArray(cond.value) && cond.value.map(String).includes(a);
    case 'exists': return actual != null && a !== '';
    default: return true;
  }
}

/** Visibility per field key — a field shows when its own SHOW condition passes
 *  AND its containing section is visible (section-level conditions, B3 #5). */
export function computeVisibility(fields: RuleField[], values: Record<string, unknown>): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  let sectionVisible = true;
  for (const f of fields) {
    if (f.type === 'section') {
      sectionVisible = evalCondition(f.visibility, values);
      out[f.key] = sectionVisible;
    } else {
      out[f.key] = sectionVisible && evalCondition(f.visibility, values);
    }
  }
  return out;
}

/** Whether a field is effectively required given current values (B3 #1 / #3). */
export function isRequired(field: RuleField, values: Record<string, unknown>): boolean {
  if (field.required) return true;
  const rw = field.validation?.requiredWhen;
  return rw ? evalCondition(rw, values) : false;
}

function isEmpty(v: unknown): boolean {
  return v == null || v === '' || (Array.isArray(v) && v.length === 0);
}

/** Validate one field's value (assumes non-empty). Returns an error key or null. */
export function validateValue(field: RuleField, value: unknown): string | null {
  if (isEmpty(value)) return null; // emptiness handled by the required check
  const val = field.validation ?? {};
  const s = String(value);

  if (field.type === 'number') {
    const n = Number(s);
    if (Number.isNaN(n)) return 'number';
    if (val.min != null && n < val.min) return 'min';
    if (val.max != null && n > val.max) return 'max';
  }
  if (field.type === 'text') {
    if (val.minLen != null && s.length < val.minLen) return 'minLen';
    if (val.maxLen != null && s.length > val.maxLen) return 'maxLen';
    if (val.regex) { try { if (!new RegExp(val.regex).test(s)) return 'regex'; } catch { /* invalid regex ignored */ } }
  }
  if (field.type === 'dropdown' && field.options && field.options.length > 0) {
    if (!field.options.map((o) => o.value).includes(s)) return 'allowed';
  }
  if (field.type === 'multiselect' && Array.isArray(value) && field.options && field.options.length > 0) {
    const allowed = field.options.map((o) => o.value);
    if (value.some((x) => !allowed.includes(String(x)))) return 'allowed';
  }
  return null;
}

/** Validate a whole submission against the form schema. Hidden fields are
 *  skipped. Returns a map of fieldKey → error key (empty = valid). Used by the
 *  designer preview (client) and the submit action (server). */
export function validateSubmission(fields: RuleField[], values: Record<string, unknown>): Record<string, string> {
  const visible = computeVisibility(fields, values);
  const errors: Record<string, string> = {};
  for (const f of fields) {
    if (f.type === 'section') continue;
    if (!visible[f.key]) continue;
    if (isRequired(f, values) && isEmpty(values[f.key])) { errors[f.key] = 'required'; continue; }
    const e = validateValue(f, values[f.key]);
    if (e) errors[f.key] = e;
  }
  return errors;
}
