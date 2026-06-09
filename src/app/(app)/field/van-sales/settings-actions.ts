'use server';

import { createClient } from '@/lib/supabase/server';
import { getUserContext } from '@/lib/erp/auth-context';
import { hasPermission } from '@/lib/erp/permissions';
import { logAudit } from '@/lib/erp/audit';
import { VAN_SALES_ENABLED } from '@/lib/van-sales';

/** ── Van Sales (Phase B) — per-tenant enablement + policy (admin) ───────────
 *  Company admins (settings.branches) turn Van Sales ON for their tenant and set
 *  the safe-by-default policy. The platform master switch (KAKO_VAN_SALES) must
 *  also be ON for anything to go live — this only manages the company toggle. */

export interface VanSalesSettingsInput {
  isEnabled: boolean;
  requirePhysicalCountOnClose?: boolean;
  allowNegativeVanStock?: boolean;
  autoConfirmDirectLoad?: boolean;
  discountCapPct?: number | null;
}

export async function setVanSalesSettings(input: VanSalesSettingsInput): Promise<{ ok: boolean; error?: string }> {
  if (!VAN_SALES_ENABLED()) return { ok: false, error: 'disabled' };

  const ctx = await getUserContext();
  if (!ctx) return { ok: false, error: 'unauthorized' };
  if (!ctx.companyId) return { ok: false, error: 'no company' };
  if (!hasPermission(ctx, 'settings.branches') && !ctx.isSuperAdmin) return { ok: false, error: 'unauthorized' };

  const supabase = await createClient();
  const payload = {
    company_id: ctx.companyId,
    is_enabled: input.isEnabled,
    require_physical_count_on_close: input.requirePhysicalCountOnClose ?? true,
    allow_negative_van_stock: input.allowNegativeVanStock ?? false,
    auto_confirm_direct_load: input.autoConfirmDirectLoad ?? false,
    discount_cap_pct: input.discountCapPct ?? null,
    updated_by: ctx.userId,
  };
  const { error } = await supabase.from('erp_van_sales_settings').upsert(payload, { onConflict: 'company_id' });
  if (error) return { ok: false, error: error.message };

  await logAudit(supabase, {
    action: input.isEnabled ? 'enable' : 'disable',
    entity: 'van_sales_settings',
    entityId: ctx.companyId,
    details: payload,
    companyId: ctx.companyId,
  });
  return { ok: true };
}
