// ============================================================================
// Multi-Form Field Work — generic form schema (pure, no I/O / no React).
//
// This is the model for ADMIN-BUILT custom forms (Market Visit, Competitor Check,
// Near Expiry, Asset Verification, …). It is intentionally SEPARATE from the Field
// Verification form model (fv-verification-form.ts), which stays locked to its 6 fixed
// fields and its bespoke erp_rp_customer_verifications pipeline. New forms store their
// schema in erp_form_versions.schema and their submissions in erp_form_responses.
//
// A form schema is { settings, fields[] }. The resolver normalizes an arbitrary stored
// jsonb into typed, ordered, safe fields — mirroring the FV resolver's defensive parsing
// so a malformed/old schema can never crash the builder, runner, or report.
// ============================================================================

/** Field input types a custom form can use. */
export type FormFieldType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'select'
  | 'multiselect'
  | 'boolean'
  | 'date'
  | 'phone'
  | 'photo'
  | 'photos';

export const FORM_FIELD_TYPES: FormFieldType[] = [
  'text', 'textarea', 'number', 'select', 'multiselect', 'boolean', 'date', 'phone', 'photo', 'photos',
];

const FIELD_TYPE_SET = new Set<FormFieldType>(FORM_FIELD_TYPES);
export function isFormFieldType(v: unknown): v is FormFieldType {
  return typeof v === 'string' && FIELD_TYPE_SET.has(v as FormFieldType);
}

/** A photo-collecting field (drives the photo badge + photoRequired handling). */
export function isPhotoField(t: FormFieldType): boolean {
  return t === 'photo' || t === 'photos';
}
/** A field whose value comes from a fixed option list. */
export function isChoiceField(t: FormFieldType): boolean {
  return t === 'select' || t === 'multiselect';
}

/** One option for select / multiselect fields. */
export interface FormFieldOption {
  value: string;
  labelEn: string;
  labelAr: string;
}

/** A single configurable field/question on a custom form. */
export interface FormField {
  /** Stable id (uuid-like). Submissions reference answers by this id, so it must never
   *  change once a version is published — historical answers stay resolvable. */
  id: string;
  type: FormFieldType;
  labelEn: string;
  labelAr: string;
  required: boolean;
  visible: boolean;
  order: number;
  help: string | null;
  /** Only meaningful for select/multiselect. */
  options: FormFieldOption[];
  /** Only meaningful for photo/photos — require at least one image. */
  photoRequired: boolean;
  /** Include this field as a column in reports/exports. */
  includeInReport: boolean;
}

/** How a form relates to a customer record. */
export type CustomerLink = 'required' | 'optional' | 'none';
export const CUSTOMER_LINKS: CustomerLink[] = ['required', 'optional', 'none'];

/** Form-level settings. */
export interface FormSettings {
  /** Capture GPS and (when a customer is linked) enforce the radius lock at submit. */
  requireGps: boolean;
  /** Optional explicit radius override (metres). null = use the company default. */
  radiusM: number | null;
  /** Whether/how a submission attaches to a customer. */
  customerLink: CustomerLink;
}

/** The full versioned schema persisted in erp_form_versions.schema. */
export interface FormSchema {
  settings: FormSettings;
  fields: FormField[];
}

export const DEFAULT_FORM_SETTINGS: FormSettings = {
  requireGps: false,
  radiusM: null,
  customerLink: 'optional',
};

/** A fresh empty schema for a brand-new draft form. */
export function emptyFormSchema(): FormSchema {
  return { settings: { ...DEFAULT_FORM_SETTINGS }, fields: [] };
}

// ── Parsing / normalization ──────────────────────────────────────────────────

function asString(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}
function asBool(v: unknown, dflt: boolean): boolean {
  return typeof v === 'boolean' ? v : dflt;
}

function parseOptions(v: unknown): FormFieldOption[] {
  if (!Array.isArray(v)) return [];
  const out: FormFieldOption[] = [];
  for (const o of v) {
    const value = asString((o as Record<string, unknown>)?.value);
    if (value == null || value === '') continue;
    const labelEn = asString((o as Record<string, unknown>)?.labelEn) ?? value;
    const labelAr = asString((o as Record<string, unknown>)?.labelAr) ?? value;
    out.push({ value, labelEn, labelAr });
  }
  return out;
}

