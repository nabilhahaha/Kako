'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requirePermission, friendlyDbError, type ActionResult } from '@/lib/erp/guards';
import { getT } from '@/lib/i18n/server';

// Route Accounting — add a van/route expense (Phase 7A UI wiring). Writes to
// erp_van_expenses (company-scoped via RLS + explicit company_id on insert).
export async function addVanExpense(formData: FormData): Promise<ActionResult> {
  const { t } = await getT();
  const ctx = await requirePermission('reports.view');
  if (!ctx.companyId) return { ok: false, error: t('distribution.noCompany') };

  const amount = Number(formData.get('amount'));
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, error: t('distribution.vanAccAmountRequired') };

  const categoryId = String(formData.get('category_id') || '').trim() || null;
  const notes = String(formData.get('notes') || '').trim() || null;
  const warehouseId = String(formData.get('warehouse_id') || '').trim() || null;

  const supabase = await createClient();
  const { error } = await supabase.from('erp_van_expenses').insert({
    company_id: ctx.companyId,
    warehouse_id: warehouseId,
    category_id: categoryId,
    amount,
    notes,
    expense_date: new Date().toISOString().slice(0, 10),
  });
  if (error) return { ok: false, error: friendlyDbError(error) };

  revalidatePath('/distribution/van-accounting');
  return { ok: true };
}
