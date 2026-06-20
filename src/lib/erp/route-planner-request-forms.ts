import type { RpTicketType } from './route-planner-backend';

/**
 * Request Center — per-type form schemas. Each ticket type has its OWN smart form with
 * proper required/optional fields. Declarative so the UI stays DRY and the rules are
 * testable. The Request Center remains routing/tracking ONLY: these fields describe a
 * REQUESTED change and never write to official master data — an admin implements the
 * approved change in the external system, then closes the ticket.
 */

export type FieldKind = 'text' | 'tel' | 'email' | 'number' | 'date' | 'textarea' | 'select' | 'gps' | 'attachments' | 'stopType' | 'customerRef' | 'section';

export interface FormField {
  key: string;
  labelKey: string;
  kind: FieldKind;
  required?: boolean;
  /** Option-set name (for kind 'select'). */
  options?: OptionSet;
  /** Marks the GPS field whose value maps to the row's gps_lat / gps_lng columns. */
  primaryGps?: boolean;
  /** Optional helper text key shown under the field. */
  hintKey?: string;
}

export interface RequestForm {
  descKey: string;
  /** Which field supplies the row's customer_ref (display handle). */
  customerRefKey: string;
  /** Which field supplies the row's reason column. */
  reasonKey?: string;
  fields: FormField[];
}

export type OptionSet = 'channel' | 'custClass' | 'paymentTerms' | 'updateField';

/** Stable option codes; labels are resolved via i18n key `rc_opt_<set>_<code>`. */
export const OPTION_SETS: Record<OptionSet, string[]> = {
  channel: ['retail', 'wholesale', 'horeca', 'pharmacy', 'other'],
  custClass: ['a', 'b', 'c', 'd'],
  paymentTerms: ['cash', 'net15', 'net30', 'net60'],
  updateField: ['name', 'cr', 'vat', 'address', 'contact', 'mobile', 'email', 'credit', 'payment', 'class', 'channel', 'other'],
};

const ATTACH: FormField = { key: 'attachments', labelKey: 'rc_f_attachments', kind: 'attachments', hintKey: 'rc_h_attachments' };
const NOTES: FormField = { key: 'notes', labelKey: 'rc_f_notes', kind: 'textarea' };

export const REQUEST_FORMS: Record<RpTicketType, RequestForm> = {
  new_customer: {
    descKey: 'rc_desc_new_customer', customerRefKey: 'name', reasonKey: 'reason',
    fields: [
      // Identity
      { key: 'name', labelKey: 'rc_f_name', kind: 'text', required: true },
      { key: 'code', labelKey: 'rc_f_code', kind: 'text', hintKey: 'rc_h_code' },
      { key: 'channel', labelKey: 'rc_f_channel', kind: 'select', options: 'channel', required: true },
      { key: 'class', labelKey: 'rc_f_class', kind: 'select', options: 'custClass' },
      // Compliance / taxation
      { key: '_sec_compliance', labelKey: 'rc_sec_compliance', kind: 'section' },
      { key: 'cr', labelKey: 'rc_f_cr', kind: 'text', hintKey: 'rc_h_cr' },
      { key: 'vat', labelKey: 'rc_f_vat', kind: 'text', hintKey: 'rc_h_vat' },
      // Communication
      { key: '_sec_contact', labelKey: 'rc_sec_contact', kind: 'section' },
      { key: 'contact', labelKey: 'rc_f_contact', kind: 'text', required: true },
      { key: 'mobile', labelKey: 'rc_f_mobile', kind: 'tel', required: true },
      { key: 'email', labelKey: 'rc_f_email', kind: 'email' },
      // National Address (structured) — GPS kept separate
      { key: '_sec_address', labelKey: 'rc_sec_address', kind: 'section' },
      { key: 'buildingNo', labelKey: 'rc_f_buildingNo', kind: 'text', required: true },
      { key: 'street', labelKey: 'rc_f_street', kind: 'text', required: true },
      { key: 'district', labelKey: 'rc_f_district', kind: 'text', required: true },
      { key: 'city', labelKey: 'rc_f_city', kind: 'text', required: true },
      { key: 'postalCode', labelKey: 'rc_f_postalCode', kind: 'text', required: true },
      { key: 'additionalNo', labelKey: 'rc_f_additionalNo', kind: 'text', required: true, hintKey: 'rc_h_additionalNo' },
      { key: 'unitNo', labelKey: 'rc_f_unitNo', kind: 'text' },
      { key: 'gps', labelKey: 'rc_f_gps', kind: 'gps', required: true, primaryGps: true },
      // Routing & credit
      { key: '_sec_ops', labelKey: 'rc_sec_ops', kind: 'section' },
      { key: 'salesmanRoute', labelKey: 'rc_f_salesmanRoute', kind: 'text' },
      { key: 'creditLimit', labelKey: 'rc_f_creditLimit', kind: 'number' },
      { key: 'paymentTerms', labelKey: 'rc_f_paymentTerms', kind: 'select', options: 'paymentTerms' },
      // Justification
      { key: 'reason', labelKey: 'rc_f_justification', kind: 'textarea', required: true },
      ATTACH, NOTES,
    ],
  },
  update: {
    descKey: 'rc_desc_update', customerRefKey: 'customerRef', reasonKey: 'reason',
    fields: [
      { key: 'customerRef', labelKey: 'rc_f_customerRef', kind: 'customerRef', required: true, hintKey: 'rc_h_customerRef' },
      { key: 'field', labelKey: 'rc_f_field', kind: 'select', options: 'updateField', required: true },
      { key: 'currentValue', labelKey: 'rc_f_currentValue', kind: 'text', required: true },
      { key: 'newValue', labelKey: 'rc_f_newValue', kind: 'text', required: true },
      { key: 'reason', labelKey: 'rc_f_reason', kind: 'textarea', required: true },
      ATTACH,
    ],
  },
  temp_stop: stopForm('rc_desc_temp_stop'),
  perm_stop: stopForm('rc_desc_perm_stop'),
  location_fix: {
    descKey: 'rc_desc_location_fix', customerRefKey: 'customerRef', reasonKey: 'reason',
    fields: [
      { key: 'customerRef', labelKey: 'rc_f_customerRef', kind: 'customerRef', required: true, hintKey: 'rc_h_customerRef' },
      { key: 'currentGps', labelKey: 'rc_f_currentGps', kind: 'gps' },
      { key: 'newGps', labelKey: 'rc_f_newGps', kind: 'gps', required: true, primaryGps: true },
      { key: 'addressNotes', labelKey: 'rc_f_addressNotes', kind: 'textarea' },
      { key: 'reason', labelKey: 'rc_f_reason', kind: 'textarea' },
      { ...ATTACH, hintKey: 'rc_h_proof' },
    ],
  },
  reassignment: routeForm('rc_desc_reassignment'),
  route_change: routeForm('rc_desc_route_change'),
};

