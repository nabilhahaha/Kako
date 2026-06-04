/** Pure gating helper modelling the permission contract every FMCG Wave 1 server
 *  action enforces: requireAuth → if !ctx return {ok:false,error}; if the caller
 *  lacks the action's permission return {ok:false,error:'unauthorized'}; else
 *  proceed. The server actions wire this through requireAuth + createClient; this
 *  helper isolates the *decision* so the gating shape is unit-testable without a
 *  Supabase client. Keep the map in sync with actions.ts. */
import { hasPermission, type Permission, type PermissionContext } from './permissions';

export type GateDecision =
  | { ok: true }
  | { ok: false; error: string };

/** The granular permission(s) each FMCG Wave 1 action requires (ANY-of). */
export const FMCG_ACTION_PERMS = {
  searchProducts: ['product.search'],
  searchCustomers: ['customers.manage'],
  resolvePriceAction: ['pricing.view'],
  uomToBaseAction: ['pricing.view'],
  upsertPrice: ['pricing.manage'],
  deletePrice: ['pricing.manage'],
  upsertProductUom: ['uom.manage'],
  deleteProductUom: ['uom.manage'],
  listProductUoms: ['uom.manage', 'pricing.view'],
  upsertTarget: ['target.manage'],
  deleteTarget: ['target.manage'],
  targetAchievement: ['target.view'],
  upsertReturnReason: ['return.reason.manage'],
  deleteReturnReason: ['return.reason.manage'],
  returnsByReason: ['reports.view', 'report.aggregate.view'],
  computeVanReconciliation: ['reconciliation.manage'],
  settleVanReconciliation: ['reconciliation.approve'],
  rejectVanReconciliation: ['reconciliation.approve'],
  requestCreditLimit: ['credit.request.create'],
  decideCreditLimit: ['credit.request.approve'],
  salesSummary: ['report.aggregate.view'],
  coverageSummary: ['report.aggregate.view'],
} satisfies Record<string, Permission[]>;

export type FmcgAction = keyof typeof FMCG_ACTION_PERMS;

/** Decide whether `ctx` may run `action`. `ctx === null` ⇒ not authenticated. */
export function gateFmcgAction(
  ctx: PermissionContext | null,
  action: FmcgAction,
): GateDecision {
  if (!ctx) return { ok: false, error: 'unauthenticated' };
  const perms = FMCG_ACTION_PERMS[action];
  const allowed = perms.some((p) => hasPermission(ctx, p));
  return allowed ? { ok: true } : { ok: false, error: 'unauthorized' };
}
