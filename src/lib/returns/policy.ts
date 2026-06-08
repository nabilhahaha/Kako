// ============================================================================
// Returns — company policy engine (Phase 4+). Pure. Company-configurable return
// creation controls (NO hardcoding): from-invoice-only, manual-with-approval,
// manual-without-approval, block-unknown-sales. Decides whether a return mode is
// allowed and whether it needs approval.
// ============================================================================

export type ReturnMode = 'from_invoice' | 'manual' | 'exception';

export interface ReturnPolicy {
  allowFromInvoiceOnly: boolean;
  allowManualWithApproval: boolean;
  allowManualWithoutApproval: boolean;
  blockUnknownSales: boolean;
}

export const DEFAULT_RETURN_POLICY: ReturnPolicy = {
  allowFromInvoiceOnly: true,
  allowManualWithApproval: false,
  allowManualWithoutApproval: false,
  blockUnknownSales: true,
};

export interface ReturnPermission {
  allowed: boolean;
  requiresApproval: boolean;
  reason?: string;
}

/** Decide whether a return of `mode` is allowed under `policy`. Pure. */
export function canCreateReturn(mode: ReturnMode, policy: ReturnPolicy = DEFAULT_RETURN_POLICY): ReturnPermission {
  if (mode === 'from_invoice') return { allowed: true, requiresApproval: false };
  if (mode === 'exception') {
    // Exceptional returns (no invoice / migration / correction) always need approval.
    return { allowed: true, requiresApproval: true };
  }
  // manual
  if (policy.allowFromInvoiceOnly && !policy.allowManualWithApproval && !policy.allowManualWithoutApproval) {
    return { allowed: false, requiresApproval: false, reason: 'manual returns are disabled (from-invoice only)' };
  }
  if (policy.allowManualWithoutApproval) return { allowed: true, requiresApproval: false };
  if (policy.allowManualWithApproval) return { allowed: true, requiresApproval: true };
  return { allowed: false, requiresApproval: false, reason: 'manual returns not permitted by policy' };
}
