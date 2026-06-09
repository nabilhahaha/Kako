// Universal Change Request engine — PURE lifecycle: state machine, field diffing,
// and declarative validation. No I/O (DB-backed checks — reference existence,
// required attachments — are evaluated server-side). Unit-testable.

import type { ChangeRequestStatus, ValidationSpec } from './types';
import { getValidator } from './registry';

// ── State machine ───────────────────────────────────────────────────────────
const TRANSITIONS: Record<ChangeRequestStatus, ChangeRequestStatus[]> = {
  draft:             ['submitted', 'cancelled'],
  submitted:         ['pending', 'rejected', 'cancelled'],
  pending:           ['approved', 'rejected', 'cancelled'],
  approved:          ['scheduled', 'applying', 'cancelled'],
  scheduled:         ['applying', 'cancelled'],
  applying:          ['applied', 'partially_applied', 'failed'],
  applied:           [],
  partially_applied: [],
  failed:            [],
  rejected:          [],
  cancelled:         [],
};

/** Is `to` a legal next status from `from`? */
export function canTransition(from: ChangeRequestStatus, to: ChangeRequestStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export const TERMINAL_STATUSES: ReadonlySet<ChangeRequestStatus> = new Set([
  'applied', 'partially_applied', 'failed', 'rejected', 'cancelled',
]);

/** A request in a terminal state can no longer transition. */
export function isTerminal(s: ChangeRequestStatus): boolean {
  return TERMINAL_STATUSES.has(s);
}

// ── Field diffing ───────────────────────────────────────────────────────────
export interface FieldChange { fieldKey: string; oldValue: unknown; newValue: unknown }

function norm(v: unknown): string {
  return v === null || v === undefined || v === '' ? '' : String(v);
}

/** Equal for change-detection: numbers compared numerically, else normalized strings. */
export function valuesEqual(a: unknown, b: unknown): boolean {
  const an = typeof a === 'number' || typeof b === 'number';
  if (an && a != null && b != null && a !== '' && b !== '') return Number(a) === Number(b);
  return norm(a) === norm(b);
}

/** The fields whose proposed value differs from the current record. Honors the
 *  entity's allowed-field whitelist (null = any field is changeable; DFG decides). */
export function diffChanges(
  current: Record<string, unknown>,
  proposed: Record<string, unknown>,
  allowedFields: string[] | null,
): FieldChange[] {
  const allow = allowedFields == null ? null : new Set(allowedFields);
  const out: FieldChange[] = [];
  for (const k of Object.keys(proposed)) {
    if (allow && !allow.has(k)) continue;
    const oldValue = current[k] ?? null;
    const newValue = proposed[k];
    if (!valuesEqual(oldValue, newValue)) out.push({ fieldKey: k, oldValue, newValue });
  }
  return out;
}

/** Fields in the proposed patch that the entity does not permit changing. */
export function disallowedFields(proposed: Record<string, unknown>, allowedFields: string[] | null): string[] {
  if (allowedFields == null) return [];
  const allow = new Set(allowedFields);
  return Object.keys(proposed).filter((k) => !allow.has(k));
}

// ── Declarative validation (in-process rules) ───────────────────────────────
export interface ValidationError { field: string; rule: string }

/** Validation needs that require server-side I/O (DB existence / attachments). */
export interface ValidationDeferred {
  references: { field: string; table: string; value: unknown }[];
  requiredDocTypes: string[];
}

function isEmpty(v: unknown): boolean {
  return v === null || v === undefined || v === '';
}

/**
 * Evaluate the in-process declarative rules against the proposed values and
 * return errors plus the DB-backed checks the caller must still run. `entityKey`
 * is passed to named validators for context.
 */
export function evaluateValidation(
  spec: ValidationSpec,
  values: Record<string, unknown>,
  entityKey: string,
): { errors: ValidationError[]; deferred: ValidationDeferred } {
  const errors: ValidationError[] = [];
  const deferred: ValidationDeferred = { references: [], requiredDocTypes: [] };
  const present = (f: string) => Object.prototype.hasOwnProperty.call(values, f);
  const add = (field: string, rule: string) => errors.push({ field, rule });

  for (const r of spec.rules ?? []) {
    const has = present(r.field);
    const v = values[r.field];

    if (r.required && (!has || isEmpty(v))) { add(r.field, 'required'); continue; }
    if (!has || isEmpty(v)) {
      // Field not being set — only a required violation matters; skip value checks.
      if (r.requiresDocType) deferred.requiredDocTypes.push(r.requiresDocType);
      continue;
    }

    if (r.type === 'number' && Number.isNaN(Number(v))) add(r.field, 'type');
    if (r.type === 'boolean' && typeof v !== 'boolean' && v !== 'true' && v !== 'false') add(r.field, 'type');
    if (r.type === 'date' && Number.isNaN(Date.parse(String(v)))) add(r.field, 'type');
    if (r.min != null && Number(v) < r.min) add(r.field, 'min');
    if (r.max != null && Number(v) > r.max) add(r.field, 'max');
    if (r.regex && !new RegExp(r.regex).test(String(v))) add(r.field, 'regex');
    if (r.enum && !r.enum.map(String).includes(String(v))) add(r.field, 'enum');
    if (r.validator) {
      const fn = getValidator(r.validator);
      if (fn && fn(v, { field: r.field, entityKey }) != null) add(r.field, 'validator');
    }
    if (r.reference) deferred.references.push({ field: r.field, table: r.reference, value: v });
    if (r.requiresDocType) deferred.requiredDocTypes.push(r.requiresDocType);
  }

  return { errors, deferred };
}
