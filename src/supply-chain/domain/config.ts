/**
 * Configurable business rules. Anything a business user might tune lives here
 * and is persisted so the Validation Engine reads it at runtime — nothing is
 * hard-coded elsewhere.
 */

export interface ValidationConfig {
  /** RULE 4 — minimum acceptable remaining shelf life, as a percentage. */
  minShelfLifePct: number;
  /**
   * RULE 2 — tolerance (in units) by which summed delivered quantity may exceed
   * the PI quantity before it is treated as a failure. Default 0.
   */
  maxQuantityDifference: number;
  /**
   * Invoice validation — tolerance (in units) for quantity mismatch between
   * delivery notes and invoices before it is flagged.
   */
  invoiceQuantityTolerance: number;
  /** date-fns compatible formats attempted, in order, when parsing dates. */
  dateFormats: string[];
  /** Operator attributed to actions when no explicit user is set. */
  defaultOperator: string;
}

export const DEFAULT_VALIDATION_CONFIG: ValidationConfig = {
  minShelfLifePct: 70,
  maxQuantityDifference: 0,
  invoiceQuantityTolerance: 0,
  dateFormats: [
    'yyyy-MM-dd',
    'dd/MM/yyyy',
    'MM/dd/yyyy',
    'dd-MM-yyyy',
    'dd.MM.yyyy',
    'd/M/yyyy',
    'yyyy/MM/dd',
  ],
  defaultOperator: 'operator@roshen',
};

export const CONFIG_SINGLETON_ID = 'validation-config';
