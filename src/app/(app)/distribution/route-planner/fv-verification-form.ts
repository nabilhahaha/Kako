// Field Verification — form configuration (Form Builder Phase 1).
//
// Phase 1 lets a Company Admin configure the EXISTING verification fields only:
// show/hide, required/optional, display order, AR/EN label, and help text. NO custom
// fields yet (Phase 2). The submit/radius/photo rules are enforced server-side and are
// NEVER weakened by this config — the resolver below pins "core-required" fields to
// visible + required regardless of what an override says.
//
// Pure module (no I/O / no React) so the resolution + guardrails are unit-tested. The
// stored overrides live in erp_form_versions.schema (reused Form Builder storage); the
// server action maps that jsonb to FvFieldOverride[] and calls resolveFvForm().

export type FvFieldKey = 'city' | 'channel' | 'outside_photo' | 'inside_photos' | 'phone' | 'notes';

export interface FvFieldDefault {
  key: FvFieldKey;
  /** Default i18n label keys (used when the admin sets no custom label). */
  labelKey: string;
  /** Enforced by the server submit (city/channel required; outside photo + radius lock).
   *  A core-required field is ALWAYS visible + required — config cannot weaken it. */
  coreRequired: boolean;
  defaultVisible: boolean;
  defaultRequired: boolean;
}

/** Canonical fields, in default display order. */
export const FV_CORE_FIELDS: FvFieldDefault[] = [
  { key: 'city',          labelKey: 'rpVerify.cityNew',      coreRequired: true,  defaultVisible: true, defaultRequired: true },
  { key: 'channel',       labelKey: 'rpVerify.channelNew',   coreRequired: true,  defaultVisible: true, defaultRequired: true },
  { key: 'outside_photo', labelKey: 'rpVerify.outsidePhoto', coreRequired: true,  defaultVisible: true, defaultRequired: true },
  { key: 'inside_photos', labelKey: 'rpVerify.insidePhotos', coreRequired: false, defaultVisible: true, defaultRequired: false },
  { key: 'phone',         labelKey: 'rpVerify.phone',        coreRequired: false, defaultVisible: true, defaultRequired: false },
  { key: 'notes',         labelKey: 'rpVerify.notes',        coreRequired: false, defaultVisible: true, defaultRequired: false },
];

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

/** The fully-resolved field the rep form + admin UI render. `labelEn/labelAr = null` means
 *  "use the default i18n label". */
export interface ResolvedFvField {
  key: FvFieldKey;
  labelKey: string;
  labelEn: string | null;
  labelAr: string | null;
  visible: boolean;
  required: boolean;
  help: string | null;
  order: number;
  coreRequired: boolean;
  /** Whether the admin UI may toggle visibility/required (false for core-required fields). */
  toggleable: boolean;
}

const clean = (s: string | null | undefined): string | null => (typeof s === 'string' && s.trim() ? s.trim() : null);

/**
 * Resolve the effective field list from admin overrides, applying the guardrails:
 *  - a core-required field is ALWAYS visible + required (config can't hide or relax it);
 *  - an optional field honors visible/required, but a hidden field is never required;
 *  - labels fall back to the default i18n label (null) when unset;
 *  - ordering: explicit override order, else the canonical index.
 * `null`/empty overrides → the default form (current behavior).
 */
export function resolveFvForm(overrides?: FvFieldOverride[] | null): ResolvedFvField[] {
  const byKey = new Map<FvFieldKey, FvFieldOverride>();
  for (const o of overrides ?? []) if (o && isFvFieldKey(o.key)) byKey.set(o.key, o);

  return FV_CORE_FIELDS
    .map((d, idx) => {
      const o = byKey.get(d.key);
      const visible = d.coreRequired ? true : (o?.visible ?? d.defaultVisible);
      const required = d.coreRequired ? true : (visible ? (o?.required ?? d.defaultRequired) : false);
      return {
        key: d.key,
        labelKey: d.labelKey,
        labelEn: clean(o?.labelEn),
        labelAr: clean(o?.labelAr),
        visible,
        required,
        help: clean(o?.help),
        order: typeof o?.order === 'number' && Number.isFinite(o.order) ? o.order : idx,
        coreRequired: d.coreRequired,
        toggleable: !d.coreRequired,
      };
    })
    .sort((a, b) => a.order - b.order || FV_CORE_FIELDS.findIndex((f) => f.key === a.key) - FV_CORE_FIELDS.findIndex((f) => f.key === b.key));
}
