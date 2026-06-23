// Field Verification — form configuration (Form Builder Phase 1).
//
// The verification form is a REUSABLE, admin-configurable form — not only for Field
// Customer Verification, but for future use cases (market visits, competitor checks,
// merchandising audits, asset verification, store surveys, custom inspections). So EVERY
// field is configurable by the Company Admin: show/hide, required/optional, order, AR/EN
// label, help text.
//
// Safe defaults (the "Field Verification" template): City, Channel and Outside photo are
// visible + required by default. They are NOT permanently locked — an admin MAY relax them
// (the admin UI shows a warning: "This may weaken the standard Field Verification process")
// because the same module is reused for other inspection forms.
//
// Submit behavior follows the PUBLISHED config (which fields are required, plus a form-level
// requireGps toggle for the radius lock). If NO config is published, today's default behavior
// is preserved byte-for-byte.
//
// Pure module (no I/O / no React) so resolution is unit-tested.

/** Reused Form Builder code for the FV verification form (erp_forms.code). */
export const FV_FORM_CODE = 'fv_verification';

export type FvFieldKey = 'city' | 'channel' | 'outside_photo' | 'inside_photos' | 'phone' | 'notes';

export interface FvFieldDefault {
  key: FvFieldKey;
  /** Default i18n label key (used when the admin sets no custom label). */
  labelKey: string;
  /** Core to the standard FV process. Relaxing (hide / make optional) is ALLOWED but the
   *  admin UI warns it may weaken the standard Field Verification flow. NOT a hard lock. */
  warnOnRelax: boolean;
  defaultVisible: boolean;
  defaultRequired: boolean;
}

/** Canonical fields, default display order + the FV-template safe defaults. */
export const FV_CORE_FIELDS: FvFieldDefault[] = [
  { key: 'city',          labelKey: 'rpVerify.cityNew',      warnOnRelax: true,  defaultVisible: true, defaultRequired: true },
  { key: 'channel',       labelKey: 'rpVerify.channelNew',   warnOnRelax: true,  defaultVisible: true, defaultRequired: true },
  { key: 'outside_photo', labelKey: 'rpVerify.outsidePhoto', warnOnRelax: true,  defaultVisible: true, defaultRequired: true },
  { key: 'inside_photos', labelKey: 'rpVerify.insidePhotos', warnOnRelax: false, defaultVisible: true, defaultRequired: false },
  { key: 'phone',         labelKey: 'rpVerify.phone',        warnOnRelax: false, defaultVisible: true, defaultRequired: false },
  { key: 'notes',         labelKey: 'rpVerify.notes',        warnOnRelax: false, defaultVisible: true, defaultRequired: false },
];

/** Default for the form-level GPS/radius lock — preserves today's behavior when unset. */
export const FV_DEFAULT_REQUIRE_GPS = true;

const FV_FIELD_KEYS = new Set<FvFieldKey>(FV_CORE_FIELDS.map((f) => f.key));
export function isFvFieldKey(k: unknown): k is FvFieldKey {
  return typeof k === 'string' && FV_FIELD_KEYS.has(k as FvFieldKey);
}

/** Admin-set overrides for one field (any subset). Unknown keys are ignored by the resolver. */
export interface FvFieldOverride {
  key: FvFieldKey;
  labelEn?: string | null;
  labelAr?: string | null;
  visible?: boolean;
  required?: boolean;
  help?: string | null;
  order?: number;
}

/** Form-level settings (Phase 1: the GPS/radius lock toggle). */
export interface FvFormSettings {
  requireGps: boolean;
}

/** The fully-resolved field the rep form + admin UI render. `labelEn/labelAr = null` means
 *  "use the default i18n label". `relaxed` = a warn-on-relax field the admin has hidden or
 *  made optional (drives the admin warning + a report/QA signal). */
export interface ResolvedFvField {
  key: FvFieldKey;
  labelKey: string;
  labelEn: string | null;
  labelAr: string | null;
  visible: boolean;
  required: boolean;
  help: string | null;
  order: number;
  warnOnRelax: boolean;
  relaxed: boolean;
}

const clean = (s: string | null | undefined): string | null => (typeof s === 'string' && s.trim() ? s.trim() : null);

/** Sanitize one admin-entered override → only known keys + trimmed values (null when blank).
 *  Returns null for an unknown field key. Pure (used by the save action + unit-tested). */
export function sanitizeFvOverride(o: FvFieldOverride): FvFieldOverride | null {
  if (!o || !isFvFieldKey(o.key)) return null;
  const out: FvFieldOverride = { key: o.key };
  if (typeof o.visible === 'boolean') out.visible = o.visible;
  if (typeof o.required === 'boolean') out.required = o.required;
  if (typeof o.labelEn === 'string') out.labelEn = clean(o.labelEn);
  if (typeof o.labelAr === 'string') out.labelAr = clean(o.labelAr);
  if (typeof o.help === 'string') out.help = clean(o.help);
  if (typeof o.order === 'number' && Number.isFinite(o.order)) out.order = o.order;
  return out;
}

/** Build the persisted form schema { fields, settings } from admin input (drops unknown
 *  fields, trims values, coerces requireGps). The same shape the read path parses back. */
export function buildFvFormSchema(
  overrides: FvFieldOverride[],
  requireGps: boolean,
): { fields: FvFieldOverride[]; settings: FvFormSettings } {
  const fields = (overrides ?? [])
    .map(sanitizeFvOverride)
    .filter((x): x is FvFieldOverride => x !== null);
  return { fields, settings: { requireGps: !!requireGps } };
}

/**
 * Resolve the effective field list from admin overrides.
 *  - EVERY field is configurable: visible/required come from the override, else the default.
 *  - A hidden field is never required (it is not rendered — logical consistency, not a lock).
 *  - `relaxed` flags a warn-on-relax (core) field that has been hidden or made optional.
 *  - labels fall back to the default i18n label (null) when unset; ordering uses the explicit
 *    override order, else the canonical index.
 * `null`/empty overrides → the default form (today's behavior).
 */
export function resolveFvForm(overrides?: FvFieldOverride[] | null): ResolvedFvField[] {
  const byKey = new Map<FvFieldKey, FvFieldOverride>();
  for (const o of overrides ?? []) if (o && isFvFieldKey(o.key)) byKey.set(o.key, o);

  return FV_CORE_FIELDS
    .map((d, idx) => {
      const o = byKey.get(d.key);
      const visible = o?.visible ?? d.defaultVisible;
      const required = visible ? (o?.required ?? d.defaultRequired) : false;
      return {
        key: d.key,
        labelKey: d.labelKey,
        labelEn: clean(o?.labelEn),
        labelAr: clean(o?.labelAr),
        visible,
        required,
        help: clean(o?.help),
        order: typeof o?.order === 'number' && Number.isFinite(o.order) ? o.order : idx,
        warnOnRelax: d.warnOnRelax,
        relaxed: d.warnOnRelax && (!visible || !required),
      };
    })
    .sort((a, b) => a.order - b.order || FV_CORE_FIELDS.findIndex((f) => f.key === a.key) - FV_CORE_FIELDS.findIndex((f) => f.key === b.key));
}
