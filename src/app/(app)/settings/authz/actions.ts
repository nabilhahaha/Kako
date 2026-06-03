'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireAuth, friendlyDbError, type ActionResult } from '@/lib/erp/guards';
import { logAudit } from '@/lib/erp/audit';
import { isDenyAllCapability } from '@/lib/erp/granular-capabilities';
import { isScopeDimension } from '@/lib/erp/scope';
import { isLimitAction } from '@/lib/erp/limits';
import { getFieldGovernanceAdmin } from '@/lib/erp/field-governance-server';
import { invalidateCompanyCopilotCache } from '@/lib/erp/copilot/copilot-live-context';

/**
 * VANTORA Authorization Console — write API (P3/P4/P6).
 *
 * SECURITY (critical): every action here is gated by requireCompanyAdmin(),
 * which allows ONLY Company Admins (a membership with role === 'admin') and the
 * Platform Owner. It deliberately does NOT gate on the generic `manager` role,
 * nor on any coarse permission. Tenant isolation: all writes stamp
 * company_id = ctx.companyId (the client-supplied company is never trusted);
 * RLS independently enforces isolation. Every mutation is audited.
 *
 * Section-access writes REUSE the existing field-governance server actions
 * (setFieldSectionAccess / removeFieldSectionAccess) and are not duplicated here.
 */

interface AdminGuard {
  ok: true;
  companyId: string;
  userId: string;
  supabase: Awaited<ReturnType<typeof createClient>>;
}

/** Company-Admin / Platform-Owner only. */
async function requireCompanyAdmin(): Promise<AdminGuard | { ok: false; error: string }> {
  const { ctx, error } = await requireAuth();
  if (error || !ctx) return { ok: false, error: 'unauthorized' };
  const isAdmin = ctx.isPlatformOwner === true || ctx.memberships.some((m) => m.role === 'admin');
  if (!isAdmin || !ctx.companyId) return { ok: false, error: 'unauthorized' };
  return { ok: true, companyId: ctx.companyId, userId: ctx.userId, supabase: await createClient() };
}

const REVALIDATE = '/settings/authz';

// ── A. Capability Matrix (P6) ────────────────────────────────────────────────

/** Grant or revoke one of the 8 deny-all capabilities for a role (company-scoped). */
export async function setCompanyCapability(
  roleKey: string,
  capability: string,
  enabled: boolean,
): Promise<ActionResult> {
  const g = await requireCompanyAdmin();
  if (!g.ok) return { ok: false, error: g.error };
  if (!isDenyAllCapability(capability)) return { ok: false, error: 'invalid_capability' };
  const { supabase, companyId } = g;

  if (enabled) {
    const { error } = await supabase
      .from('erp_company_role_permissions')
      .upsert(
        { company_id: companyId, role_key: roleKey, permission: capability },
        { onConflict: 'company_id,role_key,permission' },
      );
    if (error) return { ok: false, error: friendlyDbError(error) };
  } else {
    const { error } = await supabase
      .from('erp_company_role_permissions')
      .delete()
      .eq('company_id', companyId)
      .eq('role_key', roleKey)
      .eq('permission', capability);
    if (error) return { ok: false, error: friendlyDbError(error) };
  }

  await logAudit(supabase, {
    action: enabled ? 'grant' : 'revoke',
    entity: 'role_capability',
    entityId: `${roleKey}:${capability}`,
    details: { role_key: roleKey, capability },
    companyId,
  });
  invalidateCompanyCopilotCache(companyId);
  revalidatePath(REVALIDATE);
  return { ok: true };
}

// ── B. Per-user Scope (P3) ───────────────────────────────────────────────────

/** Set (or change) a user's declared scope for a role. */
export async function setUserScope(
  userId: string,
  roleKey: string,
  dimension: string,
  scopeSet: string[],
): Promise<ActionResult> {
  const g = await requireCompanyAdmin();
  if (!g.ok) return { ok: false, error: g.error };
  if (!isScopeDimension(dimension)) return { ok: false, error: 'invalid_dimension' };
  if (!userId || !roleKey) return { ok: false, error: 'invalid_subject' };
  const { supabase, companyId } = g;

  // scope_set only applies to the geo dimensions; clear it for the others.
  const geo = dimension === 'branch' || dimension === 'region' || dimension === 'area';
  const cleanSet = geo ? scopeSet.filter((v) => typeof v === 'string' && v) : [];

  const { error } = await supabase
    .from('erp_role_scope')
    .upsert(
      { company_id: companyId, user_id: userId, role_key: roleKey, dimension, scope_set: cleanSet },
      { onConflict: 'company_id,user_id,role_key' },
    );
  if (error) return { ok: false, error: friendlyDbError(error) };

  await logAudit(supabase, {
    action: 'update',
    entity: 'role_scope',
    entityId: `${userId}:${roleKey}`,
    details: { role_key: roleKey, dimension, scope_set: cleanSet },
    companyId,
  });
  invalidateCompanyCopilotCache(companyId);
  revalidatePath(REVALIDATE);
  return { ok: true };
}

