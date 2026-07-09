/**
 * Domain enums and shared string-literal unions. Free of UI/persistence
 * concerns.
 */

/**
 * The five operational PI statuses defined by the workflow.
 * PI -> Delivery Note(s) -> Invoice(s).
 */
export type PiStatus =
  | 'OPEN'
  | 'PARTIALLY_DELIVERED'
  | 'WAITING_INVOICE'
  | 'COMPLETED'
  | 'COMPLETED_WITH_EXCEPTION';

export const PI_STATUS_LABELS: Record<PiStatus, string> = {
  OPEN: 'Open',
  PARTIALLY_DELIVERED: 'Partially Delivered',
  WAITING_INVOICE: 'Waiting Invoice',
  COMPLETED: 'Completed',
  COMPLETED_WITH_EXCEPTION: 'Completed with Exception',
};

/**
 * Severity of a validation result. Maps onto the mandated colour standards:
 *   pass=Green, warning=Yellow, exception=Orange, fail=Red.
 */
export type Severity = 'pass' | 'warning' | 'exception' | 'fail';

export const SEVERITY_LABELS: Record<Severity, string> = {
  pass: 'Passed',
  warning: 'Warning',
  exception: 'Exception',
  fail: 'Failed',
};

/** Ordered by increasing seriousness — used to roll up an overall verdict. */
export const SEVERITY_RANK: Record<Severity, number> = {
  pass: 0,
  warning: 1,
  exception: 2,
  fail: 3,
};

export type ExceptionStatus = 'pending' | 'approved' | 'rejected';

export const EXCEPTION_STATUS_LABELS: Record<ExceptionStatus, string> = {
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
};

/** Audit log action verbs. Extend freely — never remove. */
export type AuditAction =
  | 'PI_CREATE'
  | 'PI_UPDATE'
  | 'PI_DELETE'
  | 'DN_CREATE'
  | 'DN_DELETE'
  | 'INVOICE_CREATE'
  | 'INVOICE_DELETE'
  | 'VALIDATION_RUN'
  | 'EXCEPTION_CREATE'
  | 'EXCEPTION_UPDATE'
  | 'CONFIG_UPDATE'
  | 'DATA_RESET';
