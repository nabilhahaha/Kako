import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { hasPermission } from '@/lib/erp/permissions';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { getT } from '@/lib/i18n/server';
import { CreditRequestsManager, type CreditRequest } from './credit-requests-manager';

export default async function CreditRequestsPage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  const { t, locale } = await getT();
  if (!hasPermission(ctx, 'credit.request.approve') && !hasPermission(ctx, 'credit.request.create')) {
    return (
      <div>
        <PageHeader title={t('fmcgw1.creditRequestsTitle')} />
        <Card><CardContent className="p-8 text-center text-muted-foreground">{t('fmcgw1.notPermitted')}</CardContent></Card>
      </div>
    );
  }

  const supabase = await createClient();
  const { data } = await supabase
    .from('erp_credit_limit_requests')
    .select('id, customer_id, current_limit, requested_limit, approved_amount, status, reason, created_at, expiry_date')
    .order('created_at', { ascending: false })
    .limit(200);

  const rows = (data as CreditRequest[]) ?? [];
  const customerLabels: Record<string, string> = {};
  const customerIds = [...new Set(rows.map((r) => r.customer_id).filter(Boolean) as string[])];
  if (customerIds.length > 0) {
    const { data: custs } = await supabase
      .from('erp_customers')
      .select('id, code, name, name_ar')
      .in('id', customerIds);
    for (const c of (custs as { id: string; code: string; name: string; name_ar: string | null }[]) ?? []) {
      customerLabels[c.id] = (locale === 'ar' ? c.name_ar || c.name : c.name) || c.code;
    }
  }

  return (
    <div>
      <PageHeader title={t('fmcgw1.creditRequestsTitle')} description={t('fmcgw1.creditRequestsDescription')} />
      <CreditRequestsManager
        rows={rows}
        customerLabels={customerLabels}
        canApprove={hasPermission(ctx, 'credit.request.approve')}
      />
    </div>
  );
}
