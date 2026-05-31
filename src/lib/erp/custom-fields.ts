/** ── Custom Fields — shared types, validation & coercion ───────────────────
 *
 * Core Platform capability (docs/PRODUCT_PRINCIPLES.md). Definitions are stored
 * in erp_custom_fields (per company + entity); VALUES live in a `custom jsonb`
 * bag on the entity row. This module is the single source of truth for field
 * types, value validation, and coercion — reused by the Import Engine and the
 * Dynamic Forms foundation so behaviour is identical everywhere.
 */

export type CustomFieldType = 'text' | 'number' | 'date' | 'boolean' | 'select' | 'multiselect' | 'file';

export const CUSTOM_FIELD_TYPES: CustomFieldType[] = ['text', 'number', 'date', 'boolean', 'select', 'multiselect', 'file'];
export const CUSTOM_FIELD_TYPE_LABELS: Record<CustomFieldType, { en: string; ar: string }> = {
  text: { en: 'Text', ar: 'نص' },
  number: { en: 'Number', ar: 'رقم' },
  date: { en: 'Date', ar: 'تاريخ' },
  boolean: { en: 'Yes / No', ar: 'نعم / لا' },
  select: { en: 'Select (one)', ar: 'اختيار (واحد)' },
  multiselect: { en: 'Multi-select', ar: 'اختيار متعدد' },
  file: { en: 'File', ar: 'ملف' },
};

export interface CustomFieldOption { value: string; label_en?: string; label_ar?: string }
export interface CustomFieldValidation { min?: number; max?: number; minLen?: number; maxLen?: number; regex?: string }
export type VisibilityOp = 'eq' | 'neq' | 'in' | 'gt' | 'lt';
export interface VisibilityRule { when: string; op: VisibilityOp; value: unknown }

export interface CustomFieldDef {
  id: string;
  entity: string;
  key: string;
  label_ar: string;
  label_en: string | null;
  type: CustomFieldType;
  required: boolean;
  options: CustomFieldOption[];
  validation: CustomFieldValidation;
  visibility: VisibilityRule | null;
  sort: number;
  is_active: boolean;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Is a value "empty" for required-checks? */
export function isEmpty(v: unknown): boolean {
  if (v == null) return true;
  if (typeof v === 'string') return v.trim() === '';
  if (Array.isArray(v)) return v.length === 0;
  return false;
}

/** Coerce a raw (often string, e.g. from an import cell) value into the typed
 *  shape stored in the `custom` jsonb. Returns undefined for empty. */
export function coerceCustomValue(def: Pick<CustomFieldDef, 'type'>, raw: unknown): unknown {
  if (isEmpty(raw)) return undefined;
  const s = typeof raw === 'string' ? raw.trim() : raw;
  switch (def.type) {
    case 'number': return typeof s === 'number' ? s : Number(String(s));
    case 'boolean': {
      const t = String(s).toLowerCase();
      return t === 'true' || t === '1' || t === 'yes' || t === 'نعم';
    }
    case 'multiselect':
      return Array.isArray(s) ? s.map(String) : String(s).split(/[|,]/).map((x) => x.trim()).filter(Boolean);
    case 'file': // import/forms store a reference; pass through string/object
      return s;
    default: return String(s); // text, date (ISO string), select
  }
}

/** Validate a raw value against a definition. Returns null if valid, else an
 *  English message (the Import Engine surfaces it; forms map to i18n). */
export function validateCustomValue(def: CustomFieldDef, raw: unknown): string | null {
  const label = def.label_en || def.label_ar || def.key;
  if (isEmpty(raw)) return def.required ? `${label} is required` : null;
  const v = coerceCustomValue(def, raw);
  const val = def.validation ?? {};

  switch (def.type) {
    case 'number': {
      const n = v as number;
      if (typeof n !== 'number' || Number.isNaN(n)) return `${label}: invalid number`;
      if (val.min != null && n < val.min) return `${label}: must be ≥ ${val.min}`;
      if (val.max != null && n > val.max) return `${label}: must be ≤ ${val.max}`;
      return null;
    }
    case 'date':
      if (Number.isNaN(Date.parse(String(v)))) return `${label}: invalid date`;
      return null;
    case 'boolean':
      return null;
    case 'select':
      if (!def.options.some((o) => o.value === String(v))) return `${label}: not an allowed option`;
      return null;
    case 'multiselect': {
      const arr = (v as string[]) ?? [];
      const allowed = new Set(def.options.map((o) => o.value));
      const bad = arr.find((x) => !allowed.has(x));
      return bad ? `${label}: "${bad}" is not an allowed option` : null;
    }
    case 'file':
      return null;
    default: { // text
      const s = String(v);
      if (val.minLen != null && s.length < val.minLen) return `${label}: too short`;
      if (val.maxLen != null && s.length > val.maxLen) return `${label}: too long`;
      if (val.regex) { try { if (!new RegExp(val.regex).test(s)) return `${label}: invalid format`; } catch { /* ignore bad regex */ } }
      if (def.key.toLowerCase().includes('email') && !EMAIL_RE.test(s)) return `${label}: invalid email`;
      return null;
    }
  }
}

/** Evaluate a field's visibility rule against the current form values. A field
 *  with no rule is always visible; a hidden field is skipped in validation. */
export function isFieldVisible(def: Pick<CustomFieldDef, 'visibility'>, values: Record<string, unknown>): boolean {
  const r = def.visibility;
  if (!r || !r.when) return true;
  const other = values[r.when];
  switch (r.op) {
    case 'eq': return String(other ?? '') === String(r.value ?? '');
    case 'neq': return String(other ?? '') !== String(r.value ?? '');
    case 'in': return Array.isArray(r.value) && (r.value as unknown[]).map(String).includes(String(other ?? ''));
    case 'gt': return Number(other) > Number(r.value);
    case 'lt': return Number(other) < Number(r.value);
    default: return true;
  }
}

/** A slug usable as a jsonb key + column-ish identifier. */
export function slugifyFieldKey(raw: string): string {
  return raw.trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);
}
