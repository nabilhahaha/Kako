/**
 * P1 approval-engine feature flags (default OFF — backward-compatible).
 *
 * Each flag activates routing of ONE workflow through the configurable engine +
 * governance foundation. When OFF, the legacy behaviour is preserved exactly:
 *   • credit-limit → the legacy company_admin workflow definition,
 *   • trade-spend  → the direct approve/cancel status actions,
 *   • price-change → direct edit only (no approval).
 * Mirrors the existing env-flag convention (KAKO_TRADE_SPEND, KAKO_VAN_SALES…).
 */
const on = (v: string | undefined): boolean => v === '1' || v === 'true';

/** Route credit-limit requests through the v2 (permission + threshold + governance) workflow. */
export const APPROVAL_CREDIT_V2 = (): boolean => on(process.env.KAKO_APPROVAL_CREDIT);
/** Route trade-spend approvals through the engine (vs the direct status actions). */
export const APPROVAL_TRADE_SPEND_WF = (): boolean => on(process.env.KAKO_APPROVAL_TRADE_SPEND);
/** Enable price-change-request approvals through the engine. */
export const APPROVAL_PRICE_CHANGE_WF = (): boolean => on(process.env.KAKO_APPROVAL_PRICE_CHANGE);
/** P3: surface engine workflow tasks inside the unified Approval Queue. */
export const UNIFIED_INBOX = (): boolean => on(process.env.KAKO_UNIFIED_INBOX);

/** The credit-limit workflow definition key — v2 when flagged on, else legacy.
 *  Pure (testable) selector so the routing decision is unit-covered. */
export function creditWorkflowKey(flagOn: boolean = APPROVAL_CREDIT_V2()): string {
  return flagOn ? 'credit_limit_approval_v2' : 'credit_limit_approval';
}
