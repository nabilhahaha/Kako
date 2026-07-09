/**
 * Validation Engine contracts. Every rule is an independent, self-describing
 * unit that reads a read-only {@link ValidationContext} and returns findings.
 * New rules are added by dropping a file into ./rules and registering it — no
 * existing rule needs to change (open/closed principle).
 */
import type { ValidationConfig } from '../domain/config';
import type { Severity } from '../domain/enums';
import type {
  DeliveryNote,
  DeliveryNoteLine,
  Invoice,
  InvoiceLine,
  PI,
  PiLine,
  ValidationResult,
} from '../domain/models';

/** Immutable snapshot of all data a rule may need. */
export interface ValidationContext {
  now: Date;
  config: ValidationConfig;
  pis: PI[];
  piLines: PiLine[];
  deliveryNotes: DeliveryNote[];
  deliveryNoteLines: DeliveryNoteLine[];
  invoices: Invoice[];
  invoiceLines: InvoiceLine[];
}

/** A finding is a ValidationResult before persistence metadata is attached. */
export type ValidationFinding = Omit<
  ValidationResult,
  'id' | 'createdAt' | 'coveredByExceptionId'
>;

export interface ValidationRule {
  /** Stable machine code, e.g. "DN_BELONGS_TO_PI". */
  code: string;
  /** Human-readable name. */
  name: string;
  /** What the rule checks and why. */
  description: string;
  /** True if a failure of this rule must be resolved via an Exception. */
  requiresExceptionOnFail: boolean;
  run(ctx: ValidationContext): ValidationFinding[];
}

/** Convenience factory so rules stay terse and consistent. */
export function finding(
  base: Pick<ValidationFinding, 'ruleCode' | 'ruleName' | 'severity' | 'scope' | 'message'> &
    Partial<ValidationFinding>,
): ValidationFinding {
  return {
    piId: null,
    piNumber: null,
    deliveryNoteNumber: null,
    invoiceNumber: null,
    sku: null,
    details: {},
    ...base,
  };
}

export const severityFromBool = (ok: boolean): Severity => (ok ? 'pass' : 'fail');
