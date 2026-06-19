/**
 * Recommended customer field-governance baseline (G6b) — the opt-in template a
 * Company Admin can apply with one click. It is NEVER auto-applied; it only
 * pre-seeds `erp_field_access` rows for the customer entity when explicitly
 * chosen, and the admin can re-customize afterwards (company overrides remain the
 * final authority). Restricted to registered governable customer fields.
 */
import type { AccessLevel } from './field-governance';

export interface BaselineRow {
  field: string;
  role: string;
  access: AccessLevel;
}

/** Legal/commercial identity — visible to the field, edited only by Admin. */
const VIEW_ONLY = ['name', 'cr_number', 'tax_number'];
/** Data-correction · commercial controls · classification · route — Salesman
 *  view, Supervisor may request a change; Admin edits (registry default). */
const REQUESTABLE = [
  'national_address', 'phone', 'contact_person', 'contact_phone', 'email',
  'credit_limit', 'payment_terms_days',
  'classification_id', 'channel_id', 'segment_id', 'route_id',
];

export const CUSTOMER_GOVERNANCE_BASELINE: BaselineRow[] = [
  ...VIEW_ONLY.flatMap((field) => [
    { field, role: 'salesman', access: 'view' as const },
    { field, role: 'supervisor', access: 'view' as const },
  ]),
  ...REQUESTABLE.flatMap((field) => [
    { field, role: 'salesman', access: 'view' as const },
    { field, role: 'supervisor', access: 'request' as const },
  ]),
];
