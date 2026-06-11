import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { getT } from '@/lib/i18n/server';
import { INTL_LOCALE } from '@/lib/i18n/config';
import { ReportsView, type ReportsData } from './reports-view';

export const dynamic = 'force-dynamic';

/** Pharmacy Reports centre. */
export default async function PharmacyReportsPage() {
  const { t, locale } = await getT();
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  const perms = ctx.permissions as string[];
  if (!(perms.includes('reports.view') || ctx.memberships.some((m) => m.role === 'admin') || ctx.isSuperAdmin)) redirect('/dashboard');

  const supabase = await createClient();
  const { data } = await supabase.rpc('erp_pharmacy_reports', { p_days: 30 });

  return (
    <div>
      <PageHeader title={t('pharmReports.title')} description={t('pharmReports.description')} />
      <ReportsView data={(data ?? {}) as ReportsData} intlLocale={INTL_LOCALE[locale]} />
    </div>
  );
}
