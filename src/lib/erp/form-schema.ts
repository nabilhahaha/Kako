/** ── Dynamic Forms Foundation — schema + validation ───────────────────────
 *
 * Core Platform capability (docs/CUSTOM-FIELDS.md). A form is GENERATED from an
 * entity's registry fields + its active custom fields, so defining a custom
 * field makes it appear (and validate) automatically. Shared by server actions
 * and the client renderer — one source of truth, reusing custom-fields.ts.
 */

import type { EntityField } from './entities';
import {
  validateCustomValue, isFieldVisible,
  type CustomFieldDef, type CustomFieldType, type CustomFieldOption,
  type CustomFieldValidation, type VisibilityRule,
} from './custom-fields';

export type FormFieldType = CustomFieldType | 'email' | 'ref';

export interface FormFieldSchema {
  key: string;
  labelAr: string;
  labelEn: string;
  type: FormFieldType;
  required: boolean;
  options: CustomFieldOption[];
  validation: CustomFieldValidation;
  visibility: VisibilityRule | null;
  /** Whether this field is a registry ("core") field or a custom field. */
  source: 'core' | 'custom';
}

/** Merge registry fields + active custom fields into one ordered schema. Core
 *  fields first (registry order), then custom fields (their `sort`). */
export function buildFormSchema(
  entityFields: EntityField[],
  customDefs: CustomFieldDef[],
): FormFieldSchema[] {
  const core: FormFieldSchema[] = (entityFields ?? []).map((f) => ({
    key: f.key, labelAr: f.labelAr, labelEn: f.labelEn,
    type: (f.type ?? 'text') as FormFieldType, required: Boolean(f.required),
    options: [], validation: {}, visibility: null, source: 'core',
  }));
  const custom: FormFieldSchema[] = [...(customDefs ?? [])]
    .filter((d) => d.is_active)
    .sort((a, b) => a.sort - b.sort)
    .map((d) => ({
      key: d.key, labelAr: d.label_ar, labelEn: d.label_en || d.key,
      type: d.type, required: d.required, options: d.options,
      validation: d.validation, visibility: d.visibility, source: 'custom',
    }));
  return [...core, ...custom];
}

/** Validate custom-field values against their definitions. Hidden fields (by
 *  visibility rule) are skipped. Returns a per-field error map (English messages,
 *  consistent with the Import Engine). */
export function validateCustomValues(
  defs: CustomFieldDef[],
  values: Record<string, unknown>,
): { ok: boolean; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  for (const def of defs) {
    if (!def.is_active) continue;
    if (!isFieldVisible(def, values)) continue; // skip hidden fields
    const msg = validateCustomValue(def, values[def.key]);
    if (msg) errors[def.key] = msg;
  }
  return { ok: Object.keys(errors).length === 0, errors };
}
