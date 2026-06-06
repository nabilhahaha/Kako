'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireAuth, canAny, friendlyDbError, type ActionResult } from '@/lib/erp/guards';
import { logAudit } from '@/lib/erp/audit';
import { getT } from '@/lib/i18n/server';

const PRINT_MANAGE = ['settings.users', 'fashion.manage', 'fashion.cashbox'];

/** Save the store's receipt/printer preferences on the per-company ops settings.
 *  Tenant-scoped + audited. No platform/admin data. */
export async function updatePrintSettings(formData: FormData): Promise<ActionResult> {
  const { ctx, error: authErr } = await requireAuth();
  if (authErr) return { ok: false, error: authErr };
  const { t } = await getT();
  if (!canAny(ctx!, PRINT_MANAGE)) return { ok: false, error: t('settings.printer.errNoPermission') };
  if (!ctx!.companyId) return { ok: false, error: t('settings.printer.errNoCompany') };

  const paper = String(formData.get('receipt_paper') || '80mm');
  const supabase = await createClient();
  const { error } = await supabase
    .from('erp_ops_settings')
    .upsert(
      {
        company_id: ctx!.companyId,
        receipt_paper: ['80mm', '58mm', 'A4'].includes(paper) ? paper : '80mm',
        receipt_header: String(formData.get('receipt_header') || '').trim() || null,
        receipt_footer: String(formData.get('receipt_footer') || '').trim() || null,
        show_logo: String(formData.get('show_logo') || '') === 'true',
        show_tax_number: String(formData.get('show_tax_number') || '') === 'true',
      },
      { onConflict: 'company_id' },
    );
  if (error) return { ok: false, error: friendlyDbError(error) };

  await logAudit(supabase, { action: 'store.print_settings_updated', entity: 'erp_ops_settings', entityId: ctx!.companyId, companyId: ctx!.companyId });
  revalidatePath('/settings/printer');
  return { ok: true };
}
