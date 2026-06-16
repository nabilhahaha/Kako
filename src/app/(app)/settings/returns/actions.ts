'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireAuth, type ActionResult } from '@/lib/erp/guards';
import { logAudit } from '@/lib/erp/audit';
import type { PolicyMode, ReturnDecision, ApprovalLevel } from '@/lib/van-sales/return-policy';

// Return Approval policy + rules configuration (Company-Admin / Platform-Owner).
// Company-scoped server-side; RLS independently isolates tenants. Audited. This is
// the data the pure resolver (resolveReturnDecision) reads — nothing hardcoded.

interface AdminGuard { ok: true; companyId: string; userId: string; supabase: Awaited<ReturnType<typeof createClient>> }

async function requireCompanyAdmin(): Promise<AdminGuard | { ok: false; error: string }> {
  const { ctx, error } = await requireAuth();
  if (error || !ctx) return { ok: false, error: 'unauthorized' };
  const isAdmin = ctx.isPlatformOwner === true || ctx.memberships.some((m) => m.role === 'admin');
  if (!isAdmin || !ctx.companyId) return { ok: false, error: 'unauthorized' };
  return { ok: true, companyId: ctx.companyId, userId: ctx.userId, supabase: await createClient() };
}

const MODES: PolicyMode[] = ['disabled', 'open', 'approval'];
const RESULTS: ReturnDecision[] = ['auto', 'approval', 'block'];
const LEVELS: ApprovalLevel[] = ['supervisor', 'branch_manager', 'company_admin'];
const TYPES = ['saleable', 'damage'] as const;

export interface ReturnPolicyInput {
  mode: PolicyMode;
  approverRole: ApprovalLevel | null;
  backupApproverRole: ApprovalLevel | null;
}

/** Upsert the company's return-approval policy (mode + default primary/backup approver). */
export async function saveReturnPolicy(input: ReturnPolicyInput): Promise<ActionResult> {
  const g = await requireCompanyAdmin();
  if (!g.ok) return { ok: false, error: g.error };
  if (!MODES.includes(input.mode)) return { ok: false, error: 'invalid_mode' };

  const { error } = await g.supabase.from('erp_return_approval_policies').upsert({
    company_id: g.companyId,
    mode: input.mode,
    approver_role: input.approverRole,
    backup_approver_role: input.backupApproverRole,
    updated_at: new Date().toISOString(),
    updated_by: g.userId,
  }, { onConflict: 'company_id' });
  if (error) return { ok: false, error: error.message };

  await logAudit(g.supabase, { action: 'return_policy.update', entity: 'return_policy', entityId: g.companyId, details: { mode: input.mode, approver: input.approverRole, backup: input.backupApproverRole }, companyId: g.companyId });
  revalidatePath('/settings/returns');
  return { ok: true };
}

export interface ReturnRuleInput {
  id?: string;
  priority: number;
  active: boolean;
  returnType: string | null;
  minValue: number | null;
  maxValue: number | null;
  customerId: string | null;
  customerClass: string | null;
  salesmanId: string | null;
  routeId: string | null;
  productCategoryId: string | null;
  result: ReturnDecision;
  approverLevel: ApprovalLevel | null;
  backupApproverLevel: ApprovalLevel | null;
}

/** Insert or update one approval rule. */
export async function saveReturnRule(input: ReturnRuleInput): Promise<ActionResult<{ id: string }>> {
  const g = await requireCompanyAdmin();
  if (!g.ok) return { ok: false, error: g.error };
  if (!RESULTS.includes(input.result)) return { ok: false, error: 'invalid_result' };
  if (input.returnType && !TYPES.includes(input.returnType as (typeof TYPES)[number])) return { ok: false, error: 'invalid_type' };
  if (input.approverLevel && !LEVELS.includes(input.approverLevel)) return { ok: false, error: 'invalid_level' };
  if (input.backupApproverLevel && !LEVELS.includes(input.backupApproverLevel)) return { ok: false, error: 'invalid_level' };
  if (input.minValue != null && input.maxValue != null && input.minValue > input.maxValue) return { ok: false, error: 'invalid_band' };

  const row = {
    company_id: g.companyId,
    priority: Math.trunc(Number(input.priority) || 100),
    active: input.active !== false,
    return_type: input.returnType || null,
    min_value: input.minValue,
    max_value: input.maxValue,
    customer_id: input.customerId || null,
    customer_class: input.customerClass || null,
    salesman_id: input.salesmanId || null,
    route_id: input.routeId || null,
    product_category_id: input.productCategoryId || null,
    result: input.result,
    approver_level: input.approverLevel || null,
    backup_approver_level: input.backupApproverLevel || null,
  };

  let id = input.id;
  if (id) {
    const { error } = await g.supabase.from('erp_return_approval_rules').update(row).eq('id', id).eq('company_id', g.companyId);
    if (error) return { ok: false, error: error.message };
  } else {
    const { data, error } = await g.supabase.from('erp_return_approval_rules').insert({ ...row, created_by: g.userId }).select('id').single();
    if (error) return { ok: false, error: error.message };
    id = (data as { id: string }).id;
  }
  await logAudit(g.supabase, { action: 'return_rule.save', entity: 'return_rule', entityId: id!, details: { result: input.result, priority: row.priority }, companyId: g.companyId });
  revalidatePath('/settings/returns');
  return { ok: true, data: { id: id! } };
}

/** Delete one approval rule. */
export async function deleteReturnRule(id: string): Promise<ActionResult> {
  const g = await requireCompanyAdmin();
  if (!g.ok) return { ok: false, error: g.error };
  const { error } = await g.supabase.from('erp_return_approval_rules').delete().eq('id', id).eq('company_id', g.companyId);
  if (error) return { ok: false, error: error.message };
  await logAudit(g.supabase, { action: 'return_rule.delete', entity: 'return_rule', entityId: id, companyId: g.companyId });
  revalidatePath('/settings/returns');
  return { ok: true };
}