/** Remove a user's scope assignment for a role (reverts to role-inferred default). */
export async function removeUserScope(userId: string, roleKey: string): Promise<ActionResult> {
  const g = await requireCompanyAdmin();
  if (!g.ok) return { ok: false, error: g.error };
  const { supabase, companyId } = g;

  const { error } = await supabase
    .from('erp_role_scope')
    .delete()
    .eq('company_id', companyId)
    .eq('user_id', userId)
    .eq('role_key', roleKey);
  if (error) return { ok: false, error: friendlyDbError(error) };

  await logAudit(supabase, {
    action: 'delete',
    entity: 'role_scope',
    entityId: `${userId}:${roleKey}`,
    details: { role_key: roleKey },
    companyId,
  });
  invalidateCompanyCopilotCache(companyId);
  revalidatePath(REVALIDATE);
  return { ok: true };
}

// ── C. Approval Limits (P4) ──────────────────────────────────────────────────

/** Upsert a numeric-authority rule for exactly one subject (user XOR role). */
export async function setRoleLimit(input: {
  userId?: string | null;
  roleKey?: string | null;
  action: string;
  maxAmount: number | null;
  maxPercent: number | null;
}): Promise<ActionResult> {
  const g = await requireCompanyAdmin();
  if (!g.ok) return { ok: false, error: g.error };
  const { supabase, companyId } = g;

  const userId = input.userId || null;
  const roleKey = input.roleKey || null;
  // exactly one subject.
  if ((userId === null) === (roleKey === null)) return { ok: false, error: 'invalid_subject' };
  if (!isLimitAction(input.action)) return { ok: false, error: 'invalid_action' };

  const { maxAmount, maxPercent } = input;
  if (maxAmount !== null && (Number.isNaN(maxAmount) || maxAmount < 0)) return { ok: false, error: 'invalid_range' };
  if (maxPercent !== null && (Number.isNaN(maxPercent) || maxPercent < 0 || maxPercent > 100))
    return { ok: false, error: 'invalid_range' };

  const { error } = await supabase
    .from('erp_role_limits')
    .upsert(
      { company_id: companyId, user_id: userId, role_key: roleKey, action: input.action, max_amount: maxAmount, max_percent: maxPercent },
      { onConflict: 'company_id,user_id,role_key,action' },
    );
  if (error) return { ok: false, error: friendlyDbError(error) };

  await logAudit(supabase, {
    action: 'update',
    entity: 'role_limit',
    entityId: `${userId ?? roleKey}:${input.action}`,
    details: { user_id: userId, role_key: roleKey, action: input.action, max_amount: maxAmount, max_percent: maxPercent },
    companyId,
  });
  invalidateCompanyCopilotCache(companyId);
  revalidatePath(REVALIDATE);
  return { ok: true };
}

/** Delete a limit rule by id (company-scoped — RLS also enforces tenancy). */
export async function removeRoleLimit(id: string): Promise<ActionResult> {
  const g = await requireCompanyAdmin();
  if (!g.ok) return { ok: false, error: g.error };
  const { supabase, companyId } = g;

  const { error } = await supabase
    .from('erp_role_limits')
    .delete()
    .eq('id', id)
    .eq('company_id', companyId);
  if (error) return { ok: false, error: friendlyDbError(error) };

  await logAudit(supabase, {
    action: 'delete',
    entity: 'role_limit',
    entityId: id,
    details: { id },
    companyId,
  });
  invalidateCompanyCopilotCache(companyId);
  revalidatePath(REVALIDATE);
  return { ok: true };
}

// ── D. Section Access (P5) ───────────────────────────────────────────────────
// The write actions (setFieldSectionAccess / removeFieldSectionAccess) are reused
// directly from the field-governance module — they are NOT duplicated here. This
// loader returns the per-entity sections + section-access rows + roles needed by
// the Section-Access tab, gated to Company-Admin / Platform-Owner.

export interface SectionAccessData {
  sections: Array<Record<string, unknown>>;
  sectionAccess: Array<{ section_key: string; subject_type: string; subject_key: string; access: string }>;
  roles: Array<{ key: string; name_ar: string | null }>;
}

export async function loadSectionAccess(entity: string): Promise<ActionResult<SectionAccessData>> {
  const g = await requireCompanyAdmin();
  if (!g.ok) return { ok: false, error: g.error };
  const admin = await getFieldGovernanceAdmin(g.supabase, entity);
  return {
    ok: true,
    data: { sections: admin.sections, sectionAccess: admin.sectionAccess, roles: admin.roles },
  };
}
