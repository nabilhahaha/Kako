import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * VANTORA — critical-action notification delivery.
 *
 * After a governed action commits, the responsible managers are notified through
 * the existing `erp_notify` RPC (which writes `erp_notifications`, RLS-scoped to
 * the tenant). This is best-effort: a notification failure must never break the
 * underlying business action.
 *
 * Targeting today is governance-level (company admins + managers + supervisors).
 * Precise per-target routing (finance, inventory_controller, the assigned
 * salesman, …) is delivered with the `erp_action_policies` slice, where each
 * tenant maps a catalog action's notifyTargets to concrete recipients.
 */

/** DB role keys that should receive governance notifications. */
const GOVERNANCE_ROLES = ['admin', 'manager', 'supervisor', 'area_manager'];

export interface ActionNotice {
  /** Notification type tag, e.g. 'critical_action'. */
  type: string;
  titleAr: string;
  titleEn: string;
  body: string;
  /** Deep link to the affected record/screen. */
  link?: string | null;
  /** Audit entity + record id, for the notification's reference. */
  entity?: string | null;
  recordId?: string | null;
}

/** Resolve the governance recipients in a company and fan out an `erp_notify`. */
export async function notifyManagers(
  supabase: SupabaseClient,
  companyId: string | null | undefined,
  notice: ActionNotice,
): Promise<void> {
  if (!companyId) return;
  try {
    // Distinct users holding a governance role anywhere in the company.
    const { data } = await supabase
      .from('erp_user_branches')
      .select('user_id, role, branch:erp_branches!inner(company_id)')
      .eq('branch.company_id', companyId)
      .in('role', GOVERNANCE_ROLES);

    const userIds = [
      ...new Set(((data ?? []) as Array<{ user_id: string }>).map((r) => r.user_id)),
    ];
    if (userIds.length === 0) return;

    await Promise.all(
      userIds.map((uid) =>
        supabase.rpc('erp_notify', {
          p_company: companyId,
          p_user: uid,
          p_type: notice.type,
          p_title_ar: notice.titleAr,
          p_title_en: notice.titleEn,
          p_body: notice.body,
          p_link: notice.link ?? null,
          p_entity: notice.entity ?? null,
          p_record_id: notice.recordId ?? null,
        }),
      ),
    );
  } catch {
    // swallow — notification delivery must never block the action.
  }
}