function stopForm(descKey: string): RequestForm {
  return {
    descKey, customerRefKey: 'customerRef', reasonKey: 'reason',
    fields: [
      { key: 'customerRef', labelKey: 'rc_f_customerRef', kind: 'customerRef', required: true, hintKey: 'rc_h_customerRef' },
      { key: 'stopType', labelKey: 'rc_f_stopType', kind: 'stopType', required: true },
      { key: 'effectiveDate', labelKey: 'rc_f_effectiveDate', kind: 'date', required: true },
      { key: 'reason', labelKey: 'rc_f_stopReason', kind: 'textarea', required: true },
      ATTACH,
    ],
  };
}

function routeForm(descKey: string): RequestForm {
  return {
    descKey, customerRefKey: 'customerRef', reasonKey: 'reason',
    fields: [
      { key: 'customerRef', labelKey: 'rc_f_customerRef', kind: 'customerRef', required: true, hintKey: 'rc_h_customerRef' },
      { key: 'currentRoute', labelKey: 'rc_f_currentRoute', kind: 'text', required: true },
      { key: 'requestedRoute', labelKey: 'rc_f_requestedRoute', kind: 'text', required: true },
      { key: 'effectiveDate', labelKey: 'rc_f_effectiveDate', kind: 'date', required: true },
      { key: 'reason', labelKey: 'rc_f_reason', kind: 'textarea', required: true },
    ],
  };
}

/** Value accessor for a field given the flat form-values map (gps uses `${key}_lat/_lng`). */
export function fieldFilled(field: FormField, values: Record<string, string>): boolean {
  if (field.kind === 'attachments' || field.kind === 'stopType' || field.kind === 'section') return true; // not user-required text
  if (field.kind === 'gps') {
    const lat = values[`${field.key}_lat`]?.trim(); const lng = values[`${field.key}_lng`]?.trim();
    return Boolean(lat && lng && Number.isFinite(Number(lat)) && Number.isFinite(Number(lng)));
  }
  return Boolean(values[field.key]?.trim());
}

/** Returns the labelKeys of required fields that are still empty/invalid. */
export function validateRequest(form: RequestForm, values: Record<string, string>): string[] {
  return form.fields.filter((f) => f.required && !fieldFilled(f, values)).map((f) => f.labelKey);
}

/** Build the persisted `details` payload (skips empty values; folds gps into lat/lng pairs). */
export function buildDetails(form: RequestForm, values: Record<string, string>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of form.fields) {
    if (f.kind === 'attachments' || f.kind === 'stopType' || f.kind === 'section') continue;
    if (f.kind === 'gps') {
      const lat = values[`${f.key}_lat`]?.trim(); const lng = values[`${f.key}_lng`]?.trim();
      if (lat && lng) out[f.key] = { lat: Number(lat), lng: Number(lng) };
      continue;
    }
    const v = values[f.key]?.trim();
    if (v) out[f.key] = f.kind === 'number' ? Number(v) : v;
  }
  return out;
}

/** The primary GPS (mapped to gps_lat/gps_lng) if present and valid. */
export function primaryGps(form: RequestForm, values: Record<string, string>): { lat: number; lng: number } | null {
  const f = form.fields.find((x) => x.primaryGps);
  if (!f) return null;
  const lat = Number(values[`${f.key}_lat`]); const lng = Number(values[`${f.key}_lng`]);
  return Number.isFinite(lat) && Number.isFinite(lng) && values[`${f.key}_lat`] && values[`${f.key}_lng`] ? { lat, lng } : null;
}