function parseField(raw: unknown, index: number): FormField | null {
  const o = raw as Record<string, unknown>;
  if (!o) return null;
  const type = o.type;
  if (!isFormFieldType(type)) return null;
  const id = asString(o.id);
  if (!id) return null;
  const orderRaw = o.order;
  return {
    id,
    type,
    labelEn: asString(o.labelEn) ?? '',
    labelAr: asString(o.labelAr) ?? '',
    required: asBool(o.required, false),
    visible: asBool(o.visible, true),
    order: typeof orderRaw === 'number' && Number.isFinite(orderRaw) ? orderRaw : index,
    help: asString(o.help),
    options: isChoiceField(type) ? parseOptions(o.options) : [],
    photoRequired: isPhotoField(type) ? asBool(o.photoRequired, false) : false,
    includeInReport: asBool(o.includeInReport, true),
  };
}

function parseSettings(raw: unknown): FormSettings {
  const o = (raw as Record<string, unknown>) ?? {};
  const link = o.customerLink;
  const radius = o.radiusM;
  return {
    requireGps: asBool(o.requireGps, DEFAULT_FORM_SETTINGS.requireGps),
    radiusM: typeof radius === 'number' && Number.isFinite(radius) ? radius : null,
    customerLink: CUSTOMER_LINKS.includes(link as CustomerLink)
      ? (link as CustomerLink)
      : DEFAULT_FORM_SETTINGS.customerLink,
  };
}

/** Normalize an arbitrary stored schema jsonb into a safe, ordered FormSchema.
 *  Unknown/old/malformed shapes degrade gracefully (never throw). Fields are sorted by
 *  `order` then original index, and duplicate ids are dropped (first wins). */
export function resolveFormSchema(raw: unknown): FormSchema {
  const fieldsRaw = (raw as { fields?: unknown } | null)?.fields;
  const parsed: FormField[] = [];
  const seen = new Set<string>();
  if (Array.isArray(fieldsRaw)) {
    fieldsRaw.forEach((f, i) => {
      const field = parseField(f, i);
      if (field && !seen.has(field.id)) {
        seen.add(field.id);
        parsed.push(field);
      }
    });
  }
  parsed.sort((a, b) => a.order - b.order);
  // Re-pack order to a clean 0..n-1 sequence so the builder/preview are stable.
  parsed.forEach((f, i) => { f.order = i; });
  return { settings: parseSettings((raw as { settings?: unknown } | null)?.settings), fields: parsed };
}

/** Only the visible fields, in order — what the runner + preview render. */
export function visibleFields(schema: FormSchema): FormField[] {
  return schema.fields.filter((f) => f.visible);
}

/** Fields that should appear as report/export columns, in order. */
export function reportFields(schema: FormSchema): FormField[] {
  return schema.fields.filter((f) => f.includeInReport);
}

// ── Build (for save) + validation (for publish) ──────────────────────────────

/** Clean a schema for persistence: drop empties, re-pack order. Pure. */
export function buildFormSchema(input: FormSchema): FormSchema {
  return resolveFormSchema(input);
}

export interface FormSchemaError {
  /** field id, or 'form' for form-level issues. */
  scope: string;
  code: 'no_fields' | 'missing_label' | 'choice_no_options' | 'duplicate_id';
}

/** Publish-time validation. Returns [] when the schema is publishable. */
export function validateFormSchema(schema: FormSchema): FormSchemaError[] {
  const errors: FormSchemaError[] = [];
  if (schema.fields.length === 0) {
    errors.push({ scope: 'form', code: 'no_fields' });
  }
  const ids = new Set<string>();
  for (const f of schema.fields) {
    if (ids.has(f.id)) errors.push({ scope: f.id, code: 'duplicate_id' });
    ids.add(f.id);
    if (!f.labelEn.trim() && !f.labelAr.trim()) errors.push({ scope: f.id, code: 'missing_label' });
    if (isChoiceField(f.type) && f.options.length === 0) errors.push({ scope: f.id, code: 'choice_no_options' });
  }
  return errors;
}

/** Localized label for a field (falls back to the other locale, then the id). */
export function fieldLabel(f: FormField, locale: 'ar' | 'en'): string {
  const primary = locale === 'ar' ? f.labelAr : f.labelEn;
  const secondary = locale === 'ar' ? f.labelEn : f.labelAr;
  return (primary && primary.trim()) || (secondary && secondary.trim()) || f.id;
}
