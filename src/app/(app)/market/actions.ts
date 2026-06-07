'use server';

import { requirePermission, type ActionResult } from '@/lib/erp/guards';
import type { LineInput } from '@/lib/erp/sales-calc';
import type { PaymentMethod } from '@/lib/erp/types';
import { cashierCheckoutCore } from '@/lib/erp/sales/cashier-core';
import { getT } from '@/lib/i18n/server';
import { createClient } from '@/lib/supabase/server';

// Supermarket fast cashier: a walk-in sale against a default cash customer,
// reusing the invoice engine (stock-out + AR/Revenue + cash payment). The logic
// lives in cashierCheckoutCore so the reconciliation worker can replay an
// offline sale through the exact same audited path.

export async function cashierCheckout(input: {
  branch_id: string;
  lines: LineInput[];
  payment_method: PaymentMethod;
}): Promise<ActionResult<{ invoice_id: string; invoice_number: string; net: number }>> {
  const ctx = await requirePermission('market.pos');
  const { t } = await getT();
  const supabase = await createClient();
  return cashierCheckoutCore(supabase, { userId: ctx.userId, companyId: ctx.companyId }, t, input);
}
