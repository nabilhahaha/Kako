'use server';

import { createClient } from '@/lib/supabase/server';
import { requireAuth, canAny, type ActionResult } from '@/lib/erp/guards';
import { logAudit } from '@/lib/erp/audit';
import { getT } from '@/lib/i18n/server';

const BACKUP_MANAGE = ['settings.users', 'fashion.manage', 'fashion.reports'];
const CAP = 20000;

/**
 * Export a backup of the store's own data as JSON (no platform/admin data — only
 * this company's rows, RLS-scoped). Store-owner friendly: one download they can
 * keep. Audited.
 */
export async function exportBackup(): Promise<ActionResult<{ filename: string; json: string }>> {
  const { ctx, error: authErr } = await requireAuth();
  if (authErr) return { ok: false, error: authErr };
  const { t } = await getT();
  if (!canAny(ctx!, BACKUP_MANAGE)) return { ok: false, error: t('settings.backup.errNoPermission') };

  const supabase = await createClient();
  const grab = async (table: string, cols = '*') =>
    ((await supabase.from(table).select(cols).limit(CAP)).data ?? []) as unknown[];

  const [company, products, customers, suppliers, invoices, invoiceLines, installmentPlans, installmentSchedule, salesReturns, expenses] =
    await Promise.all([
      ctx!.companyId ? supabase.from('erp_companies').select('*').eq('id', ctx!.companyId).maybeSingle().then((r) => r.data) : Promise.resolve(null),
      grab('erp_products_catalog'),
      grab('erp_customers'),
      grab('erp_suppliers'),
      grab('erp_invoices'),
      grab('erp_invoice_lines'),
      grab('erp_installment_plans'),
      grab('erp_installment_schedule'),
      grab('erp_sales_returns'),
      grab('erp_expenses'),
    ]);

  const backup = {
    meta: { exported_at: new Date().toISOString(), company_id: ctx!.companyId, version: 1 },
    company,
    products, customers, suppliers,
    invoices, invoice_lines: invoiceLines,
    installment_plans: installmentPlans, installment_schedule: installmentSchedule,
    sales_returns: salesReturns, expenses,
  };

  await logAudit(supabase, { action: 'store.backup_exported', entity: 'erp_companies', entityId: ctx!.companyId, companyId: ctx!.companyId });
  const stamp = new Date().toISOString().slice(0, 10);
  return { ok: true, data: { filename: `store-backup-${stamp}.json`, json: JSON.stringify(backup, null, 2) } };
}
