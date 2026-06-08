// ============================================================================
// Commercial Excellence — Master Data Governance engine (Phase 7). Pure. Generic
// change-request workflow protecting master-data quality across governed entities
// (customer/product/route/territory/price/VAT/GPS/supplier): create → review →
// approve/reject, with a configurable approval chain + full audit (old/new/by/
// when/reason). Generalizes the customer-approval + field-governance patterns. No I/O.
// ============================================================================

export type GovernedEntity = 'customer' | 'product' | 'route' | 'territory' | 'price' | 'vat' | 'gps' | 'supplier';

export type MdgStatus = 'draft' | 'submitted' | 'under_review' | 'approved' | 'rejected';

export interface MdgChangeRequest {
  entity: GovernedEntity;
  entityId: string;
  field: string;
  oldValue: unknown;
  newValue: unknown;
  reason?: string | null;
  status: MdgStatus;
  currentStage?: string | null;
}

const TRANSITIONS: Record<MdgStatus, readonly MdgStatus[]> = {
  draft: ['submitted'],
  submitted: ['under_review', 'approved', 'rejected'],
  under_review: ['approved', 'rejected'],
  approved: [],
  rejected: ['draft'],
};

/** True when a status change is permitted. Pure. */
export function canTransition(from: MdgStatus, to: MdgStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export class MdgTransitionError extends Error {
  constructor(public readonly from: MdgStatus, public readonly to: MdgStatus) {
    super(`illegal MDG transition: ${from} → ${to}`);
    this.name = 'MdgTransitionError';
  }
}

/** Validate + return next status, or throw. Pure. */
export function transition(from: MdgStatus, to: MdgStatus): MdgStatus {
  if (!canTransition(from, to)) throw new MdgTransitionError(from, to);
  return to;
}

/**
 * Advance a request through a configurable approval chain (e.g.
 * ['supervisor','data_steward']). Returns the next stage, or null when the final
 * stage approves (→ approved). Pure.
 */
export function nextStage(chain: readonly string[], currentStage: string | null): string | null {
  if (chain.length === 0) return null;
  if (currentStage == null) return chain[0];
  const i = chain.indexOf(currentStage);
  return i >= 0 && i < chain.length - 1 ? chain[i + 1] : null;
}

export interface MdgAuditEntry {
  entity: GovernedEntity;
  entityId: string;
  field: string;
  oldValue: unknown;
  newValue: unknown;
  changedBy: string;
  approvalBy?: string | null;
  reason?: string | null;
  at: string;
}

/** Build the immutable audit entry for an approved change. Pure. */
export function buildAuditEntry(req: MdgChangeRequest, changedBy: string, approvalBy: string, at: string): MdgAuditEntry {
  return { entity: req.entity, entityId: req.entityId, field: req.field, oldValue: req.oldValue, newValue: req.newValue, changedBy, approvalBy, reason: req.reason ?? null, at };
}
